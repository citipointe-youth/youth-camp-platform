import type { Container } from '../container';
import type { User } from '../core/entities/user';
import type { Church } from '../core/entities/church';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { ScheduleItem } from '../core/entities/schedule';
import type { ZoneName } from '../core/types/enums';
import { hashPassword } from '../utils/crypto';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

/**
 * Seeds demo data (accounts, churches, settings singleton, and a small amount of
 * accommodation + schedule scaffold) into the container's repositories.
 *
 * Idempotent: if any users already exist it returns early, so it is safe to call
 * on every boot. Matches the "Seed demo accounts" table in CLAUDE.md.
 */
export async function seedAll(container: Container): Promise<void> {
  const { repos } = container;

  const existing = await repos.users.findAll();
  if (existing.length > 0) return; // Already seeded

  const now = nowISO();
  const pw = await hashPassword('demo1234');

  // ----- Churches (one per church account) -----
  function makeChurch(name: string, zone: ZoneName, code: string, slug: string): Church {
    return {
      id: newId('church'),
      name,
      zone,
      code,
      selfRegisterSlug: slug,
      expectedCount: 0,
      reservations: [],
      contacts: {
        male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
        female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  const victory = makeChurch('Victory Church', 'Yellow', 'VIC', 'victory');
  const gracepoint = makeChurch('Grace Point Church', 'Blue', 'GRC', 'gracepoint');
  const riverbend = makeChurch('Riverbend Community', 'Green', 'RIV', 'riverbend');

  for (const c of [victory, gracepoint, riverbend]) {
    await repos.churches.save(c);
  }

  // ----- Users (matching the CLAUDE.md "Seed demo accounts" table) -----
  function makeUser(over: Partial<User> & Pick<User, 'firstName' | 'lastName' | 'username' | 'role'>): User {
    return {
      id: newId('user'),
      churchId: null,
      churchName: null,
      zone: null,
      status: 'active',
      passwordHash: pw,
      createdAt: now,
      updatedAt: now,
      ...over,
    };
  }

  const users: User[] = [
    makeUser({
      firstName: 'Victory',
      lastName: 'Church',
      username: 'victory',
      role: 'church',
      churchId: victory.id,
      churchName: victory.name,
      zone: 'Yellow',
    }),
    makeUser({
      firstName: 'Grace Point',
      lastName: 'Church',
      username: 'gracepoint',
      role: 'church',
      churchId: gracepoint.id,
      churchName: gracepoint.name,
      zone: 'Blue',
    }),
    makeUser({
      firstName: 'Riverbend',
      lastName: 'Community',
      username: 'riverbend',
      role: 'church',
      churchId: riverbend.id,
      churchName: riverbend.name,
      zone: 'Green',
    }),
    makeUser({
      firstName: 'Yellow',
      lastName: 'Zone Leader',
      username: 'yellowzone',
      role: 'zoneLeader',
      zone: 'Yellow',
    }),
    makeUser({
      firstName: 'Camp',
      lastName: 'Director',
      username: 'director',
      role: 'director',
    }),
    makeUser({
      firstName: 'Platform',
      lastName: 'Admin',
      username: 'admin',
      role: 'admin',
    }),
    makeUser({
      firstName: 'First',
      lastName: 'Aid',
      username: 'firstaid',
      role: 'firstAid',
    }),
  ];

  for (const u of users) {
    await repos.users.save(u);
  }

  // ----- Camp settings singleton (pre-camp) -----
  const settings: CampSettings = {
    id: SETTINGS_ID,
    campName: 'Youth Camp',
    year: new Date().getFullYear(),
    startDate: '2026-07-01',
    endDate: '2026-07-04',
    timezone: 'Australia/Brisbane',
    checkInLocation: 'Main Hall',
    checkInFrom: '08:00',
    checkInBanner: null,
    registerBaseUrl: 'http://localhost:4200/register',
    checkInDays: [],
    accommodationLocked: false,
    campMode: 'pre-camp',
    createdAt: now,
    updatedAt: now,
  };
  await repos.settings.saveSingleton(settings);

  // ----- Accommodation blocks (small scaffold) -----
  const blocks: AccommodationBlock[] = [
    {
      id: newId('block'),
      kind: 'tent',
      name: 'Tent Field A',
      price: 80,
      capacity: 100,
      baseTaken: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId('block'),
      kind: 'classroom',
      name: 'Classroom Block',
      price: 120,
      capacity: 60,
      baseTaken: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const b of blocks) {
    await repos.accommodation.save(b);
  }

  // ----- Schedule (with two check-in points so daily check-in works) -----
  const schedule: ScheduleItem[] = [
    {
      id: newId('sched'),
      day: 'Wed',
      startTime: '08:00',
      endTime: '08:30',
      title: 'Morning Check-In',
      location: 'Main Hall',
      type: 'logistics',
      isCheckInPoint: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId('sched'),
      day: 'Wed',
      startTime: '19:00',
      endTime: '19:30',
      title: 'Evening Check-In',
      location: 'Main Hall',
      type: 'logistics',
      isCheckInPoint: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const s of schedule) {
    await repos.schedule.save(s);
  }
}
