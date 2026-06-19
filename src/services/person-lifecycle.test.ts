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

describe('withCheckIn — immutable append + promotion', () => {
  const entry: CheckInEntry = {
    id: 'ci1',
    sessionId: 's1',
    sessionLabel: 'Wed AM',
    type: 'in',
    leaderId: 'u1',
    timestamp: '2026-07-01T08:00:00.000Z',
  };

  it('appends the entry, promotes registered -> arrived, and stamps updatedAt', () => {
    const p = basePerson();
    const next = withCheckIn(p, entry, '2026-07-01T08:00:01.000Z');
    expect(next.checkInHistory).toHaveLength(1);
    expect(next.checkInHistory[0]).toBe(entry);
    expect(next.lifecycle).toBe('arrived');
    expect(next.atCamp).toBe(true);
    expect(next.updatedAt).toBe('2026-07-01T08:00:01.000Z');
  });

  it('does not mutate the input person', () => {
    const p = basePerson();
    withCheckIn(p, entry, '2026-07-01T08:00:01.000Z');
    expect(p.checkInHistory).toHaveLength(0);
    expect(p.lifecycle).toBe('registered');
    expect(p.atCamp).toBe(false);
  });
});

describe('withSignEvent — immutable append + transition', () => {
  it('a sign-OUT event moves arrived -> checked_out and appends history', () => {
    const p = basePerson({ lifecycle: 'arrived', atCamp: true });
    const ev: SignOutEvent = { id: 'so1', type: 'out', leaderName: 'Leader', authorId: 'u1', timestamp: 't' };
    const next = withSignEvent(p, ev, 'now');
    expect(next.signOutHistory).toHaveLength(1);
    expect(next.lifecycle).toBe('checked_out');
    expect(next.atCamp).toBe(false);
    expect(p.signOutHistory).toHaveLength(0); // input untouched
  });

  it('a sign-IN event promotes registered -> arrived', () => {
    const p = basePerson();
    const ev: SignOutEvent = { id: 'si1', type: 'in', leaderName: 'Leader', authorId: 'u1', timestamp: 't' };
    const next = withSignEvent(p, ev, 'now');
    expect(next.lifecycle).toBe('arrived');
    expect(next.atCamp).toBe(true);
  });
});
