import { describe, it, expect, beforeEach } from 'vitest';
import { makeCheckInService } from './checkin.service';
import { InMemoryScheduleRepository, InMemoryCamperRepository, InMemorySettingsRepository } from '../repositories/in-memory';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Camper } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import { ForbiddenError, NotFoundError, BadRequestError } from '../core/errors/app-error';

// B3: getCurrentSession now derives today+now from the camp timezone. We pin the
// camp timezone to UTC in tests so "today" matches the UTC date used below and the
// suite stays deterministic regardless of the host's local zone. A settings repo
// (timezone: 'UTC') is wired into every service via makeSvc().
function utcSettings(): CampSettings {
  const now = new Date().toISOString();
  return {
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
    timezone: 'UTC', checkInLocation: 'Gate', checkInFrom: '08:00', registerBaseUrl: 'https://x.org',
    checkInDays: [], accommodationLocked: false, campMode: 'at-camp', createdAt: now, updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Characterisation test for the check-in service.
//
// This file PINS CURRENT BEHAVIOUR (including known bugs) so the upcoming
// Person-unification refactor cannot silently change it. We do NOT fix bugs
// here. Where current behaviour is buggy, we assert the buggy result and tag
// it with a CHARACTERISATION comment.
// ---------------------------------------------------------------------------

// With the camp timezone pinned to UTC (utcSettings), the service derives BOTH
// today's date and the wall-clock time in UTC — so we mirror that here for
// deterministic time-dependent tests.
const NOW = new Date();
const TODAY_STR = NOW.toISOString().slice(0, 10); // UTC calendar date
const NOW_TIME = NOW.toISOString().slice(11, 16); // UTC clock (HH:MM)

// A startTime guaranteed to be <= NOW_TIME and one guaranteed to be > NOW_TIME.
const PAST_TIME = '00:00';
const FUTURE_TIME = '23:59';

function sched(over: Partial<ScheduleItem>): ScheduleItem {
  const now = new Date().toISOString();
  return {
    id: 's',
    day: '2026-07-01',
    startTime: '09:00',
    endTime: null,
    title: 'Item',
    location: null,
    type: 'session',
    isCheckInPoint: false,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function camper(over: Partial<Camper>): Camper {
  const now = new Date().toISOString();
  return {
    id: 'cmp',
    firstName: 'First',
    lastName: 'Last',
    gender: 'male',
    zone: 'Yellow',
    kind: 'student',
    medicalConditions: [],
    dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    churchId: 'c1',
    churchName: 'Victory',
    atCamp: false,
    status: 'registered',
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

// Build the check-in service with a UTC-timezone settings repo (B3 determinism).
async function makeSvc(scheduleRepo: InMemoryScheduleRepository, camperRepo: InMemoryCamperRepository) {
  const settingsRepo = new InMemorySettingsRepository();
  await settingsRepo.init();
  await settingsRepo.saveSingleton(utcSettings());
  return makeCheckInService(scheduleRepo, camperRepo, settingsRepo);
}

// ---------------------------------------------------------------------------
// getSessions
// ---------------------------------------------------------------------------
describe('CheckInService.getSessions', () => {
  let scheduleRepo: InMemoryScheduleRepository;
  let camperRepo: InMemoryCamperRepository;
  beforeEach(async () => {
    scheduleRepo = new InMemoryScheduleRepository();
    camperRepo = new InMemoryCamperRepository();
    await scheduleRepo.init();
    await camperRepo.init();
  });

  it('returns only schedule items flagged as check-in points, mapped to sessions', async () => {
    await scheduleRepo.save(
      sched({ id: 's1', day: '2026-07-01', startTime: '08:00', title: 'AM Check-in', location: 'Hall', isCheckInPoint: true }),
    );
    await scheduleRepo.save(
      sched({ id: 's2', day: '2026-07-01', startTime: '12:00', title: 'Lunch', isCheckInPoint: false }),
    );
    const svc = await makeSvc(scheduleRepo, camperRepo);

    const sessions = await svc.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({
      id: 's1',
      label: 'AM Check-in',
      day: '2026-07-01',
      startTime: '08:00',
      location: 'Hall',
    });
  });

  it('maps a missing location to null', async () => {
    await scheduleRepo.save(sched({ id: 's1', isCheckInPoint: true, location: null }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const sessions = await svc.getSessions();
    expect(sessions[0]!.location).toBeNull();
  });

  it('returns an empty array when there are no check-in points', async () => {
    await scheduleRepo.save(sched({ id: 's1', isCheckInPoint: false }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    expect(await svc.getSessions()).toEqual([]);
  });

  it('orders sessions by day then startTime (repo getCheckInPoints sort)', async () => {
    await scheduleRepo.save(sched({ id: 'pm', day: '2026-07-01', startTime: '18:00', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'am', day: '2026-07-01', startTime: '08:00', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'next', day: '2026-07-02', startTime: '08:00', isCheckInPoint: true }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const ids = (await svc.getSessions()).map((s) => s.id);
    expect(ids).toEqual(['am', 'pm', 'next']);
  });
});

// ---------------------------------------------------------------------------
// getCurrentSession (sort + "today" logic)
//
// B3 FIX: getCurrentSession now derives today's date AND the wall-clock time from
// the camp timezone (via zonedNow), so they no longer disagree around UTC-midnight.
// Tests pin the camp zone to UTC (utcSettings) so TODAY_STR / NOW_TIME (both UTC)
// match the service's derivation deterministically.
// ---------------------------------------------------------------------------
describe('CheckInService.getCurrentSession', () => {
  let scheduleRepo: InMemoryScheduleRepository;
  let camperRepo: InMemoryCamperRepository;
  beforeEach(async () => {
    scheduleRepo = new InMemoryScheduleRepository();
    camperRepo = new InMemoryCamperRepository();
    await scheduleRepo.init();
    await camperRepo.init();
  });

  it('returns null when there are no check-in points', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    expect(await svc.getCurrentSession()).toBeNull();
  });

  it('returns the last check-in point today whose startTime has already passed', async () => {
    await scheduleRepo.save(sched({ id: 'am', day: TODAY_STR, startTime: PAST_TIME, title: 'AM', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'pm', day: TODAY_STR, startTime: FUTURE_TIME, title: 'PM', isCheckInPoint: true }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const current = await svc.getCurrentSession();
    // Only 'am' has startTime <= now; it is the last past session today.
    expect(current?.id).toBe('am');
  });

  it('picks the most recent past session today when several have passed', async () => {
    await scheduleRepo.save(sched({ id: 'early', day: TODAY_STR, startTime: '00:00', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'later', day: TODAY_STR, startTime: '00:01', isCheckInPoint: true }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    // Both are <= NOW_TIME unless the clock is exactly 00:00/00:01 local; in
    // the overwhelmingly common case 'later' is the last past session.
    // CHARACTERISATION: this pins the "last past today" branch.
    const current = await svc.getCurrentSession();
    expect(current?.id).toBe('later');
  });

  it('falls back to the first session today when none have started yet (pre-start)', async () => {
    await scheduleRepo.save(sched({ id: 'f1', day: TODAY_STR, startTime: FUTURE_TIME, title: 'First future', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'f2', day: TODAY_STR, startTime: FUTURE_TIME, title: 'Second future', isCheckInPoint: true }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const current = await svc.getCurrentSession();
    // No session today has startTime <= now, so it returns the first today
    // (after the chronological sort, f1 then f2 -> f1).
    expect(current?.id).toBe('f1');
  });

  it('falls back to the last session overall when none are scheduled today', async () => {
    // Use a date guaranteed not to equal TODAY_STR.
    const otherDay = TODAY_STR === '2000-01-01' ? '2000-01-02' : '2000-01-01';
    const laterDay = TODAY_STR === '2000-01-01' ? '2000-01-03' : '2000-01-02';
    await scheduleRepo.save(sched({ id: 'old', day: otherDay, startTime: '08:00', isCheckInPoint: true }));
    await scheduleRepo.save(sched({ id: 'newest', day: laterDay, startTime: '09:00', isCheckInPoint: true }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const current = await svc.getCurrentSession();
    // No "today" match -> returns the last item after the chronological sort.
    expect(current?.id).toBe('newest');
  });
});

// ---------------------------------------------------------------------------
// getSessionStatus (RBAC + roster scoping + checkedIn derivation)
// ---------------------------------------------------------------------------
describe('CheckInService.getSessionStatus', () => {
  let scheduleRepo: InMemoryScheduleRepository;
  let camperRepo: InMemoryCamperRepository;
  beforeEach(async () => {
    scheduleRepo = new InMemoryScheduleRepository();
    camperRepo = new InMemoryCamperRepository();
    await scheduleRepo.init();
    await camperRepo.init();
    await scheduleRepo.save(sched({ id: 'sess', title: 'Morning Check-in', isCheckInPoint: true }));
    await camperRepo.save(camper({ id: 'c-yellow-victory', zone: 'Yellow', churchId: 'c1' }));
    await camperRepo.save(camper({ id: 'c-blue-grace', zone: 'Blue', churchId: 'c2' }));
    await camperRepo.save(camper({ id: 'c-yellow-grace', zone: 'Yellow', churchId: 'c2' }));
  });

  it('rejects an actor without checkin:write (zoneLeader has it, but a non-permitted role does not)', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    // No real role lacks checkin:write among the four, so simulate one with a
    // bogus role to pin the assertCan('checkin:write') gate.
    const bogus = { ...actor('church'), role: 'guest' as unknown as Actor['role'] };
    await expect(svc.getSessionStatus(bogus, 'sess')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for an unknown session id', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await expect(svc.getSessionStatus(actor('director'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws BadRequestError when the schedule item is not a check-in point', async () => {
    await scheduleRepo.save(sched({ id: 'notcheckin', title: 'Lunch', isCheckInPoint: false }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await expect(svc.getSessionStatus(actor('director'), 'notcheckin')).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('a director sees the whole roster', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('director'), 'sess');
    expect(status.totalCount).toBe(3);
    expect(status.roster.map((r) => r.camperId).sort()).toEqual([
      'c-blue-grace',
      'c-yellow-grace',
      'c-yellow-victory',
    ]);
  });

  it('a church account sees only its own church', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('church', { churchId: 'c2' }), 'sess');
    expect(status.roster.map((r) => r.camperId).sort()).toEqual(['c-blue-grace', 'c-yellow-grace']);
    expect(status.totalCount).toBe(2);
  });

  it('a zone leader sees only their zone', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('zoneLeader', { zone: 'Yellow' }), 'sess');
    expect(status.roster.map((r) => r.camperId).sort()).toEqual(['c-yellow-grace', 'c-yellow-victory']);
  });

  it('maps roster fields (church <- churchName, zone) and derives checkedIn from the LAST entry for that session', async () => {
    await camperRepo.save(
      camper({
        id: 'c-yellow-victory',
        firstName: 'Amy',
        lastName: 'Adams',
        zone: 'Yellow',
        churchId: 'c1',
        churchName: 'Victory',
        checkInHistory: [
          { id: 'e1', sessionId: 'sess', sessionLabel: 'Morning Check-in', type: 'in', leaderId: 'u', timestamp: '2026-07-01T08:00:00.000Z' },
          { id: 'e2', sessionId: 'sess', sessionLabel: 'Morning Check-in', type: 'out', leaderId: 'u', timestamp: '2026-07-01T09:00:00.000Z' },
        ],
      }),
    );
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('church', { churchId: 'c1' }), 'sess');
    const entry = status.roster.find((r) => r.camperId === 'c-yellow-victory')!;
    expect(entry.firstName).toBe('Amy');
    expect(entry.lastName).toBe('Adams');
    expect(entry.church).toBe('Victory'); // mapped from churchName
    expect(entry.zone).toBe('Yellow');
    // Last entry for the session is 'out' -> checkedIn is false.
    expect(entry.checkedIn).toBe(false);
    expect(entry.lastEntry?.id).toBe('e2');
  });

  it('derives checkedIn=true when the last session entry is type "in"', async () => {
    await camperRepo.save(
      camper({
        id: 'c-yellow-victory',
        zone: 'Yellow',
        churchId: 'c1',
        checkInHistory: [
          { id: 'e1', sessionId: 'sess', sessionLabel: 'Morning Check-in', type: 'in', leaderId: 'u', timestamp: '2026-07-01T08:00:00.000Z' },
        ],
      }),
    );
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('church', { churchId: 'c1' }), 'sess');
    const entry = status.roster.find((r) => r.camperId === 'c-yellow-victory')!;
    expect(entry.checkedIn).toBe(true);
    expect(status.checkedInCount).toBe(1);
  });

  it('ignores entries for other sessions when deriving checkedIn / lastEntry', async () => {
    await camperRepo.save(
      camper({
        id: 'c-yellow-victory',
        zone: 'Yellow',
        churchId: 'c1',
        checkInHistory: [
          { id: 'other', sessionId: 'OTHER', sessionLabel: 'x', type: 'in', leaderId: 'u', timestamp: '2026-07-01T08:00:00.000Z' },
        ],
      }),
    );
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('church', { churchId: 'c1' }), 'sess');
    const entry = status.roster.find((r) => r.camperId === 'c-yellow-victory')!;
    expect(entry.lastEntry).toBeNull();
    expect(entry.checkedIn).toBe(false);
  });

  it('counts checkedIn campers across the scoped roster', async () => {
    await camperRepo.save(
      camper({
        id: 'c-yellow-victory',
        zone: 'Yellow',
        churchId: 'c1',
        checkInHistory: [
          { id: 'e1', sessionId: 'sess', sessionLabel: 'Morning Check-in', type: 'in', leaderId: 'u', timestamp: '2026-07-01T08:00:00.000Z' },
        ],
      }),
    );
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const status = await svc.getSessionStatus(actor('director'), 'sess');
    expect(status.checkedInCount).toBe(1);
    expect(status.totalCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// checkIn (append entry + set atCamp/status)
// ---------------------------------------------------------------------------
describe('CheckInService.checkIn', () => {
  let scheduleRepo: InMemoryScheduleRepository;
  let camperRepo: InMemoryCamperRepository;
  beforeEach(async () => {
    scheduleRepo = new InMemoryScheduleRepository();
    camperRepo = new InMemoryCamperRepository();
    await scheduleRepo.init();
    await camperRepo.init();
    await scheduleRepo.save(sched({ id: 'sess', title: 'Morning Check-in', isCheckInPoint: true }));
    await camperRepo.save(camper({ id: 'c1', atCamp: false, status: 'registered', checkInHistory: [] }));
  });

  it('rejects an actor without checkin:write', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const bogus = { ...actor('church'), role: 'guest' as unknown as Actor['role'] };
    await expect(svc.checkIn(bogus, { camperId: 'c1', sessionId: 'sess', type: 'in' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('rejects malformed input via Zod (throws, not a clean domain error)', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    // type must be 'in' | 'out'
    await expect(
      svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'sideways' }),
    ).rejects.toThrow();
  });

  it('throws NotFoundError for an unknown camper', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await expect(
      svc.checkIn(actor('director'), { camperId: 'ghost', sessionId: 'sess', type: 'in' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError for an unknown session', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await expect(
      svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'ghost', type: 'in' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does NOT scope-check the camper against the actor (any check-in:write actor can check in any camper)', async () => {
    // CHARACTERISATION: current behaviour — checkIn only calls
    // assertCan('checkin:write'); it never calls canAccessCamper. A church
    // account can therefore check in a camper from a DIFFERENT church.
    // Phase 2 may add per-camper scoping here.
    await camperRepo.save(camper({ id: 'foreign', churchId: 'OTHER', zone: 'Blue' }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const result = await svc.checkIn(actor('church', { churchId: 'c1' }), {
      camperId: 'foreign',
      sessionId: 'sess',
      type: 'in',
    });
    expect(result.id).toBe('foreign');
    expect(result.atCamp).toBe(true);
  });

  it('appends a CheckInEntry and sets atCamp=true / status=checked_in on type "in"', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const result = await svc.checkIn(actor('director', { id: 'leader-1' }), {
      camperId: 'c1',
      sessionId: 'sess',
      type: 'in',
    });
    expect(result.atCamp).toBe(true);
    expect(result.status).toBe('checked_in');
    expect(result.checkInHistory).toHaveLength(1);
    const entry = result.checkInHistory[0]!;
    expect(entry.sessionId).toBe('sess');
    expect(entry.sessionLabel).toBe('Morning Check-in'); // taken from schedule item title
    expect(entry.type).toBe('in');
    expect(entry.leaderId).toBe('leader-1'); // actor.id
    expect(entry.id).toMatch(/^ci_[a-f0-9]{16}$/);
    expect(typeof entry.timestamp).toBe('string');
  });

  it('on type "out" sets status=checked_out but LEAVES atCamp unchanged (does not set it false)', async () => {
    // CHARACTERISATION: current behaviour — atCamp is only ever set to true (on
    // "in"); on "out" it is preserved as-is (`type === 'in' ? true : camper.atCamp`).
    // So a camper who was atCamp stays atCamp after checking out. Phase 2 may revisit.
    await camperRepo.save(camper({ id: 'c1', atCamp: true, status: 'checked_in' }));
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const result = await svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'out' });
    expect(result.status).toBe('checked_out');
    expect(result.atCamp).toBe(true); // unchanged, NOT flipped to false
  });

  it('on type "out" for a camper not at camp, atCamp stays false', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    const result = await svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'out' });
    expect(result.status).toBe('checked_out');
    expect(result.atCamp).toBe(false);
  });

  it('appends successive entries rather than replacing them', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'in' });
    const result = await svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'out' });
    expect(result.checkInHistory).toHaveLength(2);
    expect(result.checkInHistory.map((e) => e.type)).toEqual(['in', 'out']);
  });

  it('persists the update so a later getSessionStatus reflects it', async () => {
    const svc = await makeSvc(scheduleRepo, camperRepo);
    await svc.checkIn(actor('director'), { camperId: 'c1', sessionId: 'sess', type: 'in' });
    const status = await svc.getSessionStatus(actor('director'), 'sess');
    const entry = status.roster.find((r) => r.camperId === 'c1')!;
    expect(entry.checkedIn).toBe(true);
  });
});
