import { describe, it, expect } from 'vitest';
import { zonedNow, zonedToday, daysUntil } from './date';

// ---------------------------------------------------------------------------
// Timezone-aware date helpers (defect B3). The key property: date AND time are
// derived from the SAME zone, so they never disagree the way the old UTC-date +
// local-time mix did. Tests use fixed instants to stay deterministic.
// ---------------------------------------------------------------------------

describe('zonedNow', () => {
  it('derives date + time in the target zone (Brisbane is UTC+10, no DST)', () => {
    // 2026-07-01T23:30:00Z -> Brisbane 2026-07-02 09:30
    const at = new Date('2026-07-01T23:30:00Z');
    expect(zonedNow('Australia/Brisbane', at)).toEqual({ date: '2026-07-02', time: '09:30' });
  });

  it('returns UTC values when zone is UTC', () => {
    const at = new Date('2026-07-01T08:05:00Z');
    expect(zonedNow('UTC', at)).toEqual({ date: '2026-07-01', time: '08:05' });
  });

  it('crosses the date boundary correctly for a western zone', () => {
    // 2026-07-01T02:00:00Z -> Los Angeles (UTC-7 in summer) 2026-06-30 19:00
    const at = new Date('2026-07-01T02:00:00Z');
    expect(zonedNow('America/Los_Angeles', at)).toEqual({ date: '2026-06-30', time: '19:00' });
  });

  it('normalises midnight to 00:00 (not 24:00)', () => {
    const at = new Date('2026-07-01T14:00:00Z'); // Brisbane 2026-07-02 00:00
    expect(zonedNow('Australia/Brisbane', at)).toEqual({ date: '2026-07-02', time: '00:00' });
  });

  it('falls back to host-local values for an invalid timezone (no throw)', () => {
    const at = new Date('2026-07-01T12:00:00Z');
    const r = zonedNow('Not/AZone', at);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('zonedToday', () => {
  it('returns just the date portion in the zone', () => {
    expect(zonedToday('Australia/Brisbane', new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
  });
});

describe('daysUntil', () => {
  it('counts forward days from today in the camp zone', () => {
    // We cannot pin "now" inside daysUntil (it calls new Date()), so assert the
    // sign/relationship: a far-future date is positive, a past date negative.
    expect(daysUntil('2999-01-01', 'Australia/Brisbane')).toBeGreaterThan(0);
    expect(daysUntil('2000-01-01', 'Australia/Brisbane')).toBeLessThan(0);
  });

  it('returns 0 for today (zone-relative)', () => {
    const today = zonedToday('Australia/Brisbane');
    expect(daysUntil(today, 'Australia/Brisbane')).toBe(0);
  });
});
