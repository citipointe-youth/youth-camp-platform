import { describe, it, expect, beforeEach } from 'vitest';
import { makeAccommodationService } from './accommodation.service';
import {
  InMemoryAccommodationRepository,
  InMemoryChurchRepository,
  InMemorySettingsRepository,
  InMemoryPersonRepository,
} from '../repositories/in-memory';
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { Church, AccommodationReservation } from '../core/entities/church';
import type { CampSettings } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';
import type { Person } from '../core/entities/person';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// Builders — mirror the seed/actor pattern used in registrant.service.test.ts
// ---------------------------------------------------------------------------
function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

function block(over: Partial<AccommodationBlock>): AccommodationBlock {
  const now = new Date().toISOString();
  return {
    id: 'b',
    kind: 'tent',
    name: 'Tent A',
    price: 100,
    capacity: 10,
    baseTaken: 0,
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function church(over: Partial<Church>): Church {
  const now = new Date().toISOString();
  return {
    id: 'c1',
    name: 'Victory',
    zone: 'Yellow',
    reservations: [],
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
    campMode: 'pre-camp',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

async function build(opts: {
  blocks?: AccommodationBlock[];
  churches?: Church[];
  settings?: CampSettings | null;
  registrants?: Person[];
} = {}): Promise<{
  svc: ReturnType<typeof makeAccommodationService>;
  blockRepo: InMemoryAccommodationRepository;
  churchRepo: InMemoryChurchRepository;
  settingsRepo: InMemorySettingsRepository;
  personRepo: InMemoryPersonRepository;
}> {
  const blockRepo = new InMemoryAccommodationRepository();
  const churchRepo = new InMemoryChurchRepository();
  const settingsRepo = new InMemorySettingsRepository();
  const personRepo = new InMemoryPersonRepository();
  await blockRepo.init();
  await churchRepo.init();
  await settingsRepo.init();
  await personRepo.init();
  for (const b of opts.blocks ?? []) await blockRepo.save(b);
  for (const c of opts.churches ?? []) await churchRepo.save(c);
  for (const r of opts.registrants ?? []) await personRepo.save(r);
  if (opts.settings) await settingsRepo.saveSingleton(opts.settings);
  const svc = makeAccommodationService(blockRepo, churchRepo, settingsRepo, personRepo);
  return { svc, blockRepo, churchRepo, settingsRepo, personRepo };
}

// ---------------------------------------------------------------------------
// listBlocks / getBlock — available math
// ---------------------------------------------------------------------------
describe('AccommodationService.listBlocks — available math (B1 FIX)', () => {
  it('subtracts assigned (non-cancelled) registrant occupants from availability', async () => {
    // B1 FIX (was CHARACTERISATION of the bug): getLiveBlocks now routes through
    // the shared occupancy module, so assigned registrants reduce availability.
    // Church-level reservations remain a separate concept and are NOT subtracted
    // (documented decision — see accommodation-occupancy.ts / CHANGELOG KNOWN RISKS).
    const { svc } = await build({
      blocks: [block({ id: 'b1', kind: 'tent', name: 'Tent A', capacity: 10, baseTaken: 3 })],
      registrants: [
        reg({ id: 'r1', accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
        reg({ id: 'r2', accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
      ],
      churches: [
        church({
          id: 'c1',
          reservations: [{ kind: 'tent', spots: 4, label: 'Tent A', confirmed: true }],
        }),
      ],
    });
    const list = await svc.listBlocks(actor('admin'));
    expect(list).toHaveLength(1);
    expect(list[0]!.liveTaken).toBe(5); // baseTaken 3 + r1 + r2 (reservations NOT counted)
    expect(list[0]!.available).toBe(5); // 10 - 5
  });

  it('ignores cancelled registrants and non-matching assignments', async () => {
    // B1 FIX: matching is by kind + label === block.name; cancelled excluded.
    const { svc } = await build({
      blocks: [block({ id: 'b1', kind: 'tent', name: 'Tent A', capacity: 10, baseTaken: 0 })],
      registrants: [
        reg({ id: 'r1', accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
        reg({ id: 'r2', accommodationKind: 'tent', accommodationLabel: 'Tent A', status: 'cancelled' }),
        reg({ id: 'r3', accommodationKind: 'tent', accommodationLabel: 'No Such' }),
        reg({ id: 'r4', accommodationKind: null, accommodationLabel: null }),
      ],
    });
    const list = await svc.listBlocks(actor('director'));
    expect(list[0]!.liveTaken).toBe(1); // only r1 matches and is active
    expect(list[0]!.available).toBe(9);
  });

  it('with no registrants, liveTaken equals baseTaken', async () => {
    const { svc } = await build({
      blocks: [block({ id: 'b1', kind: 'tent', name: 'Tent A', capacity: 10, baseTaken: 0 })],
    });
    const list = await svc.listBlocks(actor('director'));
    expect(list[0]!.liveTaken).toBe(0);
    expect(list[0]!.available).toBe(10);
  });

  it('available can go negative when baseTaken exceeds capacity (no clamping)', async () => {
    // CHARACTERISATION: current behaviour — no Math.max clamp on available.
    const { svc } = await build({
      blocks: [block({ id: 'b1', capacity: 5, baseTaken: 8 })],
    });
    const list = await svc.listBlocks(actor('admin'));
    expect(list[0]!.available).toBe(-3);
  });
});

describe('AccommodationService.listBlocks — RBAC', () => {
  it.each(['church', 'zoneLeader', 'director', 'admin'] as const)(
    'role %s can list (has registrant:read)',
    async (role) => {
      const { svc } = await build({ blocks: [block({ id: 'b1' })] });
      const list = await svc.listBlocks(actor(role, { churchId: 'c1', zone: 'Yellow' }));
      expect(list).toHaveLength(1);
    },
  );
});

describe('AccommodationService.getBlock', () => {
  it('with no occupants, liveTaken == baseTaken (B1 fix consistent here)', async () => {
    const { svc } = await build({
      blocks: [block({ id: 'b1', capacity: 12, baseTaken: 2 })],
    });
    const got = await svc.getBlock(actor('church', { churchId: 'c1' }), 'b1');
    expect(got.liveTaken).toBe(2);
    expect(got.available).toBe(10);
  });

  it('subtracts assigned occupants for a single block (B1 fix)', async () => {
    const { svc } = await build({
      blocks: [block({ id: 'b1', kind: 'tent', name: 'Tent A', capacity: 12, baseTaken: 2 })],
      registrants: [reg({ id: 'r1', accommodationKind: 'tent', accommodationLabel: 'Tent A' })],
    });
    const got = await svc.getBlock(actor('admin'), 'b1');
    expect(got.liveTaken).toBe(3); // baseTaken 2 + r1
    expect(got.available).toBe(9);
  });

  it('throws NotFoundError for an unknown id', async () => {
    const { svc } = await build({ blocks: [block({ id: 'b1' })] });
    await expect(svc.getBlock(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// computeLiveTaken — exposed helper (this DOES count reservations-free occupancy)
// ---------------------------------------------------------------------------
describe('AccommodationService.computeLiveTaken (helper, not used by listBlocks)', () => {
  it('starts from baseTaken and adds one per matching non-cancelled person', async () => {
    const { svc } = await build();
    const blocks = [
      block({ id: 'b1', kind: 'tent', name: 'Tent A', baseTaken: 1 }),
      block({ id: 'b2', kind: 'classroom', name: 'Room 1', baseTaken: 0 }),
    ];
    const persons = [
      reg({ id: 'r1', accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
      reg({ id: 'r2', accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
      reg({ id: 'r3', accommodationKind: 'classroom', accommodationLabel: 'Room 1', status: 'cancelled' }),
      reg({ id: 'r4', accommodationKind: 'classroom', accommodationLabel: 'Room 1' }),
      reg({ id: 'r5', accommodationKind: 'tent', accommodationLabel: 'No Such' }), // no match
      reg({ id: 'r6', accommodationKind: null, accommodationLabel: null }), // unassigned
    ];
    const taken = svc.computeLiveTaken(blocks, persons);
    expect(taken.get('b1')).toBe(3); // baseTaken 1 + r1 + r2
    expect(taken.get('b2')).toBe(1); // baseTaken 0 + r4 (r3 cancelled, skipped)
  });
});

// ---------------------------------------------------------------------------
// createBlock — admin gating + lock
// ---------------------------------------------------------------------------
describe('AccommodationService.createBlock', () => {
  const input = { kind: 'tent', name: 'New Tent', price: 50, capacity: 8 };

  it('admin creates a block and baseTaken defaults to 0', async () => {
    const { svc } = await build();
    const created = await svc.createBlock(actor('admin'), input);
    expect(created.name).toBe('New Tent');
    expect(created.baseTaken).toBe(0);
    expect(created.capacity).toBe(8);
    expect(created.id).toMatch(/^block_/);
  });

  it('honours an explicit baseTaken', async () => {
    const { svc } = await build();
    const created = await svc.createBlock(actor('admin'), { ...input, baseTaken: 4 });
    expect(created.baseTaken).toBe(4);
  });

  it.each(['church', 'zoneLeader', 'director'] as const)(
    'role %s cannot create (no admin:manage)',
    async (role) => {
      const { svc } = await build();
      await expect(svc.createBlock(actor(role), input)).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  it('admin can create even when accommodation is locked (admin bypasses lock)', async () => {
    const { svc } = await build({ settings: settings({ accommodationLocked: true }) });
    const created = await svc.createBlock(actor('admin'), input);
    expect(created.name).toBe('New Tent');
  });

  it('rejects invalid input via Zod (capacity < 1)', async () => {
    const { svc } = await build();
    await expect(svc.createBlock(actor('admin'), { ...input, capacity: 0 })).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// updateBlock
// ---------------------------------------------------------------------------
describe('AccommodationService.updateBlock', () => {
  it('admin updates fields and preserves the id', async () => {
    const { svc } = await build({ blocks: [block({ id: 'b1', name: 'Old', capacity: 10 })] });
    const updated = await svc.updateBlock(actor('admin'), 'b1', { name: 'Renamed', capacity: 20 });
    expect(updated.id).toBe('b1');
    expect(updated.name).toBe('Renamed');
    expect(updated.capacity).toBe(20);
  });

  it('throws NotFoundError for an unknown id (admin)', async () => {
    const { svc } = await build({ blocks: [block({ id: 'b1' })] });
    await expect(svc.updateBlock(actor('admin'), 'nope', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('non-admin is forbidden BEFORE the not-found check (RBAC first)', async () => {
    // CHARACTERISATION: assertCan runs before findById, so a non-admin hitting
    // an unknown id still gets ForbiddenError, not NotFoundError.
    const { svc } = await build({ blocks: [block({ id: 'b1' })] });
    await expect(svc.updateBlock(actor('director'), 'nope', { name: 'X' })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

// ---------------------------------------------------------------------------
// deleteBlock
// ---------------------------------------------------------------------------
describe('AccommodationService.deleteBlock', () => {
  it('admin deletes an existing block', async () => {
    const { svc, blockRepo } = await build({ blocks: [block({ id: 'b1' })] });
    await svc.deleteBlock(actor('admin'), 'b1');
    expect(await blockRepo.findById('b1')).toBeNull();
  });

  it('throws NotFoundError when deleting an unknown id', async () => {
    const { svc } = await build();
    await expect(svc.deleteBlock(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it.each(['church', 'zoneLeader', 'director'] as const)(
    'role %s cannot delete (no admin:manage)',
    async (role) => {
      const { svc } = await build({ blocks: [block({ id: 'b1' })] });
      await expect(svc.deleteBlock(actor(role), 'b1')).rejects.toBeInstanceOf(ForbiddenError);
    },
  );

  it('admin can delete even when locked', async () => {
    const { svc, blockRepo } = await build({
      blocks: [block({ id: 'b1' })],
      settings: settings({ accommodationLocked: true }),
    });
    await svc.deleteBlock(actor('admin'), 'b1');
    expect(await blockRepo.findById('b1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Lock gating for non-admin write paths (createBlock is admin-only so the lock
// is moot there; setReservations is the realistic non-admin write path)
// ---------------------------------------------------------------------------
describe('AccommodationService lock gating', () => {
  it('createBlock by a non-admin is forbidden by RBAC before the lock is consulted', async () => {
    // CHARACTERISATION: assertCan('admin:manage') runs before assertNotLocked,
    // and only admins reach assertNotLocked anyway (which they bypass).
    const { svc } = await build({ settings: settings({ accommodationLocked: true }) });
    await expect(
      svc.createBlock(actor('director'), { kind: 'tent', name: 'T', price: 1, capacity: 1 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// setReservations
// ---------------------------------------------------------------------------
describe('AccommodationService.setReservations', () => {
  const reservations: AccommodationReservation[] = [
    { kind: 'tent', spots: 5, label: 'Tent A', confirmed: false },
  ];

  it('a church sets reservations for its own church and they persist', async () => {
    const { svc, churchRepo } = await build({ churches: [church({ id: 'c1', zone: 'Yellow' })] });
    const result = await svc.setReservations(actor('church', { churchId: 'c1' }), {
      churchId: 'c1',
      reservations,
    });
    expect(result).toEqual(reservations);
    const saved = await churchRepo.findById('c1');
    expect(saved!.reservations).toEqual(reservations);
  });

  it('confirmed defaults to false when omitted in a reservation patch', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Yellow' })] });
    const result = await svc.setReservations(actor('admin'), {
      churchId: 'c1',
      reservations: [{ kind: 'tent', spots: 2, label: 'Tent A' }],
    });
    expect(result[0]!.confirmed).toBe(false);
  });

  it('a church cannot set reservations for another church', async () => {
    const { svc } = await build({ churches: [church({ id: 'c2', zone: 'Blue' })] });
    await expect(
      svc.setReservations(actor('church', { churchId: 'c1' }), { churchId: 'c2', reservations }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a zone leader can set reservations for a church in their zone', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Yellow' })] });
    const result = await svc.setReservations(actor('zoneLeader', { zone: 'Yellow' }), {
      churchId: 'c1',
      reservations,
    });
    expect(result).toEqual(reservations);
  });

  it('a zone leader cannot set reservations for a church outside their zone', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Blue' })] });
    await expect(
      svc.setReservations(actor('zoneLeader', { zone: 'Yellow' }), { churchId: 'c1', reservations }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('director and admin can set reservations for any church', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Green' })] });
    await expect(
      svc.setReservations(actor('director'), { churchId: 'c1', reservations }),
    ).resolves.toEqual(reservations);
    await expect(
      svc.setReservations(actor('admin'), { churchId: 'c1', reservations }),
    ).resolves.toEqual(reservations);
  });

  it('throws NotFoundError for an unknown church', async () => {
    const { svc } = await build();
    await expect(
      svc.setReservations(actor('admin'), { churchId: 'nope', reservations }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lock blocks a non-admin BEFORE the church is looked up', async () => {
    // CHARACTERISATION: parse -> assertNotLocked -> findById(church). So when
    // locked, a non-admin with a *non-existent* churchId gets ForbiddenError
    // (the lock), NOT NotFoundError.
    const { svc } = await build({ settings: settings({ accommodationLocked: true }) });
    await expect(
      svc.setReservations(actor('church', { churchId: 'nope' }), { churchId: 'nope', reservations }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admin bypasses the lock and can set reservations while locked', async () => {
    const { svc } = await build({
      churches: [church({ id: 'c1', zone: 'Yellow' })],
      settings: settings({ accommodationLocked: true }),
    });
    await expect(
      svc.setReservations(actor('admin'), { churchId: 'c1', reservations }),
    ).resolves.toEqual(reservations);
  });

  it('a church is blocked by the lock for its own church', async () => {
    const { svc } = await build({
      churches: [church({ id: 'c1', zone: 'Yellow' })],
      settings: settings({ accommodationLocked: true }),
    });
    await expect(
      svc.setReservations(actor('church', { churchId: 'c1' }), { churchId: 'c1', reservations }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects invalid input via Zod (missing churchId)', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Yellow' })] });
    await expect(
      svc.setReservations(actor('admin'), { reservations }),
    ).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// listHeldByChurch
// ---------------------------------------------------------------------------
describe('AccommodationService.listHeldByChurch', () => {
  const held: AccommodationReservation[] = [
    { kind: 'classroom', spots: 3, label: 'Room 1', confirmed: true },
  ];

  it('returns the reservations held by an accessible church', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Yellow', reservations: held })] });
    const result = await svc.listHeldByChurch(actor('church', { churchId: 'c1' }), 'c1');
    expect(result).toEqual(held);
  });

  it('returns [] for a church with no reservations', async () => {
    const { svc } = await build({ churches: [church({ id: 'c1', zone: 'Yellow', reservations: [] })] });
    const result = await svc.listHeldByChurch(actor('admin'), 'c1');
    expect(result).toEqual([]);
  });

  it('a church cannot view another church', async () => {
    const { svc } = await build({ churches: [church({ id: 'c2', zone: 'Blue', reservations: held })] });
    await expect(
      svc.listHeldByChurch(actor('church', { churchId: 'c1' }), 'c2'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a zone leader can view churches in their zone but not outside it', async () => {
    const { svc } = await build({
      churches: [church({ id: 'c1', zone: 'Yellow', reservations: held })],
    });
    await expect(
      svc.listHeldByChurch(actor('zoneLeader', { zone: 'Yellow' }), 'c1'),
    ).resolves.toEqual(held);
    await expect(
      svc.listHeldByChurch(actor('zoneLeader', { zone: 'Blue' }), 'c1'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for an unknown church', async () => {
    const { svc } = await build();
    await expect(svc.listHeldByChurch(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});
