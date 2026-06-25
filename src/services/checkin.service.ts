import type { IPersonRepository, ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { canAccessPerson } from './person.service';
import { toRosterEntry, type RosterEntry } from '../api/dto/person.dto';
import { NotFoundError } from '../core/errors/app-error';
import { zonedNow } from '../utils/date';
import {
  buildSessions,
  currentSession as pickCurrentSession,
  parseSessionId,
  sessionFor,
  type CheckInSession,
} from './checkin-sessions';

export type { CheckInSession } from './checkin-sessions';

const DEFAULT_TZ = 'Australia/Brisbane';

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

// Sessions come from the camp's check-in days (settings), NOT the schedule — two per
// day (Morning / Afternoon). See checkin-sessions.ts for the rationale.
export function makeCheckInService(
  personRepo: IPersonRepository,
  settingsRepo: ISettingsRepository,
): CheckInService {
  async function ctx(): Promise<{ days: string[]; tz: string }> {
    const settings = await settingsRepo.getSingleton();
    return { days: settings?.checkInDays ?? [], tz: settings?.timezone || DEFAULT_TZ };
  }

  return {
    async getSessions() {
      const { days } = await ctx();
      return buildSessions(days);
    },

    async getCurrentSession() {
      const { days, tz } = await ctx();
      const { date, time } = zonedNow(tz);
      return pickCurrentSession(days, date, time);
    },

    async getSessionStatus(actor, sessionId) {
      assertCan(actor, 'checkin:write');
      const parsed = parseSessionId(sessionId);
      const { days } = await ctx();
      if (!parsed || !days.includes(parsed.day)) throw new NotFoundError('Session not found');

      const session = sessionFor(parsed.day, parsed.sfx);
      const allPeople = await personRepo.findAll();
      const scoped = allPeople.filter((p) => p.atCamp && canAccessPerson(actor, p));
      const roster: RosterEntry[] = scoped.map((p) => toRosterEntry(p, sessionId));
      const checkedInCount = roster.filter((r) => r.checkedIn).length;

      return { session, roster, checkedInCount, totalCount: roster.length };
    },
  };
}
