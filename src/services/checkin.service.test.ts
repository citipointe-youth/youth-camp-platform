import { describe, it, expect, beforeEach } from 'vitest';
import { makeCheckInService } from './checkin.service';
import {
  InMemoryPersonRepository,
  InMemoryScheduleRepository,
  InMemorySettingsRepository,
} from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { ScheduleItem } from '../core/entities/schedule';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { Actor } from '../core/entities/user';

function actor(role: Actor['role'] = 'director'): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: 'Test' };
}

function checkInSession(id: string): ScheduleItem {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id, day: '2026-07-01', startTime: '08:00', endTime: null, title: id,
    location: null, type: 'logistics', isCheckInPoint: true, createdAt: now, updatedAt: now,
  };
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
    id: SETTINGS_ID, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
    timezone: 'UTC', checkInLocation: '', checkInFrom: '', registerBaseUrl: '', checkInDays: [],
    accommodationLocked: false, campMode: 'at-camp', createdAt: now, updatedAt: now,
  };
}

describe('getSessionStatus — roster filter', () => {
  let personRepo: InMemoryPersonRepository;
  let scheduleRepo: InMemoryScheduleRepository;
  let settingsRepo: InMemorySettingsRepository;

  beforeEach(async () => {
    personRepo = new InMemoryPersonRepository();
    scheduleRepo = new InMemoryScheduleRepository();
    settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton(settings());
    await scheduleRepo.save(checkInSession('s1'));
  });

  it('includes persons with atCamp=true', async () => {
    await personRepo.save(person({ id: 'p1', atCamp: true, lifecycle: 'arrived' }));
    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), 's1');
    expect(result.roster).toHaveLength(1);
    expect(result.roster[0]!.camperId).toBe('p1');
  });

  it('excludes persons with atCamp=false even if isCamper() returns true (checked_out lifecycle)', async () => {
    await personRepo.save(person({ id: 'p2', atCamp: false, lifecycle: 'checked_out' }));
    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), 's1');
    expect(result.roster).toHaveLength(0);
  });

  it('excludes persons with atCamp=false and departed lifecycle', async () => {
    await personRepo.save(person({ id: 'p3', atCamp: false, lifecycle: 'departed' }));
    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), 's1');
    expect(result.roster).toHaveLength(0);
  });

  it('excludes persons with atCamp=false and registered lifecycle (pre-camp)', async () => {
    await personRepo.save(person({ id: 'p4', atCamp: false, lifecycle: 'registered' }));
    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), 's1');
    expect(result.roster).toHaveLength(0);
  });

  it('totalCount reflects only atCamp persons', async () => {
    await personRepo.save(person({ id: 'p1', atCamp: true }));
    await personRepo.save(person({ id: 'p5', atCamp: false, lifecycle: 'checked_out' }));
    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus(actor(), 's1');
    expect(result.totalCount).toBe(1);
  });
});

describe('getSessionStatus — RosterEntry enriched fields', () => {
  it('RosterEntry includes gender, grade, and medicalFlag', async () => {
    const personRepo = new InMemoryPersonRepository();
    const scheduleRepo = new InMemoryScheduleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton({
      id: 'settings' as const, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
      timezone: 'UTC', checkInLocation: '', checkInFrom: '', registerBaseUrl: '', checkInDays: [],
      accommodationLocked: false, campMode: 'at-camp',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await scheduleRepo.save(checkInSession('s1'));

    await personRepo.save(person({
      id: 'p1',
      atCamp: true,
      gender: 'female',
      grade: 10,
      medicalConditions: ['Asthma'],
    }));

    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus({ id: 'u', role: 'director', churchId: null, churchName: null, zone: null, displayName: 'Test' }, 's1');

    expect(result.roster).toHaveLength(1);
    const entry = result.roster[0]!;
    expect(entry.gender).toBe('female');
    expect(entry.grade).toBe(10);
    expect(entry.medicalFlag).toBe(true);
  });

  it('medicalFlag is false when no medical conditions or medications', async () => {
    const personRepo = new InMemoryPersonRepository();
    const scheduleRepo = new InMemoryScheduleRepository();
    const settingsRepo = new InMemorySettingsRepository();
    await settingsRepo.saveSingleton({
      id: 'settings' as const, campName: 'Camp', year: 2026, startDate: '2026-07-01', endDate: '2026-07-05',
      timezone: 'UTC', checkInLocation: '', checkInFrom: '', registerBaseUrl: '', checkInDays: [],
      accommodationLocked: false, campMode: 'at-camp',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await scheduleRepo.save(checkInSession('s1'));

    await personRepo.save(person({ id: 'p1', atCamp: true, medicalConditions: [], otherMedications: null }));

    const svc = makeCheckInService(scheduleRepo, personRepo, settingsRepo);
    const result = await svc.getSessionStatus({ id: 'u', role: 'director', churchId: null, churchName: null, zone: null, displayName: 'Test' }, 's1');

    expect(result.roster[0]!.medicalFlag).toBe(false);
  });
});
