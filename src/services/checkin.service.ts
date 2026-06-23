import type { IScheduleRepository, IPersonRepository, ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { canAccessPerson } from './person.service';
import { toRosterEntry, type RosterEntry } from '../api/dto/person.dto';
import { NotFoundError, BadRequestError } from '../core/errors/app-error';
import { zonedNow } from '../utils/date';

const DEFAULT_TZ = 'Australia/Brisbane';

export interface CheckInSession {
  id: string;
  label: string;
  day: string;
  startTime: string;
  location: string | null;
}

export interface SessionStatus {
  session: CheckInSession;
  roster: RosterEntry[];
  checkedInCount: number;
  totalCount: number;
}

export interface CheckInService {
  getSessions(): Promise<CheckInSession[]>;
  getCurrentSession(): Promise<CheckInSession | null>;
  getSessionStatus(actor: Actor, sessionId: string): Promise<SessionStatus>;
}

export function makeCheckInService(
  scheduleRepo: IScheduleRepository,
  personRepo: IPersonRepository,
  settingsRepo: ISettingsRepository,
): CheckInService {
  async function campTimezone(): Promise<string> {
    const settings = await settingsRepo.getSingleton();
    return settings?.timezone || DEFAULT_TZ;
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

  async function getSessions(): Promise<CheckInSession[]> {
    const items = await scheduleRepo.getCheckInPoints();
    return items.map(scheduleItemToSession);
  }

  return {
    getSessions,

    async getCurrentSession() {
      const items = await scheduleRepo.getCheckInPoints();
      items.sort((a, b) => a.day.localeCompare(b.day) || a.startTime.localeCompare(b.startTime));
      const { date: todayStr, time: nowTime } = zonedNow(await campTimezone());
      const todayPast = items.filter((i) => i.day === todayStr && i.startTime <= nowTime);
      if (todayPast.length > 0) return scheduleItemToSession(todayPast[todayPast.length - 1]!);
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
      const allPeople = await personRepo.findAll();
      const scoped = allPeople.filter((p) => p.atCamp && canAccessPerson(actor, p));
      const roster: RosterEntry[] = scoped.map((p) => toRosterEntry(p, sessionId));
      const checkedInCount = roster.filter((r) => r.checkedIn).length;

      return {
        session,
        roster,
        checkedInCount,
        totalCount: roster.length,
      };
    },
  };
}
