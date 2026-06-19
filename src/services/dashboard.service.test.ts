import { describe, it, expect, beforeEach } from 'vitest';
import { makeDashboardService } from './dashboard.service';
import {
  InMemoryRegistrantRepository,
  InMemoryCamperRepository,
  InMemoryAccommodationRepository,
  InMemoryNotificationRepository,
  InMemoryScheduleRepository,
  InMemoryChurchRepository,
} from '../repositories/in-memory';
import type { Camper, CheckInEntry } from '../core/entities/camper';
import type { ScheduleItem } from '../core/entities/schedule';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';

// ---------------------------------------------------------------------------
// At-camp dashboard calculation audit fixes:
//  D1 — currentSession = LATEST started session today (not earliest)
//  D2 — totalAtCamp / totalExpected / checkInsDue scoped to the actor
//  D3 — checkInsDue measured against the CURRENT session, respecting check-out
// Camp timezone is pinned to UTC so "today"/"now" are deterministic.
// ---------------------------------------------------------------------------

const NOW = new Date();
const TODAY = NOW.toISOString().slice(0, 10);

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: 'Test User', ...over };
}

function ci(sessionId: string, type: 'in' | 'out', ts: string): CheckInEntry {
  return { id: `ci_${sessionId}_${type}_${ts}`, sessionId, sessionLabel: sessionId, type, leaderId: 'l', timestamp: ts };
}

function camper(over: Partial<Camper> = {}): Camper {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'c', firstName: 'A', lastName: 'B', gender: 'male', zone: 'Yellow', kind: 'student',
    medicalConditions: [], dietaryRequirements: [],
    consents: { medical: { granted: false, timestamp: null }, media: { granted: false, timestamp: null }, supervision: { granted: false, timestamp: null } },
    churchId: 'c1', churchName: 'Victory', atCamp: false, status: 'registered',
    checkInHistory: [], signOutHistory: [], createdAt: now, updatedAt: now, ...over,
  };
}

function session(id: string, startTime: string): ScheduleItem {
  const now = '2026-01-01T00:00:00.000Z';
  return { id, day: TODAY, startTime, endTime: null, title: id, location: null, type: 'logistics', isCheckInPoint: true, createdAt: now, updatedAt: now };
}

function settings(): CampSettings {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
    timezone: 'UTC', checkInLocation: '', checkInFrom: '', registerBaseUrl: '', checkInDays: [],
    accommodationLocked: false, campMode: 'at-camp', createdAt: now, updatedAt: now,
  };
}

async function build() {
  const registrantRepo = new InMemoryRegistrantRepository();
  const camperRepo = new InMemoryCamperRepository();
  const accommodationRepo = new InMemoryAccommodationRepository();
  const notifRepo = new InMemoryNotificationRepository();
  const scheduleRepo = new InMemoryScheduleRepository();
  const churchRepo = new InMemoryChurchRepository();
  for (const r of [registrantRepo, camperRepo, accommodationRepo, notifRepo, scheduleRepo, churchRepo]) await r.init();
  const svc = makeDashboardService(registrantRepo, camperRepo, accommodationRepo, notifRepo, scheduleRepo, churchRepo);
  return { svc, camperRepo, scheduleRepo };
}

describe('at-camp dashboard — D1 current session = latest started', () => {
  it('returns the PM session as current when both AM and PM have started', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('am', '00:00')); // long since started (UTC)
    await h.scheduleRepo.save(session('pm', '00:01')); // also started, later
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    // Both started; current must be the LATER one ('pm'), not 'am'.
    expect(res.currentSession?.id).toBe('pm');
  });

  it('nextSession is the earliest not-yet-started session', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('past', '00:00'));
    await h.scheduleRepo.save(session('future', '23:59'));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.nextSession?.id).toBe('future');
  });
});

describe('at-camp dashboard — D2 scoping', () => {
  it('a church login sees only its own church in totals', async () => {
    const h = await build();
    await h.camperRepo.save(camper({ id: 'c1a', churchId: 'c1', atCamp: true }));
    await h.camperRepo.save(camper({ id: 'c1b', churchId: 'c1', atCamp: false }));
    await h.camperRepo.save(camper({ id: 'c2a', churchId: 'c2', atCamp: true }));
    const res = await h.svc.home(actor('church', { churchId: 'c1' }), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(2); // c1a + c1b, NOT c2a
    expect(res.totalAtCamp).toBe(1); // only c1a is atCamp
  });

  it('admin sees the whole camp', async () => {
    const h = await build();
    await h.camperRepo.save(camper({ id: 'c1a', churchId: 'c1', atCamp: true }));
    await h.camperRepo.save(camper({ id: 'c2a', churchId: 'c2', atCamp: true }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(2);
    expect(res.totalAtCamp).toBe(2);
  });

  it('excludes cancelled campers from totalExpected', async () => {
    const h = await build();
    await h.camperRepo.save(camper({ id: 'live', status: 'registered' }));
    await h.camperRepo.save(camper({ id: 'gone', status: 'cancelled' }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.totalExpected).toBe(1);
  });
});

describe('at-camp dashboard — D3 checkInsDue (current session, respects check-out)', () => {
  it('counts a camper as due when never checked in to the current session', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('cur', '00:00'));
    await h.camperRepo.save(camper({ id: 'x' })); // no check-ins
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(1);
  });

  it('a camper checked IN to the current session is NOT due', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('cur', '00:00'));
    await h.camperRepo.save(camper({ id: 'x', checkInHistory: [ci('cur', 'in', '2026-07-01T08:00:00Z')] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(0);
  });

  it('a camper who checked in then OUT of the current session IS due again (D3)', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('cur', '00:00'));
    await h.camperRepo.save(camper({ id: 'x', checkInHistory: [
      ci('cur', 'in', '2026-07-01T08:00:00Z'),
      ci('cur', 'out', '2026-07-01T09:00:00Z'),
    ] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.checkInsDue).toBe(1); // last entry is 'out' -> due
  });

  it('a check-in to a DIFFERENT (earlier) session does not satisfy the current one (D3)', async () => {
    const h = await build();
    await h.scheduleRepo.save(session('am', '00:00'));
    await h.scheduleRepo.save(session('pm', '00:01')); // current (latest started)
    await h.camperRepo.save(camper({ id: 'x', checkInHistory: [ci('am', 'in', '2026-07-01T08:00:00Z')] }));
    const res = await h.svc.home(actor('admin'), settings());
    if (res.mode !== 'at-camp') throw new Error('expected at-camp');
    expect(res.currentSession?.id).toBe('pm');
    expect(res.checkInsDue).toBe(1); // checked into AM, but PM is current -> still due
  });
});
