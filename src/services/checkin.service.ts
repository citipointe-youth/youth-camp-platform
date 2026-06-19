import type { IScheduleRepository, ICamperRepository, ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Camper, CheckInEntry } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import { assertCan, canAccessCamper } from './access-control';
import { NotFoundError, BadRequestError } from '../core/errors/app-error';
import { CheckInInputSchema } from '../core/validation/checkin.schema';
import { newId } from '../utils/id';
import { nowISO, zonedNow } from '../utils/date';

const DEFAULT_TZ = 'Australia/Brisbane';

export interface CheckInSession {
  id: string;
  label: string;
  day: string;
  startTime: string;
  location: string | null;
}

export interface SessionRosterEntry {
  camperId: string;
  firstName: string;
  lastName: string;
  church: string;
  zone: string;
  checkedIn: boolean;
  lastEntry: CheckInEntry | null;
}

export interface SessionStatus {
  session: CheckInSession;
  roster: SessionRosterEntry[];
  checkedInCount: number;
  totalCount: number;
}

export interface CheckInService {
  getSessions(): Promise<CheckInSession[]>;
  getCurrentSession(): Promise<CheckInSession | null>;
  getSessionStatus(actor: Actor, sessionId: string): Promise<SessionStatus>;
  checkIn(actor: Actor, input: unknown): Promise<Camper>;
}

export function makeCheckInService(
  scheduleRepo: IScheduleRepository,
  camperRepo: ICamperRepository,
  settingsRepo: ISettingsRepository,
): CheckInService {
  // The camp's wall-clock zone drives "today" + "now" for session selection (B3).
  async function campTimezone(): Promise<string> {
    const settings = await settingsRepo.getSingleton();
    return settings?.timezone || DEFAULT_TZ;
  }
  async function getSessions(): Promise<CheckInSession[]> {
    const items = await scheduleRepo.getCheckInPoints();
    return items.map((i) => ({
      id: i.id,
      label: i.title,
      day: i.day,
      startTime: i.startTime,
      location: i.location ?? null,
    }));
  }

  function scheduleItemToSession(item: ScheduleItem): CheckInSession {
    return {
      id: item.id,
      label: item.title,
      day: item.day,
      startTime: item.startTime,
      location: item.location ?? null,
    };
  }

  return {
    getSessions,

    async getCurrentSession() {
      const items = await scheduleRepo.getCheckInPoints();
      // Sort chronologically so AM comes before PM on the same day
      items.sort((a, b) => a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime));
      // B3 FIX: derive BOTH today's date and the wall-clock time from the camp's
      // timezone (was a UTC date + server-local time mix that rolled the day at
      // ~10am local on a UTC host).
      const { date: todayStr, time: nowTime } = zonedNow(await campTimezone());
      // Find the last check-in point on today whose startTime has already passed
      const todayPast = items.filter((i) => i.day === todayStr && i.startTime <= nowTime);
      if (todayPast.length > 0) return scheduleItemToSession(todayPast[todayPast.length - 1]!);
      // Otherwise first session today (pre-start), or first overall
      const todayFirst = items.find((i) => i.day === todayStr);
      if (todayFirst) return scheduleItemToSession(todayFirst);
      return items.length > 0 ? scheduleItemToSession(items[items.length - 1]!) : null;
    },

    async getSessionStatus(actor, sessionId) {
      assertCan(actor, 'checkin:write');
      const item = await scheduleRepo.findById(sessionId);
      if (!item) throw new NotFoundError('Session not found');
      if (!item.isCheckInPoint) throw new BadRequestError('This schedule item is not a check-in point');

      const session = scheduleItemToSession(item);
      const allCampers = await camperRepo.findAll();
      const scoped = allCampers.filter((c) => canAccessCamper(actor, c));

      const roster: SessionRosterEntry[] = scoped.map((c) => {
        const entries = c.checkInHistory.filter((e) => e.sessionId === sessionId);
        const lastEntry = entries.length > 0 ? entries[entries.length - 1]! : null;
        const checkedIn = lastEntry?.type === 'in';
        return {
          camperId: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          church: c.churchName,
          zone: c.zone,
          checkedIn,
          lastEntry,
        };
      });

      const checkedInCount = roster.filter((r) => r.checkedIn).length;

      return {
        session,
        roster,
        checkedInCount,
        totalCount: roster.length,
      };
    },

    async checkIn(actor, input) {
      assertCan(actor, 'checkin:write');
      const { camperId, sessionId, type } = CheckInInputSchema.parse(input);

      const camper = await camperRepo.findById(camperId);
      if (!camper) throw new NotFoundError('Camper not found');

      const session = await scheduleRepo.findById(sessionId);
      if (!session) throw new NotFoundError('Session not found');

      const entry: CheckInEntry = {
        id: newId('ci'),
        sessionId,
        sessionLabel: session.title,
        type,
        leaderId: actor.id,
        timestamp: nowISO(),
      };

      const updated: Camper = {
        ...camper,
        checkInHistory: [...camper.checkInHistory, entry],
        atCamp: type === 'in' ? true : camper.atCamp,
        status: type === 'in' ? 'checked_in' : 'checked_out',
        updatedAt: nowISO(),
      };

      return camperRepo.save(updated);
    },
  };
}
