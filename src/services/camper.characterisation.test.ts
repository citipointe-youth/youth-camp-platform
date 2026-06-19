import { describe, it, expect, beforeEach } from 'vitest';
import { makeCamperService } from './camper.service';
import { InMemoryCamperRepository } from '../repositories/in-memory';
import type { Camper } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// CHARACTERISATION TEST — pins CURRENT behaviour of the camper service so the
// upcoming Person-unification refactor cannot silently change it. Where the
// current behaviour is buggy it is asserted AS-IS with a marker comment.
// Uses only the public CamperService interface + the in-memory repository.
// ---------------------------------------------------------------------------

function camper(over: Partial<Camper>): Camper {
  const now = new Date().toISOString();
  return {
    id: 'c',
    firstName: 'First',
    lastName: 'Last',
    gender: 'male',
    dateOfBirth: null,
    grade: null,
    school: null,
    zone: 'Yellow',
    groupId: null,
    kind: 'student',
    mobile: null,
    email: null,
    suburb: null,
    postcode: null,
    state: null,
    medicalConditions: [],
    dietaryRequirements: [],
    otherMedications: null,
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    parentGuardianName: null,
    parentPhone: null,
    parentRelation: null,
    blueCardNumber: null,
    blueCardExpiry: null,
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

async function seed(repo: InMemoryCamperRepository): Promise<void> {
  // m1: church c1 / Yellow zone / student
  await repo.save(camper({ id: 'm1', churchId: 'c1', zone: 'Yellow', kind: 'student', firstName: 'Alice' }));
  // m2: church c1 / Yellow zone / leader
  await repo.save(camper({ id: 'm2', churchId: 'c1', zone: 'Yellow', kind: 'leader', firstName: 'Bob' }));
  // m3: church c2 / Blue zone / student
  await repo.save(camper({ id: 'm3', churchId: 'c2', zone: 'Blue', kind: 'student', firstName: 'Carol' }));
}

// A minimally valid CreateCamperSchema input (only required fields).
function createInput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'New',
    lastName: 'Camper',
    gender: 'female',
    zone: 'Green',
    kind: 'student',
    churchId: 'c9',
    churchName: 'Riverbend',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// list() — role scoping via canAccessCamper
// ---------------------------------------------------------------------------
describe('CamperService.list — role scoping', () => {
  let repo: InMemoryCamperRepository;
  beforeEach(async () => {
    repo = new InMemoryCamperRepository();
    await repo.init();
    await seed(repo);
  });

  it('a church account sees only its own church (c1)', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('church', { churchId: 'c1' }));
    expect(list.map((c) => c.id).sort()).toEqual(['m1', 'm2']);
  });

  it('a zone leader sees only their own zone (Blue)', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('zoneLeader', { zone: 'Blue' }));
    expect(list.map((c) => c.id)).toEqual(['m3']);
  });

  it('a zone leader with no zone set sees nobody', async () => {
    const svc = makeCamperService(repo);
    // canAccessCamper: zoneLeader requires actor.zone != null, so null zone => empty.
    const list = await svc.list(actor('zoneLeader', { zone: null }));
    expect(list).toEqual([]);
  });

  it('a director sees everyone', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('director'));
    expect(list.map((c) => c.id).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('an admin sees everyone', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('admin'));
    expect(list).toHaveLength(3);
  });

  it('the q filter searches by name then re-applies role scoping', async () => {
    const svc = makeCamperService(repo);
    // q matches Carol (m3, c2/Blue); a c1 church actor is scoped out of it.
    const churchList = await svc.list(actor('church', { churchId: 'c1' }), { q: 'Carol' });
    expect(churchList).toEqual([]);
    const adminList = await svc.list(actor('admin'), { q: 'Carol' });
    expect(adminList.map((c) => c.id)).toEqual(['m3']);
  });

  it('the zone filter narrows the repo query, then scoping is re-applied', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('admin'), { zone: 'Yellow' });
    expect(list.map((c) => c.id).sort()).toEqual(['m1', 'm2']);
  });

  it('the churchId filter narrows the repo query', async () => {
    const svc = makeCamperService(repo);
    const list = await svc.list(actor('admin'), { churchId: 'c2' });
    expect(list.map((c) => c.id)).toEqual(['m3']);
  });

  it('opts precedence is q > zone > churchId (q wins when several are set)', async () => {
    const svc = makeCamperService(repo);
    // q='Alice' matches m1 only; zone/churchId that would broaden are ignored.
    const list = await svc.list(actor('admin'), { q: 'Alice', zone: 'Blue', churchId: 'c2' });
    expect(list.map((c) => c.id)).toEqual(['m1']);
  });
});

// ---------------------------------------------------------------------------
// get() — read scoping + buildProfile derivation
// ---------------------------------------------------------------------------
describe('CamperService.get', () => {
  let repo: InMemoryCamperRepository;
  beforeEach(async () => {
    repo = new InMemoryCamperRepository();
    await repo.init();
    await seed(repo);
  });

  it('returns a CamperProfile with fullName, null age (no dob) and null lastSignOut', async () => {
    const svc = makeCamperService(repo);
    const profile = await svc.get(actor('admin'), 'm1');
    expect(profile.id).toBe('m1');
    expect(profile.fullName).toBe('Alice Last');
    expect(profile.age).toBeNull();
    expect(profile.lastSignOut).toBeNull();
  });

  it('computes lastSignOut from the most recent "out" sign-out event', async () => {
    await repo.save(
      camper({
        id: 'm4',
        churchId: 'c1',
        zone: 'Yellow',
        signOutHistory: [
          { id: 's1', type: 'out', leaderName: 'L', authorId: 'a', timestamp: '2026-01-01T10:00:00.000Z' },
          { id: 's2', type: 'in', leaderName: 'L', authorId: 'a', timestamp: '2026-01-01T12:00:00.000Z' },
          { id: 's3', type: 'out', leaderName: 'L', authorId: 'a', timestamp: '2026-01-01T15:00:00.000Z' },
        ],
      }),
    );
    const svc = makeCamperService(repo);
    const profile = await svc.get(actor('admin'), 'm4');
    // Only 'out' events are considered; the latest of those wins (descending sort).
    expect(profile.lastSignOut).toBe('2026-01-01T15:00:00.000Z');
  });

  it('a church account cannot get a camper from another church (Forbidden)', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.get(actor('church', { churchId: 'c1' }), 'm3')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a church account CAN get a camper from its own church', async () => {
    const svc = makeCamperService(repo);
    const profile = await svc.get(actor('church', { churchId: 'c1' }), 'm1');
    expect(profile.id).toBe('m1');
  });

  it('throws NotFound for an unknown id (before any scoping decision)', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.get(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a role without camper:read is rejected before the lookup', async () => {
    const svc = makeCamperService(repo);
    // No USER_ROLES value lacks camper:read, so simulate an unknown role via a cast.
    const stranger = { ...actor('admin'), role: 'guest' as Actor['role'] };
    await expect(svc.get(stranger, 'm1')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// create() — permissions, defaults, and the kind field
// ---------------------------------------------------------------------------
describe('CamperService.create', () => {
  let repo: InMemoryCamperRepository;
  beforeEach(async () => {
    repo = new InMemoryCamperRepository();
    await repo.init();
  });

  it('a director can create a camper and the kind field is carried through', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(actor('director'), createInput({ kind: 'leader' }));
    expect(created.id).toMatch(/^camper/);
    expect(created.kind).toBe('leader');
    expect(created.firstName).toBe('New');
    expect(created.churchId).toBe('c9');
  });

  it('an admin can create a camper', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(actor('admin'), createInput());
    expect(created.kind).toBe('student');
  });

  it('CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this. ' +
    'A church account CANNOT create a camper because the church role lacks camper:write, ' +
    'even for its own church.', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.create(actor('church', { churchId: 'c1' }), createInput({ churchId: 'c1' }))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('a zone leader CANNOT create a camper (no camper:write)', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.create(actor('zoneLeader', { zone: 'Green' }), createInput())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this. ' +
    'create() does NOT enforce canAccessCamper, so a director/admin (the only roles with write) ' +
    'can create a camper for ANY church/zone with no ownership check.', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(
      actor('director'),
      createInput({ churchId: 'someOtherChurch', zone: 'Red' }),
    );
    expect(created.churchId).toBe('someOtherChurch');
    expect(created.zone).toBe('Red');
  });

  it('always initialises atCamp=false and ignores any atCamp in create input (schema strips it)', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(actor('admin'), createInput({ atCamp: true }));
    // CreateCamperSchema has no atCamp field, so it is dropped; service hard-codes false.
    expect(created.atCamp).toBe(false);
  });

  it('defaults status to "registered" and seeds empty history arrays + default consents', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(actor('admin'), createInput());
    expect(created.status).toBe('registered');
    expect(created.checkInHistory).toEqual([]);
    expect(created.signOutHistory).toEqual([]);
    expect(created.consents).toEqual({
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    });
  });

  it('honours an explicit status passed in create input', async () => {
    const svc = makeCamperService(repo);
    const created = await svc.create(actor('admin'), createInput({ status: 'checked_in' }));
    expect(created.status).toBe('checked_in');
  });

  it('rejects invalid input (missing required churchName) with a thrown error', async () => {
    const svc = makeCamperService(repo);
    const bad = createInput();
    delete bad.churchName;
    await expect(svc.create(actor('admin'), bad)).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// update() — permissions, scoping, status/atCamp transitions, consent merge
// ---------------------------------------------------------------------------
describe('CamperService.update', () => {
  let repo: InMemoryCamperRepository;
  beforeEach(async () => {
    repo = new InMemoryCamperRepository();
    await repo.init();
    await seed(repo);
  });

  it('a director can update status (registered -> checked_in)', async () => {
    const svc = makeCamperService(repo);
    const updated = await svc.update(actor('director'), 'm1', { status: 'checked_in' });
    expect(updated.status).toBe('checked_in');
    expect(updated.id).toBe('m1');
  });

  it('an admin can flip atCamp true/false', async () => {
    const svc = makeCamperService(repo);
    const on = await svc.update(actor('admin'), 'm1', { atCamp: true });
    expect(on.atCamp).toBe(true);
    const off = await svc.update(actor('admin'), 'm1', { atCamp: false });
    expect(off.atCamp).toBe(false);
  });

  it('CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this. ' +
    'A church account CANNOT update its own camper because church lacks camper:write.', async () => {
    const svc = makeCamperService(repo);
    await expect(
      svc.update(actor('church', { churchId: 'c1' }), 'm1', { status: 'checked_in' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a zone leader CANNOT update a camper (no camper:write)', async () => {
    const svc = makeCamperService(repo);
    await expect(
      svc.update(actor('zoneLeader', { zone: 'Yellow' }), 'm1', { status: 'checked_in' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFound for an unknown id', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.update(actor('admin'), 'nope', { status: 'checked_in' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('the kind field can be changed on update (student -> leader)', async () => {
    const svc = makeCamperService(repo);
    const updated = await svc.update(actor('admin'), 'm1', { kind: 'leader' });
    expect(updated.kind).toBe('leader');
  });

  it('CHARACTERISATION: current behaviour — churchId/churchName are NOT updatable via update() ' +
    '(UpdateCamperSchema strips them), so they remain unchanged even if supplied.', async () => {
    const svc = makeCamperService(repo);
    const updated = await svc.update(actor('admin'), 'm1', {
      churchId: 'cZZZ',
      churchName: 'Renamed',
    } as Record<string, unknown>);
    expect(updated.churchId).toBe('c1');
    expect(updated.churchName).toBe('Victory');
  });

  it('merges a partial consents patch onto the existing complete consents record', async () => {
    const svc = makeCamperService(repo);
    const updated = await svc.update(actor('admin'), 'm1', {
      consents: { media: { granted: true, timestamp: '2026-02-02T00:00:00.000Z' } },
    });
    expect(updated.consents.media).toEqual({ granted: true, timestamp: '2026-02-02T00:00:00.000Z' });
    // untouched consent types retain their existing (default) values
    expect(updated.consents.medical).toEqual({ granted: false, timestamp: null });
    expect(updated.consents.supervision).toEqual({ granted: false, timestamp: null });
  });

  it('preserves the original id and bumps updatedAt', async () => {
    const svc = makeCamperService(repo);
    const before = await repo.findById('m1');
    const updated = await svc.update(actor('admin'), 'm1', { firstName: 'Alicia' });
    expect(updated.id).toBe('m1');
    expect(updated.firstName).toBe('Alicia');
    expect(typeof updated.updatedAt).toBe('string');
    expect(before).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// remove() — permissions + not-found
// ---------------------------------------------------------------------------
describe('CamperService.remove', () => {
  let repo: InMemoryCamperRepository;
  beforeEach(async () => {
    repo = new InMemoryCamperRepository();
    await repo.init();
    await seed(repo);
  });

  it('a director can delete a camper', async () => {
    const svc = makeCamperService(repo);
    await svc.remove(actor('director'), 'm1');
    expect(await repo.findById('m1')).toBeNull();
  });

  it('CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this. ' +
    'A church account CANNOT delete its own camper because church lacks camper:write.', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.remove(actor('church', { churchId: 'c1' }), 'm1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('throws NotFound when deleting an unknown id', async () => {
    const svc = makeCamperService(repo);
    await expect(svc.remove(actor('admin'), 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// buildProfile() — exercised directly (it is part of the public interface)
// ---------------------------------------------------------------------------
describe('CamperService.buildProfile', () => {
  it('derives fullName and a numeric age from a date of birth', () => {
    const repo = new InMemoryCamperRepository();
    const svc = makeCamperService(repo);
    const profile = svc.buildProfile(
      camper({ firstName: 'Dee', lastName: 'Eff', dateOfBirth: '2010-06-18' }),
    );
    expect(profile.fullName).toBe('Dee Eff');
    expect(typeof profile.age).toBe('number');
  });

  it('returns null age when there is no date of birth', () => {
    const repo = new InMemoryCamperRepository();
    const svc = makeCamperService(repo);
    const profile = svc.buildProfile(camper({ dateOfBirth: null }));
    expect(profile.age).toBeNull();
  });
});
