import { describe, it, expect, beforeEach } from 'vitest';
import { makeNoteService } from './note.service';
import { InMemoryNoteRepository, InMemoryPersonRepository } from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { ForbiddenError, BadRequestError, NotFoundError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// NoteService — Phase 4 first-aid records.
// Pins the RBAC matrix that is the whole point of the feature:
//   * firstAid can WRITE category 'firstaid' notes, but NOT general notes/testimonies.
//   * firstAid/zoneLeader/director/admin/church can READ first-aid records via recentFirstAid,
//     each scoped by canAccessPerson; the path NEVER returns testimonies or general notes.
//   * church reads ONLY its own church's first-aid records, and cannot write them.
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
    lifecycle: 'arrived', // a camper (at camp) by default so notes attach
    atCamp: true,
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

let notes: InMemoryNoteRepository;
let people: InMemoryPersonRepository;
let svc: ReturnType<typeof makeNoteService>;

beforeEach(async () => {
  notes = new InMemoryNoteRepository();
  await notes.init();
  people = new InMemoryPersonRepository();
  await people.init();
  // c1 (Yellow) and c2 (Blue) campers.
  await people.save(person({ id: 'cam1', churchId: 'c1', zone: 'Yellow' }));
  await people.save(person({ id: 'cam2', churchId: 'c2', churchName: 'Grace', zone: 'Blue' }));
  svc = makeNoteService(notes, people);
});

describe('note.service: first-aid write authorization (category-scoped)', () => {
  it('firstAid CAN create a category:firstaid note about a camper', async () => {
    const note = await svc.add(actor('firstAid'), {
      camperId: 'cam1',
      category: 'firstaid',
      body: 'Problem: grazed knee\nTreatment: cleaned & dressed',
    });
    expect(note.category).toBe('firstaid');
    expect(note.camperId).toBe('cam1');
    expect(note.authorId).toBe('u'); // server-attributed
  });

  it('firstAid CANNOT create a general note (category note) — ForbiddenError', async () => {
    await expect(
      svc.add(actor('firstAid'), { camperId: 'cam1', category: 'note', body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('firstAid CANNOT create a testimony — ForbiddenError', async () => {
    await expect(
      svc.add(actor('firstAid'), { camperId: 'cam1', category: 'testimony', body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('firstAid CANNOT create a note with no category (defaults to note) — ForbiddenError', async () => {
    await expect(
      svc.add(actor('firstAid'), { camperId: 'cam1', body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('a first-aid record REQUIRES a camper — BadRequestError when missing', async () => {
    await expect(
      svc.add(actor('firstAid'), { category: 'firstaid', body: 'x' }),
    ).rejects.toThrow(BadRequestError);
  });

  it('church CANNOT write a first-aid record (read-only on first-aid) — ForbiddenError', async () => {
    await expect(
      svc.add(actor('church', { churchId: 'c1' }), { camperId: 'cam1', category: 'firstaid', body: 'x' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('admin and director CAN write a first-aid record', async () => {
    await expect(
      svc.add(actor('admin'), { camperId: 'cam1', category: 'firstaid', body: 'x' }),
    ).resolves.toMatchObject({ category: 'firstaid' });
    await expect(
      svc.add(actor('director'), { camperId: 'cam1', category: 'firstaid', body: 'y' }),
    ).resolves.toMatchObject({ category: 'firstaid' });
  });

  it('firstAid writing about a camper still respects canAccessPerson (all access) but rejects unknown camper', async () => {
    await expect(
      svc.add(actor('firstAid'), { camperId: 'nope', category: 'firstaid', body: 'x' }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('note.service: recentFirstAid read scoping', () => {
  beforeEach(async () => {
    // Seed a mix of categories across two churches.
    await svc.add(actor('firstAid'), { camperId: 'cam1', category: 'firstaid', body: 'Problem: A\nTreatment: a' });
    await svc.add(actor('firstAid'), { camperId: 'cam2', category: 'firstaid', body: 'Problem: B\nTreatment: b' });
    await svc.add(actor('admin'), { camperId: 'cam1', category: 'testimony', body: 'a testimony' });
    await svc.add(actor('admin'), { camperId: 'cam2', category: 'note', body: 'a general note' });
  });

  it('firstAid sees ALL first-aid records and NO testimonies/general notes', async () => {
    const recs = await svc.recentFirstAid(actor('firstAid'));
    expect(recs).toHaveLength(2);
    expect(recs.every((n) => n.category === 'firstaid')).toBe(true);
  });

  it('admin sees all first-aid records (and only first-aid via this path)', async () => {
    const recs = await svc.recentFirstAid(actor('admin'));
    expect(recs).toHaveLength(2);
    expect(recs.every((n) => n.category === 'firstaid')).toBe(true);
  });

  it('church sees ONLY its own church\'s first-aid records', async () => {
    const recs = await svc.recentFirstAid(actor('church', { churchId: 'c1' }));
    expect(recs).toHaveLength(1);
    expect(recs[0]?.camperId).toBe('cam1');
  });

  it('church does NOT see another church\'s first-aid records', async () => {
    const recs = await svc.recentFirstAid(actor('church', { churchId: 'c2' }));
    expect(recs).toHaveLength(1);
    expect(recs[0]?.camperId).toBe('cam2');
  });

  it('zoneLeader is zone-scoped', async () => {
    const yellow = await svc.recentFirstAid(actor('zoneLeader', { zone: 'Yellow' }));
    expect(yellow.map((n) => n.camperId)).toEqual(['cam1']);
    const blue = await svc.recentFirstAid(actor('zoneLeader', { zone: 'Blue' }));
    expect(blue.map((n) => n.camperId)).toEqual(['cam2']);
  });
});
