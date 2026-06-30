import { describe, it, expect } from 'vitest';
import { buildSessions, currentSession, parseSessionId } from './checkin-sessions';

// AC-1: youth arrive at lunch on the first day (PM session only) and depart at lunch on
// the last day (AM session only). Interior days keep both AM and PM. A single-day camp is
// treated as an arrival day (PM only).

describe('buildSessions — AC-1 first/last day rules', () => {
  it('single-day camp → PM only (arrival day)', () => {
    expect(buildSessions(['2026-07-01']).map((s) => s.id)).toEqual(['2026-07-01~pm']);
  });

  it('two-day camp → day1 PM, day2 AM', () => {
    expect(buildSessions(['2026-07-01', '2026-07-02']).map((s) => s.id)).toEqual([
      '2026-07-01~pm',
      '2026-07-02~am',
    ]);
  });

  it('three-day camp → PM, AM+PM, AM', () => {
    expect(buildSessions(['2026-07-01', '2026-07-02', '2026-07-03']).map((s) => s.id)).toEqual([
      '2026-07-01~pm',
      '2026-07-02~am',
      '2026-07-02~pm',
      '2026-07-03~am',
    ]);
  });

  it('five-day camp → PM, [AM,PM]×3, AM', () => {
    const days = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'];
    expect(buildSessions(days).map((s) => s.id)).toEqual([
      '2026-07-01~pm',
      '2026-07-02~am', '2026-07-02~pm',
      '2026-07-03~am', '2026-07-03~pm',
      '2026-07-04~am', '2026-07-04~pm',
      '2026-07-05~am',
    ]);
  });

  it('is order-independent (sorts the input days)', () => {
    expect(buildSessions(['2026-07-03', '2026-07-01', '2026-07-02']).map((s) => s.id)).toEqual(
      buildSessions(['2026-07-01', '2026-07-02', '2026-07-03']).map((s) => s.id),
    );
  });

  it('empty camp → no sessions', () => {
    expect(buildSessions([])).toEqual([]);
  });
});

describe('currentSession — still resolves within the AC-1 session set', () => {
  const days = ['2026-07-01', '2026-07-02', '2026-07-03'];

  it('on the first day (PM only) before midday → still lands on that PM session', () => {
    expect(currentSession(days, '2026-07-01', '09:00')?.id).toBe('2026-07-01~pm');
  });

  it('on the last day (AM only) in the afternoon → lands on that AM session', () => {
    expect(currentSession(days, '2026-07-03', '15:00')?.id).toBe('2026-07-03~am');
  });

  it('on an interior day picks AM before midday, PM after', () => {
    expect(currentSession(days, '2026-07-02', '09:00')?.id).toBe('2026-07-02~am');
    expect(currentSession(days, '2026-07-02', '15:00')?.id).toBe('2026-07-02~pm');
  });
});

describe('parseSessionId', () => {
  it('round-trips ids built by buildSessions', () => {
    for (const s of buildSessions(['2026-07-01', '2026-07-02', '2026-07-03'])) {
      const parsed = parseSessionId(s.id);
      expect(parsed).not.toBeNull();
      expect(`${parsed!.day}~${parsed!.sfx}`).toBe(s.id);
    }
  });
});
