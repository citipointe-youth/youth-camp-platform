import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryPersonRepository } from './in-memory.repositories';
import type { Person } from '../../core/entities/person';

// ---------------------------------------------------------------------------
// Unit tests for InMemoryPersonRepository (Phase 1 Step 2). Covers the unified
// query surface: search, by-church/zone/group/kind/lifecycle, findCampers (by
// lifecycle), findAtCamp (by flag), and the bulk deleteAll.
// ---------------------------------------------------------------------------

function person(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p1',
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

describe('InMemoryPersonRepository', () => {
  let repo: InMemoryPersonRepository;

  beforeEach(async () => {
    repo = new InMemoryPersonRepository();
    await repo.init();
    await repo.save(person({ id: 'p1', firstName: 'Ada', lastName: 'Byron', churchId: 'c1', zone: 'Yellow', kind: 'youth', lifecycle: 'registered', atCamp: false }));
    await repo.save(person({ id: 'p2', firstName: 'Grace', lastName: 'Hopper', churchId: 'c1', zone: 'Yellow', kind: 'youth', lifecycle: 'arrived', atCamp: true, groupId: 'g1' }));
    await repo.save(person({ id: 'p3', firstName: 'Alan', lastName: 'Turing', churchId: 'c2', zone: 'Blue', kind: 'leader', lifecycle: 'checked_out', atCamp: false }));
    await repo.save(person({ id: 'p4', firstName: 'Edsger', lastName: 'Dijkstra', churchId: 'c2', zone: 'Blue', kind: 'youth', lifecycle: 'cancelled', atCamp: false }));
  });

  it('search matches on first, last, or full name (case-insensitive)', async () => {
    expect((await repo.search('grace')).map((p) => p.id)).toEqual(['p2']);
    expect((await repo.search('turing')).map((p) => p.id)).toEqual(['p3']);
    expect((await repo.search('ada byron')).map((p) => p.id)).toEqual(['p1']);
  });

  it('findByChurch / findByZone / findByGroup filter correctly', async () => {
    expect((await repo.findByChurch('c1')).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    expect((await repo.findByZone('Blue')).map((p) => p.id).sort()).toEqual(['p3', 'p4']);
    expect((await repo.findByGroup('g1')).map((p) => p.id)).toEqual(['p2']);
  });

  it('findByKind filters youth vs leader', async () => {
    expect((await repo.findByKind('leader')).map((p) => p.id)).toEqual(['p3']);
    expect((await repo.findByKind('youth')).map((p) => p.id).sort()).toEqual(['p1', 'p2', 'p4']);
  });

  it('findByLifecycle filters by exact lifecycle state', async () => {
    expect((await repo.findByLifecycle('registered')).map((p) => p.id)).toEqual(['p1']);
    expect((await repo.findByLifecycle('cancelled')).map((p) => p.id)).toEqual(['p4']);
  });

  it('findCampers returns arrived/checked_out/departed (NOT registered or cancelled)', async () => {
    expect((await repo.findCampers()).map((p) => p.id).sort()).toEqual(['p2', 'p3']);
  });

  it('findAtCamp returns only those currently signed in (atCamp flag)', async () => {
    expect((await repo.findAtCamp()).map((p) => p.id)).toEqual(['p2']);
  });

  it('deleteAll clears the store and returns the count removed', async () => {
    expect(await repo.deleteAll()).toBe(4);
    expect(await repo.findAll()).toEqual([]);
    expect(await repo.deleteAll()).toBe(0);
  });

  it('reads return clones (mutating a result does not affect the store)', async () => {
    const a = await repo.findById('p1');
    expect(a).not.toBeNull();
    a!.firstName = 'MUTATED';
    const b = await repo.findById('p1');
    expect(b!.firstName).toBe('Ada');
  });
});
