import { describe, it, expect, beforeEach } from 'vitest';
import { makeCheckInService } from './checkin.service';
import { InMemoryPersonRepository, InMemorySettingsRepository } from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';

// Check-in sessions are derived from settings.checkInDays (two per day, AM/PM) — the
// schedule is no longer involved. A valid session id is `${day}#am` / `${day}#pm`.
const SESSION_ID = '2026-07-01~am';

function actor(role: Actor['role'] = 'director'): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: 'Test' };
}

function person(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'p1', firstName: 'Ada', lastName: 'L', gender: 'female', kind: 'youth',
    churchId: 'c1', churchName: 'Victory', zone: 'Yellow',
    medicalConditions: [], dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid', lifecycle: 'arrived', atCamp: true,
    checkInHistory: [], signOutHistory: [],
    createdAt: now, updatedAt: now,
    ...over,
  };
}

function settings(): CampSettings {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-06-30', endDate: '2026-07-05',
    timezone: 'UTC', checkInDays: ['2026-06-30', '2026-07-01', '2026-07-02'],
    accommodationLocked: false, tentPrice: 80, classroomPrice: 120, campMode: 'at-camp', createdAt: now, updatedAt: now,
  };
}

describe('getSessions — derived from check-in days', () => {
  it('first day is PM-only, interior days AM+PM, last day AM-only (AC-1)', async () => {
    const personRepo = new InMemoryPersonRepository();
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton(settings());
    const svc = makeCheckInService(personRepo, settingsRepo);
    const sessions = await svc.getSessions();
    expect(sessions.map((s) => s.id)).toEqual([
      '2026-06-30~pm', '2026-07-01~am', '2026-07-01~pm', '2026-07-02~am',
    ]);
  });
});

describe('getSessionStatus — roster filter', () => {
  let personRepo: InMemoryPersonRepository;
  let settingsRepo: InMemorySettingsRepository;

  beforeEach(async () => {
    personRepo = new InMemoryPersonRepository();
    settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton(settings());
  });

  it('includes persons with atCamp=true', async () => {
    await personRepo.save(person({ id: 'p1', atCamp: true, lifecycle: 'arrived' }));
    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]!.camperId).toBe('p1');
  });

  it('excludes persons with atCamp=false even if isCamper() returns true (checked_out lifecycle)', async () => {
    await personRepo.save(person({ id: 'p2', atCamp: false, lifecycle: 'checked_out' }));
    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);
    expect(result.roster).toHaveLength(0);
  });

  it('excludes persons with atCamp=false and departed lifecycle', async () => {
    await personRepo.save(person({ id: 'p3', atCamp: false, lifecycle: 'departed' }));
    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);
    expect(result.roster).toHaveLength(0);
  });

  it('excludes persons with atCamp=false and registered lifecycle (pre-camp)', async () => {
    await personRepo.save(person({ id: 'p4', atCamp: false, lifecycle: 'registered' }));
    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);
    expect(result.roster).toHaveLength(0);
  });

  it('totalCount reflects only atCamp persons', async () => {
    await personRepo.save(person({ id: 'p1', atCamp: true }));
    await personRepo.save(person({ id: 'p5', atCamp: false, lifecycle: 'checked_out' }));
    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);
    expect(result.totalCount).toBe(1);
  });

  it('rejects a session id for a day outside the camp', async () => {
    const svc = makeCheckInService(personRepo, settingsRepo);
    await expect(svc.getSessionStatus(actor(), '2030-01-01~am')).rejects.toThrow();
  });
});

describe('getSessionStatus — RosterEntry enriched fields', () => {
  it('RosterEntry includes gender, grade, and medicalFlag', async () => {
    const personRepo = new InMemoryPersonRepository();
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton(settings());

    await personRepo.save(person({
      id: 'p1', atCamp: true, gender: 'female', grade: 10, medicalConditions: ['Asthma'],
    }));

    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);

    expect(result.roster).toHaveLength(1);
    const entry = result.roster[0]!;
    expect(entry.gender).toBe('female');
    expect(entry.grade).toBe(10);
    expect(entry.medicalFlag).toBe(true);
  });

  it('medicalFlag is false when no medical conditions or medications', async () => {
    const personRepo = new InMemoryPersonRepository();
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton(settings());

    await personRepo.save(person({ id: 'p1', atCamp: true, medicalConditions: [], otherMedications: null }));

    const svc = makeCheckInService(personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), SESSION_ID);

    expect(result.roster[0]!.medicalFlag).toBe(false);
  });
});
