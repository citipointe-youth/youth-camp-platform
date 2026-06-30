import type { Container } from '../container';
import type { User } from '../core/entities/user';
import type { Church } from '../core/entities/church';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { Classroom } from '../core/entities/accommodation';
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
  function makeChurch(name: string, zone: ZoneName): Church {
    return {
      id: newId('church'),
      name,
      zone,
      contacts: {
        male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
        female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  const victory = makeChurch('Victory Church', 'Yellow');
  const gracepoint = makeChurch('Grace Point Church', 'Blue');
  const riverbend = makeChurch('Riverbend Community', 'Black');

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
      zone: 'Black',
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
    checkInBanner: null,
    // Check-in days = each date of the camp (drives the auto AM/PM check-in sessions).
    checkInDays: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04'],
    accommodationLocked: false,
    tentPrice: 80,
    classroomPrice: 120,
    churchLoginLocked: false,
    zoneLeaderLoginLocked: false,
    campMode: 'pre-camp',
    createdAt: now,
    updatedAt: now,
  };
  await repos.settings.saveSingleton(settings);

  // ----- Classroom rooms (reusable scaffold) -----
  const rooms: Array<{ name: string; capacity: number }> = [
    { name: 'Room 1', capacity: 8 },
    { name: 'Room 2', capacity: 8 },
    { name: 'Room 3', capacity: 8 },
    { name: 'Room 4', capacity: 6 },
  ];
  for (const r of rooms) {
    const room: Classroom = { id: newId('room'), name: r.name, capacity: r.capacity, createdAt: now, updatedAt: now };
    await repos.classrooms.save(room);
  }

  // ----- Schedule (pure plan communication; unrelated to daily check-in) -----
  const schedule: ScheduleItem[] = [
    {
      id: newId('sched'),
      day: '2026-07-01',
      startTime: '09:00',
      endTime: '10:00',
      title: 'Welcome & Orientation',
      type: 'logistics',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: newId('sched'),
      day: '2026-07-01',
      startTime: '19:00',
      endTime: '20:30',
      title: 'Evening Session',
      type: 'activity',
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const s of schedule) {
    await repos.schedule.save(s);
  }
}
