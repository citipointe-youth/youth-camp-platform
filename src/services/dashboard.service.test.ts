import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { makeDashboardService } from './dashboard.service';
import { invalidateDashboardCache } from './dashboard-cache';
import { makePersonService } from './person.service';
import {
  InMemoryPersonRepository,
  InMemoryNotificationRepository,
  InMemoryChurchRepository,
} from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { CheckInEntry } from '../core/entities/person';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';

// The dashboard service keeps a module-level response cache keyed by actor
// scope (see dashboard-cache.ts). Each test below builds fresh repositories,
// so clear the cache to avoid one test's result leaking into another via a
// shared actor key (e.g. the many `actor('admin')` calls in this file).
beforeEach(() => invalidateDashboardCache());

// ---------------------------------------------------------------------------
// At-camp dashboard calculation audit fixes:
//  D1 — currentSession = LATEST started session today (not earliest)
//  D2 — totalAtCamp / totalExpected / checkInsDue scoped to the actor
//  D3 — checkInsDue measured against the CURRENT session, respecting check-out
// Check-in sessions are now derived from settings.checkInDays (AM 08:00 / PM 13:00),
// so the clock is pinned with vi.setSystemTime to make "current session" deterministic.
// Camp timezone is pinned to UTC.
// ---------------------------------------------------------------------------

const DATE = '2026-07-01';
const AM = `${DATE}~am`;
const PM = `${DATE}~pm`;

// Pin "now" so a chosen session is current. 15:00 → PM current (both started);
// 10:00 → AM current, PM next.
function pinClock(iso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}
afterEach(() => vi.useRealTimers());

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: 'Test User', ...over };
}

function ci(sessionId: string, type: 'in' | 'out', ts: string): CheckInEntry {
  return { id: `ci_${sessionId}_${type}_${ts}`, sessionId, sessionLabel: sessionId, type, leaderId: 'l', timestamp: ts };
}

function camper(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'c', firstName: 'A', lastName: 'B', gender: 'male', zone: 'Yellow', kind: 'youth',
    medicalConditions: [], dietaryRequirements: [],
    consents: { medical: { granted: false, timestamp: null }, media: { granted: false, timestamp: null }, supervision: { granted: false, timestamp: null } },
    churchId: 'c1', churchName: 'Victory', atCamp: false,
    paymentStatus: 'unpaid', accommodationKind: null, accommodationLabel: null,
    needsReview: false,
    lifecycle: 'arrived', // at-camp default so isCamper() returns true
    checkInHistory: [], signOutHistory: [], createdAt: now, updatedAt: now, ...over,
  };
}

function settings(): CampSettings {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    // DATE is an INTERIOR day so it keeps both AM and PM sessions under AC-1
    // (first day is PM-only, last day AM-only). See checkin-sessions.buildSessions.
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-06-30', endDate: '2026-07-05',
    timezone: 'UTC', checkInDays: ['2026-06-30', DATE, '2026-07-02'],
    accommodationLocked: false, tentPrice: 80, classroomPrice: 120, churchLoginLocked: false, zoneLeaderLoginLocked: false, churchCheckinTimeRestricted: false, campMode: 'at-camp', createdAt: now, updatedAt: now,
  };
}

async function build() {
  const personRepo = new InMemoryPersonRepository();
  const notifRepo = new InMemoryNotificationRepository();
  const churchRepo = new InMemoryChurchRepository();
  for (const r of [personRepo, notifRepo, churchRepo]) await r.init();
  const svc = makeDashboardService(personRepo, notifRepo, churchRepo);
  return { svc, personRepo };
}

describe('at-camp dashboard — D1 current session = latest started', () => {
  it('returns the PM session as current when both AM and PM have started', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.currentSession?.id).toBe(PM);
  });

  it('nextSession is the earliest not-yet-started session', async () => {
    pinClock('2026-07-01T10:00:00Z'); // AM started, PM not yet
    const h = await build();
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.currentSession?.id).toBe(AM);
    expect(res.nextSession?.id).toBe(PM);
  });

  // H-2: the 12:00–13:00 window. The shared currentSession helper switches AM→PM at
  // 12:00 (PM_FROM), so 12:30 must resolve to PM — matching checkin.service. The old
  // bespoke calc used the PM startTime (13:00) and returned AM here, so a leader tapping
  // Check-in landed on PM while the dashboard counted "due" against AM for that hour.
  it('resolves PM as current at 12:30, matching checkin.service (H-2)', async () => {
    pinClock('2026-07-01T12:30:00Z');
    const h = await build();
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.currentSession?.id).toBe(PM);
    expect(res.nextSession).toBeNull(); // nothing after PM today
  });
});

describe('at-camp dashboard — D2 scoping', () => {
  it('a church login sees only its own church in totals', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'c1a', churchId: 'c1', atCamp: true }));
    await h.personRepo.save(camper({ id: 'c1b', churchId: 'c1', atCamp: false }));
    await h.personRepo.save(camper({ id: 'c2a', churchId: 'c2', atCamp: true }));
    const res = await h.svc.home(actor('church', { churchId: 'c1' }), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(2); // c1a + c1b, NOT c2a
    expect(res.totalAtCamp).toBe(1); // only c1a is atCamp
  });

  it('admin sees the whole camp', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'c1a', churchId: 'c1', atCamp: true }));
    await h.personRepo.save(camper({ id: 'c2a', churchId: 'c2', atCamp: true }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(2);
    expect(res.totalAtCamp).toBe(2);
  });

  it('excludes cancelled campers from totalExpected', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'live', lifecycle: 'arrived' }));
    await h.personRepo.save(camper({ id: 'gone', lifecycle: 'cancelled' })); // not a camper
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(1);
  });
});

describe('at-camp dashboard — D3 checkInsDue (current session, respects check-out)', () => {
  it('counts a camper as due when never checked in to the current session', async () => {
    pinClock('2026-07-01T15:00:00Z'); // PM current
    const h = await build();
    await h.personRepo.save(camper({ id: 'x', atCamp: true })); // no check-ins
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(1);
  });

  it('a camper checked IN to the current session is NOT due', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'x', atCamp: true, checkInHistory: [ci(PM, 'in', '2026-07-01T13:30:00Z')] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(0);
  });

  it('a camper who checked in then OUT of the current session IS due again (D3)', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'x', atCamp: true, checkInHistory: [
      ci(PM, 'in', '2026-07-01T13:30:00Z'),
      ci(PM, 'out', '2026-07-01T14:00:00Z'),
    ] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(1); // last entry is 'out' -> due
  });

  it('a check-in to a DIFFERENT (earlier) session does not satisfy the current one (D3)', async () => {
    pinClock('2026-07-01T15:00:00Z'); // PM current
    const h = await build();
    await h.personRepo.save(camper({ id: 'x', atCamp: true, checkInHistory: [ci(AM, 'in', '2026-07-01T08:30:00Z')] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.currentSession?.id).toBe(PM);
    expect(res.checkInsDue).toBe(1); // checked into AM, but PM is current -> still due
  });
});

// ---------------------------------------------------------------------------
// Server-side response cache (dashboard-cache.ts). ~30s TTL, keyed by actor
// scope (role + churchId + zone). Two hard requirements verified below:
//  1. A cached response must never leak from one church/zone scope to another.
//  2. Every write that changes the DTO must invalidate the cache immediately —
//     no manual invalidateDashboardCache() call should be needed from a caller.
// ---------------------------------------------------------------------------

describe('dashboard response cache', () => {
  it('serves a cached result on a repeat call within TTL (proves the cache is hit)', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    const a = actor('admin');
    await h.personRepo.save(camper({ id: 'x', atCamp: true }));
    const first = await h.svc.home(a, settings());
    // Mutate the underlying store directly (bypassing person.service, so no
    // invalidation fires) — a cache hit must still return the OLD count.
    await h.personRepo.save(camper({ id: 'y', atCamp: true }));
    const second = await h.svc.home(a, settings());
    if (first.mode !== 'at-camp' || second.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(second.totalExpected).toBe(first.totalExpected);
  });

  it('scopes the cache key by church — one church can never see another church cached in its slot', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'c1a', churchId: 'c1', atCamp: true }));
    await h.personRepo.save(camper({ id: 'c2a', churchId: 'c2', atCamp: true }));
    await h.personRepo.save(camper({ id: 'c2b', churchId: 'c2', atCamp: true }));
    const resA = await h.svc.home(actor('church', { churchId: 'c1' }), settings());
    const resB = await h.svc.home(actor('church', { churchId: 'c2' }), settings());
    if (resA.mode !== 'at-camp' || resB.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(resA.totalExpected).toBe(1);
    expect(resB.totalExpected).toBe(2); // not resA's cached value, not a mix of both
  });

  it('scopes the cache key by zone — a zoneLeader never sees another zone cached in its slot', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    await h.personRepo.save(camper({ id: 'y1', zone: 'Yellow', atCamp: true }));
    await h.personRepo.save(camper({ id: 'b1', zone: 'Blue', atCamp: true }));
    await h.personRepo.save(camper({ id: 'b2', zone: 'Blue', atCamp: true }));
    const resYellow = await h.svc.home(actor('zoneLeader', { zone: 'Yellow' }), settings());
    const resBlue = await h.svc.home(actor('zoneLeader', { zone: 'Blue' }), settings());
    if (resYellow.mode !== 'at-camp' || resBlue.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(resYellow.totalExpected).toBe(1);
    expect(resBlue.totalExpected).toBe(2);
  });

  it('invalidateDashboardCache() forces the next call to re-read fresh data', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    const a = actor('admin');
    await h.personRepo.save(camper({ id: 'x', atCamp: true }));
    const first = await h.svc.home(a, settings());
    await h.personRepo.save(camper({ id: 'y', atCamp: true }));
    invalidateDashboardCache();
    const second = await h.svc.home(a, settings());
    if (first.mode !== 'at-camp' || second.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(second.totalExpected).toBe(first.totalExpected + 1);
  });

  it('a daily check-in (person.service.checkIn) invalidates the cache automatically', async () => {
    pinClock('2026-07-01T15:00:00Z'); // PM current
    const h = await build();
    const personSvc = makePersonService(h.personRepo);
    const a = actor('admin');
    await h.personRepo.save(camper({ id: 'x', atCamp: true }));
    const before = await h.svc.home(a, settings());
    if (before.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(before.checkInsDue).toBe(1);

    // No manual invalidateDashboardCache() call here — person.service must do it.
    await personSvc.checkIn(a, 'x', {
      sessionId: PM, sessionLabel: 'PM', type: 'in', leaderId: 'u', timestamp: '2026-07-01T15:05:00.000Z',
    });

    const after = await h.svc.home(a, settings());
    if (after.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(after.checkInsDue).toBe(0);
  });

  it('an attendance sign-out (person.service.signEvent) invalidates the cache automatically', async () => {
    pinClock('2026-07-01T15:00:00Z');
    const h = await build();
    const personSvc = makePersonService(h.personRepo);
    const a = actor('admin');
    await h.personRepo.save(camper({ id: 'x', atCamp: true }));
    const before = await h.svc.home(a, settings());
    if (before.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(before.totalAtCamp).toBe(1);

    await personSvc.signEvent(a, 'x', {
      type: 'out', leaderName: 'Leader', authorId: 'u', timestamp: '2026-07-01T15:05:00.000Z',
    });

    const after = await h.svc.home(a, settings());
    if (after.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(after.totalAtCamp).toBe(0);
  });

  it('a registrant create (person.service.create) invalidates the pre-camp cache automatically', async () => {
    const h = await build();
    const personSvc = makePersonService(h.personRepo);
    const preCampSettings: CampSettings = { ...settings(), campMode: 'pre-camp' };
    const a = actor('admin');
    const before = await h.svc.home(a, preCampSettings);
    if (before.mode !== 'pre-camp') throw new Error('expected pre-camp');
    expect(before.totalRegistrants).toBe(0);

    await personSvc.create(a, {
      firstName: 'New', lastName: 'Kid', gender: 'male', churchId: 'c1', churchName: 'Victory', zone: 'Yellow',
    });

    const after = await h.svc.home(a, preCampSettings);
    if (after.mode !== 'pre-camp') throw new Error('expected pre-camp');
    expect(after.totalRegistrants).toBe(1);
  });
});
