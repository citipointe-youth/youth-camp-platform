export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * The current calendar date + wall-clock time in a given IANA timezone (defect B3).
 *
 * The old check-in / dashboard code derived "today" from `toISOString()` (UTC date)
 * but the time from `getHours()` (server-LOCAL) — inconsistent, and both wrong for a
 * camp running in (say) Australia/Brisbane on a UTC host, where the UTC date rolls
 * over at ~10am local. This computes BOTH from the same zone via Intl, so a session
 * comparison is internally consistent and matches the operator's wall clock.
 *
 * Returns { date: 'YYYY-MM-DD', time: 'HH:MM' } in the target zone. Falls back to the
 * host's local values if the timezone is invalid/unsupported.
 */
export function zonedNow(timezone: string, at: Date = new Date()): { date: string; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(at);
    const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    let hour = get('hour');
    if (hour === '24') hour = '00'; // some engines emit '24' for midnight
    const minute = get('minute');
    return { date: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
  } catch {
    const d = at;
    const pad = (n: number): string => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  }
}

/** Today's date (YYYY-MM-DD) in the given timezone. */
export function zonedToday(timezone: string, at: Date = new Date()): string {
  return zonedNow(timezone, at).date;
}

export function daysUntil(isoDate: string, tz: string): number {
  // Days until `isoDate`, negative if past — measured from "today" in the camp's
  // timezone (B3: previously ignored the tz arg and used the host's local date).
  try {
    const today = zonedToday(tz);
    const start = new Date(today + 'T00:00:00Z').getTime();
    const target = new Date(isoDate + 'T00:00:00Z').getTime();
    return Math.round((target - start) / 86400000);
  } catch {
    return 0;
  }
}

export function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export function ageFromDob(dob: string): number | null {
  try {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  } catch {
    return null;
  }
}
