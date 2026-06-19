import type {
  IUserRepository,
  IChurchRepository,
  IRegistrantRepository,
  ICamperRepository,
  IAccommodationRepository,
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
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { FaqItem } from '../core/entities/content';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Devotional } from '../core/entities/devotional';
import type { CampMode } from '../core/types/enums';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { nowISO } from '../utils/date';
import { makeSettingsService } from './settings.service';

export interface AdminService {
  reset(actor: Actor): Promise<{ ok: true }>;
  saveDefaults(actor: Actor): Promise<{ ok: true }>;
  newYear(actor: Actor, year: number): Promise<CampSettings>;
  clearNotifications(actor: Actor): Promise<{ deleted: number }>;
  setMode(actor: Actor, mode: CampMode): Promise<CampSettings>;
}

export function makeAdminService(
  userRepo: IUserRepository,
  churchRepo: IChurchRepository,
  registrantRepo: IRegistrantRepository,
  camperRepo: ICamperRepository,
  accommodationRepo: IAccommodationRepository,
  faqRepo: IFaqRepository,
  scheduleRepo: IScheduleRepository,
  notifRepo: INotificationRepository,
  noteRepo: INoteRepository,
  devotionalRepo: IDevotionalRepository,
  settingsRepo: ISettingsRepository,
  snapshotRepo: ISnapshotRepository,
): AdminService {
  const settingsService = makeSettingsService(settingsRepo);

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
    async reset(actor) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can reset data');

      await Promise.all([
        registrantRepo.deleteAll(),
        camperRepo.deleteAll(),
        churchRepo.deleteAll(),
        accommodationRepo.deleteAll(),
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
      const [churches, users, blocks, faqs, schedule, devotionals] = await Promise.all([
        churchRepo.findAll(),
        userRepo.findAll(),
        accommodationRepo.findAll(),
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
        accommodationBlocks: blocks,
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
    async newYear(actor, year) {
      if (actor.role !== 'admin') throw new ForbiddenError('Only admin can advance the year');
      const settings = await settingsService.get();
      const defaults = await snapshotRepo.getDefaults();
      if (!defaults) {
        throw new NotFoundError('No defaults snapshot saved — run Save Defaults before New Year');
      }

      // Purge this year's people + transient data.
      await Promise.all([
        registrantRepo.deleteAll(),
        camperRepo.deleteAll(),
        noteRepo.deleteAll(),
        notifRepo.deleteAll(),
      ]);

      // Restore the scaffold from the baseline. Accounts: replace all EXCEPT the
      // admin (the snapshot strips passwordHash, so seeded users would be passwordless
      // — restore them with a null hash; an operator resets passwords post-rollover).
      const admins = (await userRepo.findAll()).filter((u) => u.role === 'admin');
      await replaceAll<Church>(churchRepo, defaults.churches as Church[]);
      await replaceAll<AccommodationBlock>(accommodationRepo, defaults.accommodationBlocks as AccommodationBlock[]);
      await replaceAll<FaqItem>(faqRepo, defaults.faqs as FaqItem[]);
      await replaceAll<ScheduleItem>(scheduleRepo, defaults.schedule as ScheduleItem[]);
      await replaceAll<Devotional>(devotionalRepo, defaults.devotionals as Devotional[]);

      const snapshotUsers = (defaults.users as Array<Omit<User, 'passwordHash'>>).map(
        (u) => ({ ...u, passwordHash: undefined }) as User,
      );
      await userRepo.deleteAll();
      for (const a of admins) await userRepo.save(a);
      for (const u of snapshotUsers) {
        if (u.role === 'admin') continue; // never duplicate the preserved admin
        await userRepo.save(u);
      }

      const updated = await settingsRepo.saveSingleton({
        ...settings,
        year,
        campMode: 'pre-camp',
        updatedAt: nowISO(),
      });
      return updated;
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
