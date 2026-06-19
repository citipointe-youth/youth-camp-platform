import { describe, it, expect, beforeEach } from 'vitest';
import { makeRegistrantService } from './registrant.service';
import { InMemoryRegistrantRepository } from '../repositories/in-memory';
import type { Registrant } from '../core/entities/registrant';
import type { Actor } from '../core/entities/user';
import { ForbiddenError } from '../core/errors/app-error';

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

async function seed(repo: InMemoryRegistrantRepository): Promise<void> {
  await repo.save(reg({ id: 'r1', churchId: 'c1', zone: 'Yellow', kind: 'camper', paymentStatus: 'unpaid' }));
  await repo.save(
    reg({ id: 'r2', churchId: 'c1', zone: 'Yellow', kind: 'leader', paymentStatus: 'paid', blueCardCollected: false }),
  );
  await repo.save(reg({ id: 'r3', churchId: 'c2', zone: 'Blue', kind: 'camper', paymentStatus: 'paid' }));
}

describe('RegistrantService.list — role scoping', () => {
  let repo: InMemoryRegistrantRepository;
  beforeEach(async () => {
    repo = new InMemoryRegistrantRepository();
    await repo.init();
    await seed(repo);
  });

  it('a church account sees only its own church', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('church', { churchId: 'c1' }));
    expect(list.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('a zone leader sees only their zone', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('zoneLeader', { zone: 'Blue' }));
    expect(list.map((r) => r.id)).toEqual(['r3']);
  });

  it('a director sees everyone', async () => {
    const svc = makeRegistrantService(repo);
    const list = await svc.list(actor('director'));
    expect(list).toHaveLength(3);
  });
});

describe('RegistrantService.breakdown', () => {
  it('aggregates campers/leaders/unpaid/noBlueCard per church', async () => {
    const repo = new InMemoryRegistrantRepository();
    await repo.init();
    await seed(repo);
    const svc = makeRegistrantService(repo);

    const rows = await svc.breakdown(actor('director'));
    const c1 = rows.find((r) => r.churchId === 'c1');
    expect(c1).toBeDefined();
    expect(c1!.total).toBe(2);
    expect(c1!.campers).toBe(1);
    expect(c1!.leaders).toBe(1);
    expect(c1!.unpaid).toBe(1);
    expect(c1!.noBlueCard).toBe(1); // the leader still needs a blue card
  });
});

describe('RegistrantService.chase', () => {
  it('flags unpaid registrants and leaders missing a blue card', async () => {
    const repo = new InMemoryRegistrantRepository();
    await repo.init();
    await seed(repo);
    const svc = makeRegistrantService(repo);

    const results = await svc.chase(actor('director'));
    // r1 = unpaid camper, r2 = leader with no blue card; r3 = paid camper -> excluded
    expect(results.map((r) => r.registrantId).sort()).toEqual(['r1', 'r2']);
    expect(results.find((r) => r.registrantId === 'r2')?.reason).toBe('no_blue_card');
  });
});

describe('RegistrantService RBAC', () => {
  it('a zone leader cannot create a registrant (no registrant:write)', async () => {
    const repo = new InMemoryRegistrantRepository();
    await repo.init();
    const svc = makeRegistrantService(repo);
    await expect(svc.create(actor('zoneLeader', { zone: 'Yellow' }), {})).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
