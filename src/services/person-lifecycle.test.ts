import { describe, it, expect } from 'vitest';
import { applyCheckIn, applySignOut, applySignIn, withCheckIn, withSignEvent } from './person-lifecycle';
import type { Person } from '../core/entities/person';
import type { CheckInEntry, SignOutEvent } from '../core/entities/person';

// ---------------------------------------------------------------------------
// Locks the design-D2 promotion rule: Day-1 first check-in promotes a registrant
// to a camper (registered -> arrived). Pure-function tests, fully verifiable.
// ---------------------------------------------------------------------------

describe('applyCheckIn — promotion semantics', () => {
  it('a registered person checking IN is promoted to arrived + atCamp', () => {
    expect(applyCheckIn({ lifecycle: 'registered', atCamp: false }, 'in')).toEqual({
      lifecycle: 'arrived',
      atCamp: true,
    });
  });

  it('an already-arrived person checking IN stays arrived (idempotent)', () => {
    expect(applyCheckIn({ lifecycle: 'arrived', atCamp: true }, 'in')).toEqual({
      lifecycle: 'arrived',
      atCamp: true,
    });
  });

  it('a checked_out person checking IN returns to arrived + atCamp', () => {
    expect(applyCheckIn({ lifecycle: 'checked_out', atCamp: false }, 'in')).toEqual({
      lifecycle: 'arrived',
      atCamp: true,
    });
  });

  it('a cancelled person is NOT auto-promoted by a check-in', () => {
    expect(applyCheckIn({ lifecycle: 'cancelled', atCamp: false }, 'in')).toEqual({
      lifecycle: 'cancelled',
      atCamp: false,
    });
  });

  it('an arrived person checking OUT becomes checked_out + not atCamp', () => {
    expect(applyCheckIn({ lifecycle: 'arrived', atCamp: true }, 'out')).toEqual({
      lifecycle: 'checked_out',
      atCamp: false,
    });
  });

  it('checking OUT a registered person is a no-op (never arrived)', () => {
    expect(applyCheckIn({ lifecycle: 'registered', atCamp: false }, 'out')).toEqual({
      lifecycle: 'registered',
      atCamp: false,
    });
  });

  it('checking OUT a cancelled person is a no-op', () => {
    expect(applyCheckIn({ lifecycle: 'cancelled', atCamp: false }, 'out')).toEqual({
      lifecycle: 'cancelled',
      atCamp: false,
    });
  });
});

describe('applySignOut / applySignIn convenience wrappers', () => {
  it('applySignOut mirrors checkIn(out)', () => {
    expect(applySignOut({ lifecycle: 'arrived', atCamp: true })).toEqual({ lifecycle: 'checked_out', atCamp: false });
  });
  it('applySignIn mirrors checkIn(in) and promotes', () => {
    expect(applySignIn({ lifecycle: 'registered', atCamp: false })).toEqual({ lifecycle: 'arrived', atCamp: true });
  });
});

function basePerson(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p1',
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    kind: 'youth',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    medicalConditions: [],
    dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid',
    lifecycle: 'registered',
    atCamp: false,
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

describe('withCheckIn — immutable append only (never touches lifecycle or atCamp)', () => {
  const entry: CheckInEntry = {
    id: 'ci1',
    sessionId: 's1',
    sessionLabel: 'Wed AM',
    type: 'in',
    leaderId: 'u1',
    timestamp: '2026-07-01T08:00:00.000Z',
  };
  const outEntry: CheckInEntry = {
    id: 'ci2',
    sessionId: 's1',
    sessionLabel: 'Wed AM',
    type: 'out',
    leaderId: 'u1',
    timestamp: '2026-07-01T20:00:00.000Z',
  };

  it('appends the entry and stamps updatedAt, does NOT change lifecycle or atCamp', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const next = withCheckIn(p, entry, '2026-07-01T08:00:01.000Z');
    expect(next.checkInHistory).toHaveLength(1);
    expect(next.checkInHistory[0]).toBe(entry);
    expect(next.lifecycle).toBe('arrived');
    expect(next.atCamp).toBe(true);
    expect(next.updatedAt).toBe('2026-07-01T08:00:01.000Z');
  });

  it('a session check-OUT does NOT set atCamp=false (only attendance sign-out does)', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const next = withCheckIn(p, outEntry, '2026-07-01T20:00:01.000Z');
    expect(next.atCamp).toBe(true);
    expect(next.lifecycle).toBe('arrived');
    expect(next.checkInHistory).toHaveLength(1);
  });

  it('does not mutate the input person', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    withCheckIn(p, entry, '2026-07-01T08:00:01.000Z');
    expect(p.checkInHistory).toHaveLength(0);
    expect(p.lifecycle).toBe('arrived');
    expect(p.atCamp).toBe(true);
  });

  it('accumulates multiple entries across sessions', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const p2 = withCheckIn(p, entry, 't1');
    const entry2: CheckInEntry = { ...entry, id: 'ci3', sessionId: 's2', sessionLabel: 'Thu AM' };
    const p3 = withCheckIn(p2, entry2, 't2');
    expect(p3.checkInHistory).toHaveLength(2);
    expect(p3.atCamp).toBe(true);
  });
});

describe('withSignEvent — immutable append + lifecycle/atCamp transition', () => {
  it('a sign-OUT event moves arrived -> checked_out, sets atCamp=false, appends history', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const ev: SignOutEvent = { id: 'so1', type: 'out', leaderName: 'Leader', authorId: 'u1', timestamp: 't' };
    const next = withSignEvent(p, ev, 'now');
    expect(next.signOutHistory).toHaveLength(1);
    expect(next.lifecycle).toBe('checked_out');
    expect(next.atCamp).toBe(false);
    expect(p.signOutHistory).toHaveLength(0);
  });

  it('a sign-IN event (return to camp) promotes checked_out -> arrived, sets atCamp=true', () => {
    const p = basePerson({ lifecycle: 'checked_out', atCamp: false });
    const ev: SignOutEvent = { id: 'si1', type: 'in', leaderName: 'Leader', authorId: 'u1', timestamp: 't' };
    const next = withSignEvent(p, ev, 'now');
    expect(next.lifecycle).toBe('arrived');
    expect(next.atCamp).toBe(true);
    expect(next.signOutHistory).toHaveLength(1);
  });

  it('sign-OUT on a checked_out person is idempotent (stays checked_out)', () => {
    const p = basePerson({ lifecycle: 'checked_out', atCamp: false });
    const ev: SignOutEvent = { id: 'so2', type: 'out', leaderName: 'Leader', authorId: 'u1', timestamp: 't' };
    const next = withSignEvent(p, ev, 'now');
    expect(next.lifecycle).toBe('checked_out');
    expect(next.atCamp).toBe(false);
  });
});
