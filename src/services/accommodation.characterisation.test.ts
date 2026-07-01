import { describe, it, expect } from 'vitest';
import { makeAccommodationService } from './accommodation.service';
import {
  InMemoryClassroomRepository,
  InMemoryAllocationRepository,
  InMemoryChurchRepository,
  InMemorySettingsRepository,
  InMemoryPersonRepository,
} from '../repositories/in-memory';
import type { Classroom } from '../core/entities/accommodation';
import type { Church } from '../core/entities/church';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import type { Person } from '../core/entities/person';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------
function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

function room(over: Partial<Classroom>): Classroom {
  const now = new Date().toISOString();
  return { id: 'rm', name: 'Room 1', capacity: 6, createdAt: now, updatedAt: now, ...over };
}

function church(over: Partial<Church>): Church {
  const now = new Date().toISOString();
  return {
    id: 'c1',
    name: 'Victory',
    zone: 'Yellow',
    contacts: {
      male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
    },
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function reg(over: Partial<Person> & { status?: 'registered' | 'cancelled' }): Person {
  const now = new Date().toISOString();
  const { status, ...rest } = over;
  return {
    id: 'r',
    firstName: 'A',
    lastName: 'B',
    gender: 'male',
    kind: 'youth',
    paymentStatus: 'unpaid',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    accommodationKind: 'classroom',
    lifecycle: status === 'cancelled' ? 'cancelled' : 'registered',
    atCamp: false,
    medicalConditions: [],
    dietaryRequirements: [],
    consents: { medical: { granted: false, timestamp: null }, media: { granted: false, timestamp: null }, supervision: { granted: false, timestamp: null } },
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...rest,
  };
}

function settings(over: Partial<CampSettings>): CampSettings {
  const now = new Date().toISOString();
  return {
    id: 'settings',
    campName: 'Camp',
    year: 2026,
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    timezone: 'Australia/Brisbane',
    checkInDays: [],
    accommodationLocked: false,
    tentPrice: 80,
    classroomPrice: 120,
    churchLoginLocked: false,
    zoneLeaderLoginLocked: false,
    churchCheckinTimeRestricted: false,
    campMode: 'pre-camp',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

async function build(opts: {
  rooms?: Classroom[];
  churches?: Church[];
  settings?: CampSettings | null;
  registrants?: Person[];
} = {}) {
  const classroomRepo = new InMemoryClassroomRepository();
  const allocationRepo = new InMemoryAllocationRepository();
  const churchRepo = new InMemoryChurchRepository();
  const settingsRepo = new InMemorySettingsRepository();
  const personRepo = new InMemoryPersonRepository();
  await Promise.all([classroomRepo.init(), allocationRepo.init(), churchRepo.init(), settingsRepo.init(), personRepo.init()]);
  for (const r of opts.rooms ?? []) await classroomRepo.save(r);
  for (const c of opts.churches ?? []) await churchRepo.save(c);
  for (const p of opts.registrants ?? []) await personRepo.save(p);
  await settingsRepo.saveSingleton(opts.settings ?? settings({}));
  const svc = makeAccommodationService(classroomRepo, allocationRepo, churchRepo, settingsRepo, personRepo);
  return { svc, classroomRepo, allocationRepo, churchRepo, settingsRepo, personRepo };
}

// Three male + one female classroom-kind youth at Victory (c1) -> 100% eligible.
const victoryClassroomRegs = [
  reg({ id: 'r1', churchId: 'c1', gender: 'male' }),
  reg({ id: 'r2', churchId: 'c1', gender: 'male' }),
  reg({ id: 'r3', churchId: 'c1', gender: 'male' }),
  reg({ id: 'r4', churchId: 'c1', gender: 'female' }),
];

// ---------------------------------------------------------------------------
// Classrooms CRUD + RBAC
// ---------------------------------------------------------------------------
describe('AccommodationService — classrooms', () => {
  it('admin can create, list and delete classrooms', async () => {
    const { svc, classroomRepo } = await build();
    const created = await svc.createClassroom(actor('admin'), { name: 'Room 1', capacity: 6 });
    expect(created.id).toMatch(/^room_/);
    expect(await svc.listClassrooms(actor('admin'))).toHaveLength(1);
    await svc.deleteClassroom(actor('admin'), created.id);
    expect(await classroomRepo.findById(created.id)).toBeNull();
  });

  it.each(['church', 'zoneLeader', 'director'] as const)('role %s cannot create a classroom', async (role) => {
    const { svc } = await build();
    await expect(svc.createClassroom(actor(role), { name: 'R', capacity: 4 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each(['church', 'zoneLeader', 'director', 'admin'] as const)('role %s can list classrooms', async (role) => {
    const { svc } = await build({ rooms: [room({ id: 'rm1' })] });
    expect(await svc.listClassrooms(actor(role, { churchId: 'c1', zone: 'Yellow' }))).toHaveLength(1);
  });

  it('admin bypasses the lock to create a classroom', async () => {
    const { svc } = await build({ settings: settings({ accommodationLocked: true }) });
    const created = await svc.createClassroom(actor('admin'), { name: 'Room 1', capacity: 6 });
    expect(created.name).toBe('Room 1');
  });

  it('rejects an invalid classroom (capacity < 1)', async () => {
    const { svc } = await build();
    await expect(svc.createClassroom(actor('admin'), { name: 'R', capacity: 0 })).rejects.toBeTruthy();
  });

  it('updateClassroom preserves id; unknown id throws NotFound', async () => {
    const { svc } = await build({ rooms: [room({ id: 'rm1', name: 'Old', capacity: 6 })] });
    const updated = await svc.updateClassroom(actor('admin'), 'rm1', { name: 'Renamed', capacity: 8 });
    expect(updated.id).toBe('rm1');
    expect(updated.name).toBe('Renamed');
    expect(updated.capacity).toBe(8);
    await expect(svc.updateClassroom(actor('admin'), 'nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deleting a classroom cascades its allocation rows', async () => {
    const { svc, allocationRepo } = await build({
      rooms: [room({ id: 'rm1', capacity: 6 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs,
    });
    await svc.setAllocations(actor('director'), { allocations: { rm1: [{ key: 'c1|male', n: 3 }] } });
    expect(await allocationRepo.findAll()).toHaveLength(1);
    await svc.deleteClassroom(actor('admin'), 'rm1');
    expect(await allocationRepo.findAll()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Groups (eligibility)
// ---------------------------------------------------------------------------
describe('AccommodationService.listGroups', () => {
  it('director/admin get eligible per-gender groups', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1' })], registrants: victoryClassroomRegs });
    const groups = await svc.listGroups(actor('director'));
    expect(groups.map((g) => g.key).sort()).toEqual(['c1|female', 'c1|male']);
  });

  it('church/zoneLeader cannot read groups', async () => {
    const { svc } = await build();
    await expect(svc.listGroups(actor('church', { churchId: 'c1' }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.listGroups(actor('zoneLeader', { zone: 'Yellow' }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// Allocations round-trip + validation
// ---------------------------------------------------------------------------
describe('AccommodationService allocations', () => {
  it('director sets + gets allocations (map round-trips)', async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 6 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs,
    });
    const map = { rm1: [{ key: 'c1|male', n: 3 }] };
    const saved = await svc.setAllocations(actor('director'), { allocations: map });
    expect(saved).toEqual(map);
    expect(await svc.getAllocations(actor('admin'))).toEqual(map);
  });

  it('rejects mixing genders in one room', async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 6 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs,
    });
    await expect(svc.setAllocations(actor('director'), {
      allocations: { rm1: [{ key: 'c1|male', n: 2 }, { key: 'c1|female', n: 1 }] },
    })).rejects.toThrow(/single gender/i);
  });

  it('rejects exceeding room capacity', async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 2 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs,
    });
    await expect(svc.setAllocations(actor('director'), {
      allocations: { rm1: [{ key: 'c1|male', n: 3 }] },
    })).rejects.toThrow(/capacity/i);
  });

  it("rejects over-allocating a group beyond its available count", async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 100 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs, // female n = 1
    });
    await expect(svc.setAllocations(actor('director'), {
      allocations: { rm1: [{ key: 'c1|female', n: 2 }] },
    })).rejects.toThrow(/more than available/i);
  });

  // C-1 / H-1: a >50 single-gender classroom pool splits into 7-9 / 10-12 sub-pools whose
  // group keys are 3-part (`churchId|gender|bracket`). Before the fix, setAllocations dropped
  // the bracket on save, so the reloaded 2-part key matched no live group and the allocation
  // silently vanished. This pins the full save→load round-trip for a 3-part key.
  it('round-trips a PC-10 split (3-part) allocation key through persistence', async () => {
    // 60 male classroom youth in grades 7-9 → pool of 60 > 50 → splits; the 7-9 sub-pool
    // has 60 people (no 10-12 youth, no leaders), key `c1|male|7-9`.
    const big = Array.from({ length: 60 }, (_, i) =>
      reg({ id: `m${i}`, churchId: 'c1', gender: 'male', grade: 8 }),
    );
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 100 })],
      churches: [church({ id: 'c1' })],
      registrants: big,
    });
    // Confirm the split actually produced a 3-part key.
    const groups = await svc.listGroups(actor('director'));
    expect(groups.map((g) => g.key)).toContain('c1|male|7-9');

    const map = { rm1: [{ key: 'c1|male|7-9', n: 40 }] };
    const saved = await svc.setAllocations(actor('director'), { allocations: map });
    expect(saved).toEqual(map);
    // The critical assertion: the bracket survives the save/load cycle (was dropped → empty before).
    expect(await svc.getAllocations(actor('admin'))).toEqual(map);
  });

  it('church actor cannot read camp-wide allocations', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1' })] });
    await expect(svc.getAllocations(actor('church', { churchId: 'c1' }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('blocks a non-admin write when accommodation is locked', async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', capacity: 6 })],
      churches: [church({ id: 'c1' })],
      registrants: victoryClassroomRegs,
      settings: settings({ accommodationLocked: true }),
    });
    await expect(svc.setAllocations(actor('director'), {
      allocations: { rm1: [{ key: 'c1|male', n: 1 }] },
    })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// getChurchRooms (church-facing)
// ---------------------------------------------------------------------------
describe('AccommodationService.getChurchRooms', () => {
  it("returns only the requesting church's rooms", async () => {
    const { svc } = await build({
      rooms: [room({ id: 'rm1', name: 'Room 1', capacity: 6 })],
      churches: [church({ id: 'c1', zone: 'Yellow' })],
      registrants: victoryClassroomRegs,
    });
    await svc.setAllocations(actor('director'), { allocations: { rm1: [{ key: 'c1|male', n: 3 }] } });
    const result = await svc.getChurchRooms(actor('church', { churchId: 'c1' }), 'c1');
    expect(result.rooms).toEqual([{ name: 'Room 1', gender: 'male', n: 3 }]);
  });

  it('a church cannot view another church', async () => {
    const { svc } = await build({ churches: [church({ id: 'c2', zone: 'Blue' })] });
    await expect(svc.getChurchRooms(actor('church', { churchId: 'c1' }), 'c2')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFound for an unknown church', async () => {
    const { svc } = await build();
    await expect(svc.getChurchRooms(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
