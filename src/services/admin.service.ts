import type {
  IUserRepository,
  IChurchRepository,
  IPersonRepository,
  IClassroomRepository,
  IAllocationRepository,
  IFaqRepository,
  IScheduleRepository,
  INotificationRepository,
  INoteRepository,
  IDevotionalRepository,
  ISettingsRepository,
  ISnapshotRepository,
} from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import type { Church } from '../core/entities/church';
import type { User } from '../core/entities/user';
import type { Classroom } from '../core/entities/accommodation';
import type { FaqItem } from '../core/entities/content';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Devotional } from '../core/entities/devotional';
import type { CampMode } from '../core/types/enums';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { ForbiddenError, NotFoundError, BadRequestError, WipeGuardError } from '../core/errors/app-error';
import { nowISO } from '../utils/date';
import { makeSettingsService } from './settings.service';
import { generateTempPassword } from '../utils/temp-password';
import { hashPassword } from '../utils/crypto';

export interface TempPasswordEntry {
  username: string;
  tempPassword: string;
}

export interface NewYearResult extends CampSettings {
  tempPasswords: TempPasswordEntry[];
}

export interface WipeOpts {
  force?: boolean;
  confirmWipe?: string;
}

const CONFIRM_WIPE_STRING = 'I understand this cannot be undone';

export interface AdminService {
  reset(actor: Actor, opts?: WipeOpts): Promise<{ ok: true }>;
  saveDefaults(actor: Actor): Promise<{ ok: true }>;
  newYear(actor: Actor, year: number, opts?: WipeOpts): Promise<NewYearResult>;
  clearNotifications(actor: Actor): Promise<{ deleted: number }>;
  setMode(actor: Actor, mode: CampMode): Promise<CampSettings>;
}

export function makeAdminService(
  userRepo: IUserRepository,
  churchRepo: IChurchRepository,
  personRepo: IPersonRepository,
  classroomRepo: IClassroomRepository,
  allocationRepo: IAllocationRepository,
  faqRepo: IFaqRepository,
  scheduleRepo: IScheduleRepository,
  notifRepo: INotificationRepository,
  noteRepo: INoteRepository,
  devotionalRepo: IDevotionalRepository,
  settingsRepo: ISettingsRepository,
  snapshotRepo: ISnapshotRepository,
): AdminService {
  const settingsService = makeSettingsService(settingsRepo);

  async function assertExportedOrForce(opts?: WipeOpts): Promise<void> {
    if (opts?.force && opts.confirmWipe === CONFIRM_WIPE_STRING) return;
    if (opts?.force && opts.confirmWipe !== CONFIRM_WIPE_STRING) {
      throw new BadRequestError(`force requires confirmWipe: "${CONFIRM_WIPE_STRING}"`);
    }
    const settings = await settingsRepo.getSingleton();
    if (!settings?.lastExportedAt) {
      throw new WipeGuardError();
    }
  }

  /** Replace a repository's whole contents with the given records (clear then save). */
  async function replaceAll<T extends { id: string }>(
    repo: { deleteAll(): Promise<number>; save(e: T): Promise<T> },
    records: T[],
  ): Promise<void> {
    await repo.deleteAll();
    for (const r of records) await repo.save(r);
  }

  return {
    // FULL RESET (decision 2026-06-18): wipe ALL data back to bare — people,
    // scaffold (churches/accommodation/FAQ/schedule/devotionals), notifications and
    // notes. Keeps ONLY the admin account + camp settings. Does NOT restore from the
    // defaults snapshot (that is newYear's job) — this fixes defect A4, which used to
    // load the snapshot purely as a guard and then never restore from it. Non-admin
    // accounts are deleted; the single admin is preserved.
    async reset(actor, opts) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can reset data');
      await assertExportedOrForce(opts);

      await Promise.all([
        personRepo.deleteAll(),
        churchRepo.deleteAll(),
        classroomRepo.deleteAll(),
        allocationRepo.deleteAll(),
        faqRepo.deleteAll(),
        scheduleRepo.deleteAll(),
        notifRepo.deleteAll(),
        noteRepo.deleteAll(),
        devotionalRepo.deleteAll(),
      ]);

      // Delete every non-admin account (keep the single admin).
      const users = await userRepo.findAll();
      await Promise.all(users.filter((u) => u.role !== 'admin').map((u) => userRepo.delete(u.id)));

      return { ok: true };
    },

    async saveDefaults(actor) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can save defaults');
      const [churches, users, classrooms, faqs, schedule, devotionals] = await Promise.all([
        churchRepo.findAll(),
        userRepo.findAll(),
        classroomRepo.findAll(),
        faqRepo.findAll(),
        scheduleRepo.findAll(),
        devotionalRepo.findAll(),
      ]);

      await snapshotRepo.saveDefaults({
        id: 'defaults',
        churches,
        users: users.map((u) => {
          const { passwordHash: _pw, ...rest } = u;
          return rest;
        }),
        classrooms,
        faqs,
        schedule,
        devotionals,
        createdAt: nowISO(),
      });

      return { ok: true };
    },

    // NEW YEAR (decision 2026-06-18): the routine annual rollover. Purges this
    // year's people + transient data (registrants, campers, notes, notifications)
    // and RESTORES the scaffold (churches, accounts, accommodation, FAQ, schedule,
    // devotionals) from the saved defaults snapshot. Keeps the admin account and the
    // camp settings (bumps year, forces pre-camp). Requires a saved snapshot.
    async newYear(actor, year, opts) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can advance the year');
      await assertExportedOrForce(opts);
      const settings = await settingsService.get();
      const defaults = await snapshotRepo.getDefaults();
      if (!defaults) {
        throw new NotFoundError('No defaults snapshot saved — run Save Defaults before New Year');
      }

      // Purge this year's people + transient data. Allocations are people-dependent
      // and never restored from the scaffold snapshot — wipe them here too.
      await Promise.all([
        personRepo.deleteAll(),
        noteRepo.deleteAll(),
        notifRepo.deleteAll(),
        allocationRepo.deleteAll(),
      ]);

      // Restore the scaffold from the baseline. Accounts: replace all EXCEPT the
      // admin (the snapshot strips passwordHash, so seeded users would be passwordless
      // — restore them with a temp password; an operator shares these at rollover).
      const admins = (await userRepo.findAll()).filter((u) => u.role === 'admin');
      await replaceAll<Church>(churchRepo, defaults.churches as Church[]);
      await replaceAll<Classroom>(classroomRepo, defaults.classrooms as Classroom[]);
      await replaceAll<FaqItem>(faqRepo, defaults.faqs as FaqItem[]);
      await replaceAll<ScheduleItem>(scheduleRepo, defaults.schedule as ScheduleItem[]);
      await replaceAll<Devotional>(devotionalRepo, defaults.devotionals as Devotional[]);

      const snapshotUsers = (defaults.users as Array<Omit<User, 'passwordHash'>>).map(
        (u) => ({ ...u, passwordHash: undefined }) as User,
      );
      await userRepo.deleteAll();
      for (const a of admins) await userRepo.save(a);

      const tempPasswords: TempPasswordEntry[] = [];
      for (const u of snapshotUsers) {
        if (u.role === 'admin') continue;
        const tempPassword = generateTempPassword();
        const passwordHash = await hashPassword(tempPassword);
        await userRepo.save({ ...u, passwordHash });
        if (u.username) tempPasswords.push({ username: u.username, tempPassword });
      }

      const updated = await settingsRepo.saveSingleton({
        ...settings,
        year,
        campMode: 'pre-camp',
        lastTempPasswords: tempPasswords,
        updatedAt: nowISO(),
      });
      return { ...updated, tempPasswords };
    },

    async clearNotifications(actor) {
      assertCan(actor, 'admin:manage');
      const deleted = await notifRepo.deleteAll();
      return { deleted };
    },

    async setMode(actor, mode) {
      return settingsService.setMode(actor, mode);
    },
  };
}
