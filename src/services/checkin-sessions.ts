// Daily check-in sessions, derived purely from the camp's check-in days.
//
// Check-in is intentionally UNRELATED to the schedule (the schedule communicates the
// camp plan; check-in is the twice-daily roll-call). Each camp day has exactly two
// sessions — Morning and Afternoon — so leaders can check youth in whenever it suits
// the morning/afternoon rhythm. Session id is `${day}~am` / `${day}~pm` and is the key
// used in `Person.checkInHistory[].sessionId`. The delimiter is `~` (URL-safe) — NOT
// `#`, which a browser would treat as a URL fragment when the id is put in a path.

export interface CheckInSession {
  id: string;
  label: string;
  day: string;
  startTime: string;
  location: string | null;
}

export const CHECKIN_PERIODS = [
  { sfx: 'am' as const, label: 'AM', startTime: '08:00' },
  { sfx: 'pm' as const, label: 'PM', startTime: '13:00' },
] as const;

// Before this clock time (camp tz) the Morning session is "current"; at/after it the
// Afternoon session is.
const PM_FROM = '12:00';

function weekdayShort(day: string): string {
  try {
    return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  } catch {
    return day;
  }
}

export function sessionFor(day: string, sfx: 'am' | 'pm'): CheckInSession {
  const p = CHECKIN_PERIODS.find((x) => x.sfx === sfx) ?? CHECKIN_PERIODS[0];
  return { id: `${day}~${sfx}`, label: `${weekdayShort(day)} ${p.label}`, day, startTime: p.startTime, location: null };
}

// AC-1: youth arrive at lunch on the first day and depart at lunch on the last day, so
// the first camp day generates a PM session only and the last camp day an AM session only.
// Interior days keep both AM and PM. A single-day camp is treated as an arrival day → PM only
// (the first-day rule wins over the last-day rule when they coincide).
export function buildSessions(checkInDays: readonly string[]): CheckInSession[] {
  const days = [...checkInDays].sort();
  const last = days.length - 1;
  return days.flatMap((d, i) => {
    if (i === 0) return [sessionFor(d, 'pm')];
    if (i === last) return [sessionFor(d, 'am')];
    return CHECKIN_PERIODS.map((p) => sessionFor(d, p.sfx));
  });
}

export function parseSessionId(id: string): { day: string; sfx: 'am' | 'pm' } | null {
  const m = /^(.+)~(am|pm)$/.exec(id);
  if (!m) return null;
  return { day: m[1] as string, sfx: m[2] as 'am' | 'pm' };
}

// The session a leader should land on now: today's AM before midday / PM after; if no
// session today, the most recent past session; otherwise the first upcoming one.
export function currentSession(
  checkInDays: readonly string[],
  todayStr: string,
  nowTime: string,
): CheckInSession | null {
  const sessions = buildSessions(checkInDays);
  if (sessions.length === 0) return null;
  const todays = sessions.filter((s) => s.day === todayStr);
  if (todays.length > 0) {
    const wantPm = nowTime >= PM_FROM;
    return todays.find((s) => s.id.endsWith(wantPm ? '~pm' : '~am')) ?? todays[0]!;
  }
  const past = sessions.filter((s) => s.day < todayStr);
  if (past.length > 0) return past[past.length - 1]!;
  return sessions[0]!;
}
