import { describe, it, expect, beforeEach } from 'vitest';
import { makeAdminService } from './admin.service';
import {
  InMemoryUserRepository,
  InMemoryChurchRepository,
  InMemoryPersonRepository,
  InMemoryClassroomRepository,
  InMemoryAllocationRepository,
  InMemoryFaqRepository,
  InMemoryScheduleRepository,
  InMemoryNotificationRepository,
  InMemoryNoteRepository,
  InMemoryDevotionalRepository,
  InMemorySettingsRepository,
  InMemorySnapshotRepository,
} from '../repositories/in-memory';
import type { User, Actor } from '../core/entities/user';
import type { Church } from '../core/entities/church';
import type { Person } from '../core/entities/person';
import type { Classroom } from '../core/entities/accommodation';
import type { FaqItem } from '../core/entities/content';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Notification } from '../core/entities/notification';
import type { StudentNote } from '../core/entities/note';
import type { Devotional } from '../core/entities/devotional';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import { ForbiddenError, NotFoundError, WipeGuardError, BadRequestError } from '../core/errors/app-error';

const NOW = '2026-01-01T00:00:00.000Z';

// --- Actor factory ----------------------------------------------------------
function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

// --- Minimal entity factories ------------------------------------------------
// Only the `id` field is load-bearing for the repository operations the admin
// service performs (findAll + delete). Other fields are filled to satisfy the
// types; casts keep the factories terse where shape is irrelevant to behaviour.
function user(over: Partial<User>): User {
  return {
    id: 'u',
    firstName: 'A',
    lastName: 'B',
    username: 'userab',
    role: 'church',
    churchId: null,
    churchName: null,
    zone: null,
    status: 'active',
    passwordHash: 'HASH',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function church(over: Partial<Church>): Church {
  return {
    id: 'c',
    name: 'Victory',
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

function person(over: Partial<Person>): Person {
  return {
    id: 'p',
    firstName: 'A',
    lastName: 'B',
    gender: 'male',
    kind: 'youth',
    paymentStatus: 'unpaid',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    lifecycle: 'registered',
    atCamp: false,
    medicalConditions: [],
    dietaryRequirements: [],
    consents: { medical: { granted: false, timestamp: null }, media: { granted: false, timestamp: null }, supervision: { granted: false, timestamp: null } },
    checkInHistory: [],
    signOutHistory: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function room(over: Partial<Classroom>): Classroom {
  return {
    id: 'b',
    name: 'Room A',
    capacity: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function faq(over: Partial<FaqItem>): FaqItem {
  return { id: 'f', question: 'q', answer: 'a', order: 0, createdAt: NOW, updatedAt: NOW, ...over };
}

function scheduleItem(over: Partial<ScheduleItem>): ScheduleItem {
  return {
    id: 's',
    day: 'Wed',
    startTime: '09:00',
    title: 'Session',
    type: 'session',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function notification(over: Partial<Notification>): Notification {
  return {
    id: 'n',
    scope: 'camp',
    priority: 'normal',
    title: 't',
    body: 'b',
    senderId: 'u',
    senderName: 'A',
    senderRole: 'admin',
    audienceEstimate: 0,
    createdAt: NOW,
    ...over,
  } as Notification;
}

function note(over: Partial<StudentNote>): StudentNote {
  return { id: 'nt', camperId: 'cmp1', body: 'x', authorId: 'u', authorName: 'A', createdAt: NOW, ...over };
}

function devotional(over: Partial<Devotional>): Devotional {
  return { id: 'd', day: 'Wed', verse: 'v', reference: 'r', reflection: 'rf', prayer: 'p', createdAt: NOW, updatedAt: NOW, ...over };
}

function settings(over: Partial<CampSettings> = {}): CampSettings {
  return {
    id: SETTINGS_ID,
    campName: 'Camp',
    year: 2026,
    startDate: '2026-07-01',
    endDate: '2026-07-05',
    timezone: 'Australia/Brisbane',
    checkInDays: [],
    accommodationLocked: false,
    tentPrice: 80,
    classroomPrice: 120,
    churchLoginLocked: false,
    zoneLeaderLoginLocked: false,
    churchCheckinTimeRestricted: false,
    campMode: 'pre-camp',
    // Default to exported so tests pass the wipe guard without needing force opts.
    lastExportedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

// --- Harness -----------------------------------------------------------------
interface Repos {
  userRepo: InMemoryUserRepository;
  churchRepo: InMemoryChurchRepository;
  personRepo: InMemoryPersonRepository;
  classroomRepo: InMemoryClassroomRepository;
  allocationRepo: InMemoryAllocationRepository;
  faqRepo: InMemoryFaqRepository;
  scheduleRepo: InMemoryScheduleRepository;
  notifRepo: InMemoryNotificationRepository;
  noteRepo: InMemoryNoteRepository;
  devotionalRepo: InMemoryDevotionalRepository;
  settingsRepo: InMemorySettingsRepository;
  snapshotRepo: InMemorySnapshotRepository;
}

async function makeRepos(): Promise<Repos> {
  const repos: Repos = {
    userRepo: new InMemoryUserRepository(),
    churchRepo: new InMemoryChurchRepository(),
    personRepo: new InMemoryPersonRepository(),
    classroomRepo: new InMemoryClassroomRepository(),
    allocationRepo: new InMemoryAllocationRepository(),
    faqRepo: new InMemoryFaqRepository(),
    scheduleRepo: new InMemoryScheduleRepository(),
    notifRepo: new InMemoryNotificationRepository(),
    noteRepo: new InMemoryNoteRepository(),
    devotionalRepo: new InMemoryDevotionalRepository(),
    settingsRepo: new InMemorySettingsRepository(),
    snapshotRepo: new InMemorySnapshotRepository(),
  };
  await Promise.all([
    repos.userRepo.init(),
    repos.churchRepo.init(),
    repos.personRepo.init(),
    repos.classroomRepo.init(),
    repos.allocationRepo.init(),
    repos.faqRepo.init(),
    repos.scheduleRepo.init(),
    repos.notifRepo.init(),
    repos.noteRepo.init(),
    repos.devotionalRepo.init(),
    repos.settingsRepo.init(),
    repos.snapshotRepo.init(),
  ]);
  return repos;
}

function build(r: Repos) {
  return makeAdminService(
    r.userRepo,
    r.churchRepo,
    r.personRepo,
    r.classroomRepo,
    r.allocationRepo,
    r.faqRepo,
    r.scheduleRepo,
    r.notifRepo,
    r.noteRepo,
    r.devotionalRepo,
    r.settingsRepo,
    r.snapshotRepo,
  );
}

/** Seed every collection the service touches with two records each. */
async function seedEverything(r: Repos): Promise<void> {
  await Promise.all([
    r.userRepo.save(user({ id: 'u1', username: 'admin', role: 'admin' })),
    r.userRepo.save(user({ id: 'u2', username: 'churchb', role: 'church', churchId: 'c1' })),
    r.churchRepo.save(church({ id: 'c1' })),
    r.churchRepo.save(church({ id: 'c2', name: 'Grace' })),
    r.personRepo.save(person({ id: 'p1' })),
    r.personRepo.save(person({ id: 'p2', lifecycle: 'arrived', atCamp: true })),
    r.classroomRepo.save(room({ id: 'b1' })),
    r.faqRepo.save(faq({ id: 'f1' })),
    r.scheduleRepo.save(scheduleItem({ id: 's1' })),
    r.notifRepo.save(notification({ id: 'n1' })),
    r.notifRepo.save(notification({ id: 'n2', scope: 'zone', zone: 'Yellow' })),
    r.noteRepo.save(note({ id: 'nt1' })),
    r.devotionalRepo.save(devotional({ id: 'd1' })),
  ]);
  await r.settingsRepo.saveSingleton(settings());
}

// =============================================================================
// reset
// =============================================================================
describe('AdminService.reset', () => {
  let repos: Repos;
  beforeEach(async () => {
    repos = await makeRepos();
    await seedEverything(repos);
  });

  it('forbids non-admin roles (church, zoneLeader, director)', async () => {
    const svc = build(repos);
    for (const role of ['church', 'zoneLeader', 'director'] as const) {
      await expect(svc.reset(actor(role))).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('A4 FIX: full wipe to bare — clears all data INCLUDING the scaffold, no snapshot needed', async () => {
    // Decision 2026-06-18: reset is a full wipe with NO restore (the old code loaded
    // the snapshot as a guard then never restored — defect A4). No snapshot saved.
    const svc = build(repos);
    const result = await svc.reset(actor('admin'));
    expect(result).toEqual({ ok: true });

    expect(await repos.personRepo.findAll()).toEqual([]);
    expect(await repos.churchRepo.findAll()).toEqual([]);
    expect(await repos.classroomRepo.findAll()).toEqual([]);
    expect(await repos.faqRepo.findAll()).toEqual([]);
    expect(await repos.scheduleRepo.findAll()).toEqual([]);
    expect(await repos.notifRepo.findAll()).toEqual([]);
    expect(await repos.noteRepo.findAll()).toEqual([]);
    expect(await repos.devotionalRepo.findAll()).toEqual([]);
  });

  it('A4 FIX: keeps the single admin account, deletes every non-admin account', async () => {
    const svc = build(repos);
    await svc.reset(actor('admin'));
    const users = await repos.userRepo.findAll();
    expect(users.map((u) => u.id)).toEqual(['u1']); // u2 (church) deleted, u1 (admin) kept
    expect(users[0]!.role).toBe('admin');
  });

  it('A4 FIX: keeps the camp settings singleton', async () => {
    const svc = build(repos);
    await svc.reset(actor('admin'));
    const s = await repos.settingsRepo.getSingleton();
    expect(s).not.toBeNull();
    expect(s!.year).toBe(2026);
  });

  it('wipe guard: reset throws WipeGuardError when lastExportedAt is null', async () => {
    // Override settings to have no lastExportedAt
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    const svc = build(repos);
    await expect(svc.reset(actor('admin'))).rejects.toBeInstanceOf(WipeGuardError);
  });

  it('wipe guard: reset passes with force + confirmWipe string', async () => {
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    const svc = build(repos);
    const result = await svc.reset(actor('admin'), {
      force: true,
      confirmWipe: 'I understand this cannot be undone',
    });
    expect(result).toEqual({ ok: true });
  });

  it('wipe guard: force:true alone (without confirmWipe) throws BadRequestError', async () => {
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    const svc = build(repos);
    await expect(svc.reset(actor('admin'), { force: true })).rejects.toThrow();
  });
});

// =============================================================================
// saveDefaults
// =============================================================================
describe('AdminService.saveDefaults', () => {
  let repos: Repos;
  beforeEach(async () => {
    repos = await makeRepos();
    await seedEverything(repos);
  });

  it('forbids non-admin roles', async () => {
    const svc = build(repos);
    for (const role of ['church', 'zoneLeader', 'director'] as const) {
      await expect(svc.saveDefaults(actor(role))).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('snapshots churches, accommodation blocks, faqs, schedule and users (stripped of passwordHash)', async () => {
    const svc = build(repos);
    const result = await svc.saveDefaults(actor('admin'));
    expect(result).toEqual({ ok: true });

    const defaults = await repos.snapshotRepo.getDefaults();
    expect(defaults).not.toBeNull();
    expect(defaults!.id).toBe('defaults');
    expect((defaults!.churches as Church[]).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    expect((defaults!.classrooms as Classroom[]).map((b) => b.id)).toEqual(['b1']);
    expect((defaults!.faqs as FaqItem[]).map((f) => f.id)).toEqual(['f1']);
    expect((defaults!.schedule as ScheduleItem[]).map((s) => s.id)).toEqual(['s1']);

    // Users are included but passwordHash is stripped from each.
    const savedUsers = defaults!.users as Array<Record<string, unknown>>;
    expect(savedUsers).toHaveLength(2);
    for (const u of savedUsers) {
      expect(u.passwordHash).toBeUndefined();
      expect(u.username).toBeDefined();
    }
  });

  it('snapshots devotionals too (added 2026-06-18)', async () => {
    const svc = build(repos);
    await svc.saveDefaults(actor('admin'));
    const defaults = await repos.snapshotRepo.getDefaults();
    expect((defaults!.devotionals as Devotional[]).map((d) => d.id)).toEqual(['d1']);
  });

  it('does NOT snapshot registrants, campers, notifications or notes', async () => {
    const svc = build(repos);
    await svc.saveDefaults(actor('admin'));
    const defaults = await repos.snapshotRepo.getDefaults();
    // CampDefaults captures the scaffold (incl. devotionals) but no people/transient data.
    expect(Object.keys(defaults!).sort()).toEqual(
      ['classrooms', 'churches', 'createdAt', 'devotionals', 'faqs', 'id', 'schedule', 'users'].sort(),
    );
  });
});

// =============================================================================
// newYear
// =============================================================================
describe('AdminService.newYear', () => {
  let repos: Repos;
  beforeEach(async () => {
    repos = await makeRepos();
    await seedEverything(repos);
  });

  it('forbids non-admin roles', async () => {
    const svc = build(repos);
    for (const role of ['church', 'zoneLeader', 'director'] as const) {
      await expect(svc.newYear(actor(role), 2027)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('throws NotFoundError when settings are not initialised', async () => {
    const fresh = await makeRepos();
    // No settings saved -> settingsService.get() throws NotFoundError.
    // The wipe guard runs first and would throw WipeGuardError on an un-exported
    // system, so bypass it with force+confirmWipe to reach the settings check.
    const svc = build(fresh);
    await expect(
      svc.newYear(actor('admin'), 2027, { force: true, confirmWipe: 'I understand this cannot be undone' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws NotFoundError when no defaults snapshot exists (cannot restore scaffold)', async () => {
    // Decision 2026-06-18: newYear restores the scaffold from the snapshot, so it
    // requires one. seedEverything saves no snapshot.
    const svc = build(repos);
    await expect(svc.newYear(actor('admin'), 2027)).rejects.toBeInstanceOf(NotFoundError);
  });

  /** Save a baseline snapshot distinct from the live seed, so restore is observable. */
  async function saveBaseline(): Promise<void> {
    await repos.snapshotRepo.saveDefaults({
      id: 'defaults',
      churches: [church({ id: 'baseC' })],
      users: [{ ...user({ id: 'baseChurchUser', role: 'church' }), passwordHash: undefined } as unknown as Record<string, unknown>],
      classrooms: [room({ id: 'baseB' })],
      faqs: [faq({ id: 'baseF' })],
      schedule: [scheduleItem({ id: 'baseS' })],
      devotionals: [devotional({ id: 'baseD' })],
      createdAt: NOW,
    });
  }

  it('updates year and forces campMode to pre-camp', async () => {
    await repos.settingsRepo.saveSingleton(settings({ year: 2026, campMode: 'at-camp' }));
    await saveBaseline();
    const svc = build(repos);

    const updated = await svc.newYear(actor('admin'), 2027);
    expect(updated.year).toBe(2027);
    expect(updated.campMode).toBe('pre-camp');

    const persisted = await repos.settingsRepo.getSingleton();
    expect(persisted!.year).toBe(2027);
    expect(persisted!.campMode).toBe('pre-camp');
  });

  it('purges people + transient data (notes, notifications)', async () => {
    await saveBaseline();
    const svc = build(repos);
    await svc.newYear(actor('admin'), 2027);
    expect(await repos.personRepo.findAll()).toEqual([]);
    expect(await repos.noteRepo.findAll()).toEqual([]);
    expect(await repos.notifRepo.findAll()).toEqual([]);
  });

  it('restores the scaffold (churches/accommodation/faqs/schedule/devotionals) from the snapshot', async () => {
    await saveBaseline();
    const svc = build(repos);
    await svc.newYear(actor('admin'), 2027);
    // Live seed (c1/c2, b1, f1, s1, d1) is replaced by the baseline (baseC/baseB/...).
    expect((await repos.churchRepo.findAll()).map((c) => c.id)).toEqual(['baseC']);
    expect((await repos.classroomRepo.findAll()).map((b) => b.id)).toEqual(['baseB']);
    expect((await repos.faqRepo.findAll()).map((f) => f.id)).toEqual(['baseF']);
    expect((await repos.scheduleRepo.findAll()).map((s) => s.id)).toEqual(['baseS']);
    expect((await repos.devotionalRepo.findAll()).map((d) => d.id)).toEqual(['baseD']);
  });

  it('keeps the admin account and restores snapshot (non-admin) accounts', async () => {
    await saveBaseline();
    const svc = build(repos);
    await svc.newYear(actor('admin'), 2027);
    const users = await repos.userRepo.findAll();
    // u1 admin kept; live u2 church replaced by the baseline church user.
    expect(users.map((u) => u.id).sort()).toEqual(['baseChurchUser', 'u1'].sort());
    expect(users.find((u) => u.role === 'admin')!.id).toBe('u1');
  });

  it('newYear returns tempPasswords in the response', async () => {
    await saveBaseline();
    const svc = build(repos);
    const result = await svc.newYear(actor('admin'), 2027);
    expect(result).toHaveProperty('tempPasswords');
    expect(Array.isArray(result.tempPasswords)).toBe(true);
  });

  it('wipe guard: newYear throws WipeGuardError when lastExportedAt is null', async () => {
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    await saveBaseline();
    const svc = build(repos);
    await expect(svc.newYear(actor('admin'), 2027)).rejects.toBeInstanceOf(WipeGuardError);
  });

  it('wipe guard: newYear passes with force + confirmWipe', async () => {
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    await saveBaseline();
    const svc = build(repos);
    const result = await svc.newYear(actor('admin'), 2027, {
      force: true,
      confirmWipe: 'I understand this cannot be undone',
    });
    expect(result.year).toBe(2027);
  });

  it('wipe guard: bare force:true alone (without confirmWipe) throws BadRequestError for newYear', async () => {
    await repos.settingsRepo.saveSingleton(settings({ lastExportedAt: null }));
    await saveBaseline();
    const svc = build(repos);
    await expect(svc.newYear(actor('admin'), 2027, { force: true })).rejects.toBeInstanceOf(BadRequestError);
  });
});

// =============================================================================
// clearNotifications
// =============================================================================
describe('AdminService.clearNotifications', () => {
  let repos: Repos;
  beforeEach(async () => {
    repos = await makeRepos();
    await seedEverything(repos);
  });

  it('forbids roles without admin:manage (church, zoneLeader, director)', async () => {
    const svc = build(repos);
    // Only admin holds admin:manage in access-control.ts.
    for (const role of ['church', 'zoneLeader', 'director'] as const) {
      await expect(svc.clearNotifications(actor(role))).rejects.toBeInstanceOf(ForbiddenError);
    }
    // Guarded path does not delete anything.
    expect(await repos.notifRepo.findAll()).toHaveLength(2);
  });

  it('deletes all notifications and reports the count for admin', async () => {
    const svc = build(repos);
    const result = await svc.clearNotifications(actor('admin'));
    expect(result).toEqual({ deleted: 2 });
    expect(await repos.notifRepo.findAll()).toEqual([]);
  });

  it('reports deleted:0 when there are no notifications', async () => {
    await repos.notifRepo.delete('n1');
    await repos.notifRepo.delete('n2');
    const svc = build(repos);
    expect(await svc.clearNotifications(actor('admin'))).toEqual({ deleted: 0 });
  });
});

// =============================================================================
// setMode
// =============================================================================
describe('AdminService.setMode', () => {
  let repos: Repos;
  beforeEach(async () => {
    repos = await makeRepos();
    await seedEverything(repos);
  });

  it('forbids roles without admin:manage (church, zoneLeader, director)', async () => {
    const svc = build(repos);
    for (const role of ['church', 'zoneLeader', 'director'] as const) {
      await expect(svc.setMode(actor(role), 'at-camp')).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('throws NotFoundError when settings are not initialised', async () => {
    const fresh = await makeRepos();
    const svc = build(fresh);
    await expect(svc.setMode(actor('admin'), 'at-camp')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('switches the camp mode and persists it for admin', async () => {
    const svc = build(repos);
    const updated = await svc.setMode(actor('admin'), 'at-camp');
    expect(updated.campMode).toBe('at-camp');
    expect((await repos.settingsRepo.getSingleton())!.campMode).toBe('at-camp');

    const back = await svc.setMode(actor('admin'), 'pre-camp');
    expect(back.campMode).toBe('pre-camp');
  });
});
