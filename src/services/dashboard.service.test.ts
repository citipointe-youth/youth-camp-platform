import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeDashboardService } from './dashboard.service';
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
