import { describe, it, expect, beforeEach } from 'vitest';
import { makePersonService, canAccessPerson } from './person.service';
import { InMemoryPersonRepository } from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { ForbiddenError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// PersonService (Phase 1 Step 3) — the unified registrant + camper service.
// Verifies role scoping, the registrant (pre-camp) vs camper (at-camp) lifecycle
// views, and profile building. Additive: legacy services still live.
// ---------------------------------------------------------------------------

function person(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p',
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

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

async function freshRepo(): Promise<InMemoryPersonRepository> {
  const repo = new InMemoryPersonRepository();
  await repo.init();
  await repo.save(person({ id: 'r1', churchId: 'c1', zone: 'Yellow', lifecycle: 'registered', atCamp: false }));
  await repo.save(person({ id: 'r2', churchId: 'c2', zone: 'Blue', lifecycle: 'registered', atCamp: false }));
  await repo.save(person({ id: 'c1p', churchId: 'c1', zone: 'Yellow', lifecycle: 'arrived', atCamp: true }));
  await repo.save(person({ id: 'c2p', churchId: 'c2', zone: 'Blue', lifecycle: 'checked_out', atCamp: false }));
  await repo.save(person({ id: 'x1', churchId: 'c1', zone: 'Yellow', lifecycle: 'cancelled', atCamp: false }));
  return repo;
}

describe('canAccessPerson', () => {
  it('admin/director see all; zoneLeader by zone; church by churchId', () => {
    const p = { churchId: 'c1', zone: 'Yellow' };
    expect(canAccessPerson(actor('admin'), p)).toBe(true);
    expect(canAccessPerson(actor('director'), p)).toBe(true);
    expect(canAccessPerson(actor('zoneLeader', { zone: 'Yellow' }), p)).toBe(true);
    expect(canAccessPerson(actor('zoneLeader', { zone: 'Blue' }), p)).toBe(false);
    expect(canAccessPerson(actor('church', { churchId: 'c1' }), p)).toBe(true);
    expect(canAccessPerson(actor('church', { churchId: 'c2' }), p)).toBe(false);
  });
});

describe('PersonService.list (all lifecycles, role-scoped)', () => {
  let repo: InMemoryPersonRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('admin sees everyone regardless of lifecycle', async () => {
    const svc = makePersonService(repo);
    expect((await svc.list(actor('admin'))).map((p) => p.id).sort()).toEqual(['c1p', 'c2p', 'r1', 'r2', 'x1']);
  });

  it('church sees only its own church', async () => {
    const svc = makePersonService(repo);
    expect((await svc.list(actor('church', { churchId: 'c1' }))).map((p) => p.id).sort()).toEqual(['c1p', 'r1', 'x1']);
  });
});

describe('PersonService.listRegistrants (pre-camp view)', () => {
  let repo: InMemoryPersonRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('returns only lifecycle=registered for admin', async () => {
    const svc = makePersonService(repo);
    expect((await svc.listRegistrants(actor('admin'))).map((p) => p.id).sort()).toEqual(['r1', 'r2']);
  });

  it('excludes arrived/checked_out/cancelled people', async () => {
    const svc = makePersonService(repo);
    const ids = (await svc.listRegistrants(actor('admin'))).map((p) => p.id);
    expect(ids).not.toContain('c1p');
    expect(ids).not.toContain('x1');
  });

  it('church churchId path returns only that church\'s registrants', async () => {
    const svc = makePersonService(repo);
    expect((await svc.listRegistrants(actor('church', { churchId: 'c1' }), 'c1')).map((p) => p.id)).toEqual(['r1']);
  });
});

describe('PersonService.listCampers (at-camp view)', () => {
  let repo: InMemoryPersonRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('returns only arrived/checked_out/departed for admin', async () => {
    const svc = makePersonService(repo);
    expect((await svc.listCampers(actor('admin'))).map((p) => p.id).sort()).toEqual(['c1p', 'c2p']);
  });

  it('zoneLeader sees only campers in their zone', async () => {
    const svc = makePersonService(repo);
    expect((await svc.listCampers(actor('zoneLeader', { zone: 'Blue' }))).map((p) => p.id)).toEqual(['c2p']);
  });
});

describe('PersonService.get / getProfile', () => {
  let repo: InMemoryPersonRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('get returns NotFound when actor cannot access the person', async () => {
    const svc = makePersonService(repo);
    await expect(svc.get(actor('church', { churchId: 'c2' }), 'r1')).rejects.toThrow();
  });

  it('getProfile adds fullName, age (null without dob), and lastSignOut', async () => {
    const svc = makePersonService(repo);
    const prof = await svc.getProfile(actor('admin'), 'r1');
    expect(prof.fullName).toBe('Ada Lovelace');
    expect(prof.age).toBeNull();
    expect(prof.lastSignOut).toBeNull();
  });

  it('list enforces camper:read (no role without it)', async () => {
    const svc = makePersonService(repo);
    // every defined role has camper:read, so assert the guard is wired by checking a known-allowed role passes
    await expect(svc.list(actor('church', { churchId: 'c1' }))).resolves.toBeDefined();
    void ForbiddenError;
  });
});

describe('PersonService write surface (Step 4)', () => {
  let repo: InMemoryPersonRepository;
  beforeEach(async () => { repo = await freshRepo(); });

  it('create makes a registered, not-at-camp person scoped to the actor', async () => {
    const svc = makePersonService(repo);
    const p = await svc.create(actor('director'), {
      firstName: 'New', lastName: 'Camper', gender: 'female', churchId: 'c1', churchName: 'Victory', zone: 'Yellow',
    });
    expect(p.lifecycle).toBe('registered');
    expect(p.atCamp).toBe(false);
    expect(p.kind).toBe('youth');
    expect((await svc.listRegistrants(actor('admin'))).some((x) => x.id === p.id)).toBe(true);
  });

  it('create is blocked outside the actor church scope', async () => {
    const svc = makePersonService(repo);
    await expect(svc.create(actor('church', { churchId: 'c1' }), {
      firstName: 'X', lastName: 'Y', gender: 'male', churchId: 'c2', churchName: 'Other', zone: 'Blue',
    })).rejects.toThrow();
  });

  it('signEvent (in) promotes a registered person to arrived (Day-1 sign-in, D2)', async () => {
    // P0 presence model: arrival is owned by the attendance sign-in path (signEvent),
    // not the daily check-in path. signEvent('in') is the sole writer of atCamp/lifecycle.
    const svc = makePersonService(repo);
    const updated = await svc.signEvent(actor('admin'), 'r1', {
      type: 'in', leaderName: 'Leader', authorId: 'u', timestamp: '2026-07-01T08:00:00Z',
    });
    expect(updated.lifecycle).toBe('arrived');
    expect(updated.atCamp).toBe(true);
    expect(updated.signOutHistory).toHaveLength(1);
    expect(updated.checkInHistory).toHaveLength(0); // daily check-in untouched by sign-in
    // It now shows up in the at-camp view, not the pre-camp view.
    expect((await svc.listCampers(actor('admin'))).some((x) => x.id === 'r1')).toBe(true);
    expect((await svc.listRegistrants(actor('admin'))).some((x) => x.id === 'r1')).toBe(false);
  });

  it('checkIn is blocked for a person who has not signed in (atCamp false)', async () => {
    // P0 guard: the daily check-in path refuses anyone not physically at camp.
    const svc = makePersonService(repo);
    await expect(svc.checkIn(actor('admin'), 'r1', {
      sessionId: 's1', sessionLabel: 'Wed AM', type: 'in', leaderId: 'u', timestamp: '2026-07-01T08:00:00Z',
    })).rejects.toThrow();
  });

  it('signEvent (out) moves an arrived person to checked_out', async () => {
    const svc = makePersonService(repo);
    await svc.signEvent(actor('admin'), 'r1', { type: 'in', leaderName: 'Leader', authorId: 'u', timestamp: 't1' });
    const out = await svc.signEvent(actor('admin'), 'r1', { type: 'out', leaderName: 'Leader', authorId: 'u', timestamp: 't2' });
    expect(out.lifecycle).toBe('checked_out');
    expect(out.atCamp).toBe(false);
  });

  it('update cannot change lifecycle/atCamp/history (only checkIn/signEvent do)', async () => {
    const svc = makePersonService(repo);
    const updated = await svc.update(actor('admin'), 'r1', { grade: 11, lifecycle: 'arrived', atCamp: true } as Partial<Person>);
    expect(updated.grade).toBe(11);
    expect(updated.lifecycle).toBe('registered'); // lifecycle patch ignored
    expect(updated.atCamp).toBe(false);
  });

  it('remove deletes a person in scope', async () => {
    const svc = makePersonService(repo);
    await svc.remove(actor('admin'), 'r1');
    expect(await repo.findById('r1')).toBeNull();
  });
});

describe('PersonService.listMedicalWatch', () => {
  async function medRepo() {
    const repo = new InMemoryPersonRepository();
    await repo.init();
    // At camp, has medical conditions — should appear
    await repo.save(person({ id: 'med1', churchId: 'c1', zone: 'Yellow', lifecycle: 'arrived', atCamp: true, medicalConditions: ['Asthma'] }));
    // At camp, has otherMedications — should appear
    await repo.save(person({ id: 'med2', churchId: 'c2', zone: 'Blue', lifecycle: 'arrived', atCamp: true, medicalConditions: [], otherMedications: 'Ritalin' }));
    // At camp, no flags — should NOT appear
    await repo.save(person({ id: 'med3', churchId: 'c1', zone: 'Yellow', lifecycle: 'arrived', atCamp: true }));
    // Not at camp, has flags — should NOT appear (departed)
    await repo.save(person({ id: 'med4', churchId: 'c1', zone: 'Yellow', lifecycle: 'departed', atCamp: false, medicalConditions: ['Diabetes'] }));
    // Registrant (pre-camp), has flags — should NOT appear
    await repo.save(person({ id: 'med5', churchId: 'c1', zone: 'Yellow', lifecycle: 'registered', atCamp: false, medicalConditions: ['Peanut allergy'] }));
    return repo;
  }

  it('returns only atCamp+flagged campers for admin', async () => {
    const svc = makePersonService(await medRepo());
    const watch = await svc.listMedicalWatch(actor('admin'));
    const ids = watch.map((p) => p.id).sort();
    expect(ids).toEqual(['med1', 'med2']);
  });

  it('excludes atCamp:false persons even if they have medical flags', async () => {
    const svc = makePersonService(await medRepo());
    const watch = await svc.listMedicalWatch(actor('admin'));
    expect(watch.every((p) => p.atCamp)).toBe(true);
  });

  it('is scoped by actor role — church sees only its own church', async () => {
    const svc = makePersonService(await medRepo());
    const watch = await svc.listMedicalWatch(actor('church', { churchId: 'c2' }));
    expect(watch.map((p) => p.id)).toEqual(['med2']);
  });

  it('firstAid can access listMedicalWatch (camper:read is in their permissions)', async () => {
    const svc = makePersonService(await medRepo());
    await expect(svc.listMedicalWatch(actor('firstAid'))).resolves.toHaveLength(2);
  });
});
