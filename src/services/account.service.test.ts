import { describe, it, expect, beforeEach } from 'vitest';
import { makeAccountService, type AccountService } from './account.service';
import {
  InMemoryUserRepository,
  InMemoryChurchRepository,
  InMemoryPersonRepository,
} from '../repositories/in-memory';
import type { Actor } from '../core/entities/user';
import type { Church } from '../core/entities/church';
import type { Person } from '../core/entities/person';

// ---------------------------------------------------------------------------
// AccountService.updateChurch — church rename propagation.
// A Person carries a denormalized `churchName` snapshot alongside `churchId`
// (person.ts). Renaming a church must re-stamp that snapshot on every attached
// person, otherwise rosters/exports keep showing the old name. Edge case, but
// the fix is cheap and keeps the two name copies consistent.
// ---------------------------------------------------------------------------

const NOW = '2026-01-01T00:00:00.000Z';

function admin(): Actor {
  return { id: 'u', role: 'admin', churchId: null, churchName: null, zone: null, displayName: 'admin' };
}

function church(over: Partial<Church> = {}): Church {
  return {
    id: 'c1',
    name: 'Victory Church',
    zone: 'Yellow',
    contacts: {
      male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p',
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    kind: 'youth',
    churchId: 'c1',
    churchName: 'Victory Church',
    zone: 'Yellow',
    medicalConditions: [],
    dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid',
    needsReview: false,
    lifecycle: 'registered',
    atCamp: false,
    checkInHistory: [],
    signOutHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

describe('AccountService.updateChurch — rename propagation', () => {
  let users: InMemoryUserRepository;
  let churches: InMemoryChurchRepository;
  let people: InMemoryPersonRepository;
  let svc: AccountService;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    churches = new InMemoryChurchRepository();
    people = new InMemoryPersonRepository();
    await Promise.all([users.init(), churches.init(), people.init()]);
    await churches.save(church({ id: 'c1', name: 'Victory Church' }));
    await churches.save(church({ id: 'c2', name: 'Grace Point' }));
    await people.save(person({ id: 'p1', churchId: 'c1', churchName: 'Victory Church' }));
    await people.save(person({ id: 'p2', churchId: 'c1', churchName: 'Victory Church' }));
    await people.save(person({ id: 'p3', churchId: 'c2', churchName: 'Grace Point' }));
    svc = makeAccountService(users, churches, people);
  });

  it('re-stamps churchName on every person attached to the renamed church', async () => {
    await svc.updateChurch(admin(), 'c1', { name: 'Victory Community Church' });

    const p1 = await people.findById('p1');
    const p2 = await people.findById('p2');
    expect(p1?.churchName).toBe('Victory Community Church');
    expect(p2?.churchName).toBe('Victory Community Church');
  });

  it('leaves people attached to other churches untouched', async () => {
    await svc.updateChurch(admin(), 'c1', { name: 'Victory Community Church' });

    const p3 = await people.findById('p3');
    expect(p3?.churchName).toBe('Grace Point');
  });

  it('does not rewrite people when the update does not change the name', async () => {
    await svc.updateChurch(admin(), 'c1', { contactPhone: '0400000000' });

    const p1 = await people.findById('p1');
    expect(p1?.churchName).toBe('Victory Church');
    expect(p1?.updatedAt).toBe(NOW); // untouched
  });
});
