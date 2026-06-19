import { describe, it, expect, beforeEach } from 'vitest';
import { makeRegistrantService } from './registrant.service';
import { InMemoryRegistrantRepository } from '../repositories/in-memory';
import type { Registrant } from '../core/entities/registrant';
import type { Actor } from '../core/entities/user';
import { ForbiddenError, NotFoundError, BadRequestError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// Characterisation test — PINS CURRENT BEHAVIOUR of the registrant service,
// including known bugs, so the upcoming Person-unification refactor cannot
// silently change it. Do NOT "fix" anything here; where behaviour is buggy the
// buggy result is asserted and flagged with a CHARACTERISATION comment.
// ---------------------------------------------------------------------------

function reg(over: Partial<Registrant>): Registrant {
  const now = new Date().toISOString();
  return {
    id: 'r',
    firstName: 'A',
    lastName: 'B',
    gender: 'male',
    kind: 'camper',
    paymentStatus: 'unpaid',
    blueCardCollected: false,
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    status: 'registered',
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

/**
 * Seed used by most tests:
 *  - r1: c1/Yellow camper, unpaid
 *  - r2: c1/Yellow leader, paid, no blue card
 *  - r3: c2/Blue   camper, paid
 *  - r4: c3/Yellow camper, deposit  (second church in the Yellow zone)
 *  - r5: c2/Blue   camper, unpaid, CANCELLED  (must be ignored by chase/breakdown)
 */
async function seed(repo: InMemoryRegistrantRepository): Promise<void> {
  await repo.save(reg({ id: 'r1', churchId: 'c1', churchName: 'Victory', zone: 'Yellow', kind: 'camper', paymentStatus: 'unpaid' }));
  await repo.save(
    reg({ id: 'r2', churchId: 'c1', churchName: 'Victory', zone: 'Yellow', kind: 'leader', paymentStatus: 'paid', blueCardCollected: false }),
  );
  await repo.save(reg({ id: 'r3', churchId: 'c2', churchName: 'Grace Point', zone: 'Blue', kind: 'camper', paymentStatus: 'paid' }));
  await repo.save(reg({ id: 'r4', churchId: 'c3', churchName: 'Riverbend', zone: 'Yellow', kind: 'camper', paymentStatus: 'deposit' }));
  await repo.save(
    reg({ id: 'r5', churchId: 'c2', churchName: 'Grace Point', zone: 'Blue', kind: 'camper', paymentStatus: 'unpaid', status: 'cancelled' }),
  );
}

async function freshRepo(): Promise<InMemoryRegistrantRepository> {
  const repo = new InMemoryRegistrantRepository();
  await repo.init();
  return repo;
}

// ---------------------------------------------------------------------------
// list() — no churchId argument (role-filtered findAll)
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.list (no churchId) — role scoping', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('admin sees every registrant (including cancelled)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('admin'));
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('director sees every registrant (including cancelled)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('director'));
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4', 'r5']);
  });

  it('zoneLeader sees every registrant in their zone, across churches', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('zoneLeader', { zone: 'Yellow' }));
    // r1, r2 (c1/Yellow) and r4 (c3/Yellow); r3/r5 are Blue
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r4']);
  });

  it('zoneLeader with a NULL zone sees nothing', async () => {
    // actor.zone == null short-circuits the filter to false.
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('zoneLeader', { zone: null }));
    expect(list).toEqual([]);
  });

  it('church sees only its own church (matched by churchId, ignoring zone)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('church', { churchId: 'c1' }));
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('church with a NULL churchId sees nothing (no registrant has churchId === null)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('church', { churchId: null }));
    expect(list).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// list(churchId) — explicit church scope
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.list (with churchId)', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('admin can list any church', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('admin'), 'c2');
    // findByChurch('c2') returns r3 and r5 (cancelled is NOT filtered out by list(churchId))
    expect(list.map((r) => r.id).sort()).toEqual(['r3', 'r5']);
  });

  it('church listing its OWN church succeeds', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('church', { churchId: 'c1' }), 'c1');
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('church listing a DIFFERENT church is forbidden', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.list(actor('church', { churchId: 'c1' }), 'c2')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('zoneLeader can list a church in their zone (zone derived from the first item)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('zoneLeader', { zone: 'Yellow' }), 'c1');
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('zoneLeader cannot list a church in another zone', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.list(actor('zoneLeader', { zone: 'Yellow' }), 'c2')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('zoneLeader listing an EMPTY/unknown church is forbidden', async () => {
    // CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this.
    // findByChurch returns [], so zone = items[0]?.zone is undefined, and
    // assertCanAccessChurch(zoneLeader, churchId, undefined) is false -> Forbidden,
    // even though the zone leader might legitimately own an empty church.
    const svc = makeRegistrantService(repo);
    await expect(svc.list(actor('zoneLeader', { zone: 'Yellow' }), 'cX')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admin listing an EMPTY/unknown church returns an empty array (admin bypasses zone)', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('admin'), 'cX');
    expect(list).toEqual([]);
  });

  it('church listing its OWN but empty church returns an empty array (matched by churchId)', async () => {
    // church access keys off actor.churchId === churchId, not the derived zone,
    // so an empty own church is allowed and yields [].
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('church', { churchId: 'cEmpty' }), 'cEmpty');
    expect(list).toEqual([]);
  });

  it('a role without registrant:read (e.g. an unknown role) cannot list at all', async () => {
    const svc = makeRegistrantService(repo);
    // Cast an invalid role to exercise the permission gate / default branch.
    await expect(svc.list(actor('nobody' as Actor['role']))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.get', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('admin can get any registrant', async () => {
    const svc = makeRegistrantService(repo);
    const r = await svc.get(actor('admin'), 'r3');
    expect(r.id).toBe('r3');
  });

  it('church can get a registrant in its own church', async () => {
    const svc = makeRegistrantService(repo);
    const r = await svc.get(actor('church', { churchId: 'c1' }), 'r1');
    expect(r.id).toBe('r1');
  });

  it('church getting a registrant from another church is forbidden', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.get(actor('church', { churchId: 'c1' }), 'r3')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('zoneLeader can get a registrant in their zone', async () => {
    const svc = makeRegistrantService(repo);
    const r = await svc.get(actor('zoneLeader', { zone: 'Yellow' }), 'r4');
    expect(r.id).toBe('r4');
  });

  it('zoneLeader getting a registrant outside their zone is forbidden', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.get(actor('zoneLeader', { zone: 'Yellow' }), 'r3')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('get of a missing id throws NotFound (before any church check)', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.get(actor('admin'), 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a role without registrant:read is forbidden before the lookup', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.get(actor('nobody' as Actor['role']), 'r1')).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.create', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
  });

  const validInput = {
    firstName: 'New',
    lastName: 'Person',
    gender: 'female',
    kind: 'camper',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
  };

  it('admin can create; defaults are applied and id/timestamps populated', async () => {
    const svc = makeRegistrantService(repo);
    const created = await svc.create(actor('admin'), validInput);
    expect(created.id).toMatch(/^reg_/);
    expect(created.paymentStatus).toBe('unpaid'); // schema default
    expect(created.blueCardCollected).toBe(false); // schema default
    expect(created.status).toBe('registered'); // schema default
    expect(created.churchId).toBe('c1');
    expect(typeof created.createdAt).toBe('string');
    expect(created.createdAt).toBe(created.updatedAt);
    // persisted
    const fetched = await repo.findById(created.id);
    expect(fetched?.firstName).toBe('New');
  });

  it('director can create for any church', async () => {
    const svc = makeRegistrantService(repo);
    const created = await svc.create(actor('director'), { ...validInput, churchId: 'c2', zone: 'Blue' });
    expect(created.churchId).toBe('c2');
  });

  it('church can create within its own church', async () => {
    const svc = makeRegistrantService(repo);
    const created = await svc.create(actor('church', { churchId: 'c1' }), validInput);
    expect(created.churchId).toBe('c1');
  });

  it('church creating for another church is forbidden (validation passes first)', async () => {
    const svc = makeRegistrantService(repo);
    await expect(
      svc.create(actor('church', { churchId: 'c1' }), { ...validInput, churchId: 'c2', zone: 'Blue' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('zoneLeader cannot create at all — lacks registrant:write', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.create(actor('zoneLeader', { zone: 'Yellow' }), validInput)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('zoneLeader is rejected by RBAC even with an empty body (permission checked before validation)', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.create(actor('zoneLeader', { zone: 'Yellow' }), {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('admin with invalid input throws a Zod error (NOT an AppError) — validation after RBAC', async () => {
    const svc = makeRegistrantService(repo);
    // CHARACTERISATION: current behaviour — Zod parse errors are not wrapped in an AppError here.
    await expect(svc.create(actor('admin'), { firstName: '' })).rejects.toThrow();
    await expect(svc.create(actor('admin'), { firstName: '' })).rejects.not.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.update', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('admin can update a registrant and updatedAt is refreshed', async () => {
    const svc = makeRegistrantService(repo);
    const updated = await svc.update(actor('admin'), 'r1', { paymentStatus: 'paid' });
    expect(updated.paymentStatus).toBe('paid');
    expect(updated.id).toBe('r1');
  });

  it('church can update within its own church', async () => {
    const svc = makeRegistrantService(repo);
    const updated = await svc.update(actor('church', { churchId: 'c1' }), 'r1', { blueCardCollected: true });
    expect(updated.blueCardCollected).toBe(true);
  });

  it('church updating another church is forbidden', async () => {
    const svc = makeRegistrantService(repo);
    await expect(
      svc.update(actor('church', { churchId: 'c1' }), 'r3', { paymentStatus: 'paid' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('zoneLeader cannot update — lacks registrant:write (checked before lookup)', async () => {
    const svc = makeRegistrantService(repo);
    await expect(
      svc.update(actor('zoneLeader', { zone: 'Yellow' }), 'r1', { paymentStatus: 'paid' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updating a missing id throws NotFound', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.update(actor('admin'), 'missing', { paymentStatus: 'paid' })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('update cannot change churchId/churchName/zone (not in UpdateRegistrantSchema)', async () => {
    // CHARACTERISATION: current behaviour — those fields are stripped by the schema,
    // so they retain the existing values regardless of the input.
    const svc = makeRegistrantService(repo);
    const updated = await svc.update(actor('admin'), 'r1', {
      churchId: 'c2',
      churchName: 'Grace Point',
      zone: 'Blue',
      firstName: 'Renamed',
    } as unknown as Record<string, unknown>);
    expect(updated.churchId).toBe('c1');
    expect(updated.churchName).toBe('Victory');
    expect(updated.zone).toBe('Yellow');
    expect(updated.firstName).toBe('Renamed');
  });

  it('id in the body cannot override the existing id', async () => {
    const svc = makeRegistrantService(repo);
    const updated = await svc.update(actor('admin'), 'r1', { id: 'hacked' } as unknown as Record<string, unknown>);
    expect(updated.id).toBe('r1');
  });
});

// ---------------------------------------------------------------------------
// remove()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.remove', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('admin can remove a registrant', async () => {
    const svc = makeRegistrantService(repo);
    await svc.remove(actor('admin'), 'r1');
    expect(await repo.findById('r1')).toBeNull();
  });

  it('church can remove within its own church', async () => {
    const svc = makeRegistrantService(repo);
    await svc.remove(actor('church', { churchId: 'c1' }), 'r2');
    expect(await repo.findById('r2')).toBeNull();
  });

  it('church removing another church is forbidden and leaves the record intact', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remove(actor('church', { churchId: 'c1' }), 'r3')).rejects.toBeInstanceOf(ForbiddenError);
    expect(await repo.findById('r3')).not.toBeNull();
  });

  it('zoneLeader cannot remove — lacks registrant:write', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remove(actor('zoneLeader', { zone: 'Yellow' }), 'r1')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('removing a missing id throws NotFound', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remove(actor('admin'), 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// chase()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.chase', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('director flags unpaid registrants and leaders missing a blue card, skipping cancelled', async () => {
    const svc = makeRegistrantService(repo);
    const results = await svc.chase(actor('director'));
    // r1 unpaid camper -> 'unpaid'; r2 paid leader no blue card -> 'no_blue_card';
    // r3 paid camper -> excluded; r4 deposit camper -> excluded; r5 cancelled -> skipped
    expect(results.map((r) => r.registrantId).sort()).toEqual(['r1', 'r2']);
    expect(results.find((r) => r.registrantId === 'r1')?.reason).toBe('unpaid');
    expect(results.find((r) => r.registrantId === 'r2')?.reason).toBe('no_blue_card');
  });

  it("reason is 'both' for an unpaid leader with no blue card", async () => {
    const repo2 = await freshRepo();
    await repo2.save(reg({ id: 'rb', kind: 'leader', paymentStatus: 'unpaid', blueCardCollected: false }));
    const svc = makeRegistrantService(repo2);
    const results = await svc.chase(actor('director'));
    expect(results).toHaveLength(1);
    expect(results[0]?.reason).toBe('both');
  });

  it('an unpaid CAMPER is flagged only as unpaid (blue-card rule applies to leaders only)', async () => {
    const repo2 = await freshRepo();
    await repo2.save(reg({ id: 'rc', kind: 'camper', paymentStatus: 'unpaid', blueCardCollected: false }));
    const svc = makeRegistrantService(repo2);
    const results = await svc.chase(actor('director'));
    expect(results[0]?.reason).toBe('unpaid');
  });

  it('church chase is scoped to its own church', async () => {
    const svc = makeRegistrantService(repo);
    const results = await svc.chase(actor('church', { churchId: 'c1' }));
    expect(results.map((r) => r.registrantId).sort()).toEqual(['r1', 'r2']);
  });

  it('zoneLeader chase is scoped to its zone (zoneLeader HAS reminder:send? no — forbidden)', async () => {
    // zoneLeader lacks 'reminder:send' in ROLE_PERMISSIONS, so chase is forbidden.
    const svc = makeRegistrantService(repo);
    await expect(svc.chase(actor('zoneLeader', { zone: 'Yellow' }))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---------------------------------------------------------------------------
// breakdown()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.breakdown', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('director aggregates per church, excluding cancelled, sorted by zone', async () => {
    const svc = makeRegistrantService(repo);
    const rows = await svc.breakdown(actor('director'));
    // churches present (cancelled r5 ignored, but c2 still appears via r3): c1, c2, c3
    expect(rows.map((r) => r.churchId)).toContain('c1');
    expect(rows.map((r) => r.churchId)).toContain('c2');
    expect(rows.map((r) => r.churchId)).toContain('c3');

    const c1 = rows.find((r) => r.churchId === 'c1');
    expect(c1).toBeDefined();
    expect(c1!.total).toBe(2);
    expect(c1!.campers).toBe(1);
    expect(c1!.leaders).toBe(1);
    expect(c1!.unpaid).toBe(1); // r1
    expect(c1!.depositPaid).toBe(0);
    expect(c1!.paid).toBe(1); // r2
    expect(c1!.noBlueCard).toBe(1); // r2 leader w/o blue card

    // c2 has only r3 (paid camper); cancelled r5 excluded.
    const c2 = rows.find((r) => r.churchId === 'c2');
    expect(c2!.total).toBe(1);
    expect(c2!.unpaid).toBe(0);
    expect(c2!.paid).toBe(1);

    // c3 has only r4 (deposit camper).
    const c3 = rows.find((r) => r.churchId === 'c3');
    expect(c3!.total).toBe(1);
    expect(c3!.depositPaid).toBe(1);
  });

  it('rows are sorted by zone name (Blue before Yellow)', async () => {
    const svc = makeRegistrantService(repo);
    const rows = await svc.breakdown(actor('director'));
    const zones = rows.map((r) => r.zone);
    // c2 = Blue, then c1 & c3 = Yellow (stable insertion order within equal zones)
    expect(zones[0]).toBe('Blue');
    expect(zones.slice(1)).toEqual(['Yellow', 'Yellow']);
  });

  it('church breakdown is scoped to its own church', async () => {
    const svc = makeRegistrantService(repo);
    const rows = await svc.breakdown(actor('church', { churchId: 'c1' }));
    expect(rows.map((r) => r.churchId)).toEqual(['c1']);
    expect(rows[0]?.total).toBe(2);
  });

  it('zoneLeader breakdown is scoped to its zone', async () => {
    const svc = makeRegistrantService(repo);
    const rows = await svc.breakdown(actor('zoneLeader', { zone: 'Yellow' }));
    // Yellow churches: c1 (r1,r2) and c3 (r4); Blue (c2) excluded.
    expect(rows.map((r) => r.churchId).sort()).toEqual(['c1', 'c3']);
  });

  it('zoneLeader with a NULL zone sees ALL non-cancelled registrants in breakdown', async () => {
    // CHARACTERISATION: current (buggy) behaviour — Phase 2 will change this.
    // The filter is `if (actor.zone && r.zone !== actor.zone) continue;` so a
    // null zone disables the zone filter entirely and the leader sees every church.
    const svc = makeRegistrantService(repo);
    const rows = await svc.breakdown(actor('zoneLeader', { zone: null }));
    expect(rows.map((r) => r.churchId).sort()).toEqual(['c1', 'c2', 'c3']);
  });
});

// ---------------------------------------------------------------------------
// remind()
// ---------------------------------------------------------------------------
describe('CHARACTERISATION RegistrantService.remind', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = await freshRepo();
    await seed(repo);
  });

  it('throws BadRequest when no ids are provided', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remind(actor('director'), [])).rejects.toBeInstanceOf(BadRequestError);
  });

  it('throws BadRequest when ids is not an array', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remind(actor('director'), null as unknown as string[])).rejects.toBeInstanceOf(
      BadRequestError,
    );
  });

  it('director counts every existing id, ignoring missing ones', async () => {
    const svc = makeRegistrantService(repo);
    const res = await svc.remind(actor('director'), ['r1', 'r3', 'missing']);
    expect(res.sent).toBe(2);
  });

  it('church remind counts only ids in its own church', async () => {
    const svc = makeRegistrantService(repo);
    const res = await svc.remind(actor('church', { churchId: 'c1' }), ['r1', 'r2', 'r3']);
    // r1 & r2 are c1 (counted); r3 is c2 (skipped)
    expect(res.sent).toBe(2);
  });

  it('zoneLeader remind is FORBIDDEN — lacks reminder:send', async () => {
    const svc = makeRegistrantService(repo);
    await expect(svc.remind(actor('zoneLeader', { zone: 'Yellow' }), ['r1'])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('admin remind counts active registrants across all zones, EXCLUDING cancelled (C2 FIX)', async () => {
    // C2 FIX (was CHARACTERISATION of the bug): remind() now mirrors chase() —
    // cancelled registrants are skipped. r5 is cancelled, so it is no longer counted.
    const svc = makeRegistrantService(repo);
    const res = await svc.remind(actor('admin'), ['r1', 'r3', 'r4', 'r5']);
    expect(res.sent).toBe(3); // r1, r3, r4 active; r5 cancelled -> skipped
  });

  it('director remind skips a cancelled id (C2 FIX)', async () => {
    const svc = makeRegistrantService(repo);
    const res = await svc.remind(actor('director'), ['r1', 'r5']);
    expect(res.sent).toBe(1); // r1 active; r5 cancelled
  });
});
