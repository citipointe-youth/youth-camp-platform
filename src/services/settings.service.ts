import type { ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../core/entities/settings';
import { SETTINGS_ID } from '../core/entities/settings';
import type { CampMode } from '../core/types/enums';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { UpdateSettingsSchema } from '../core/validation/content.schema';
import { nowISO } from '../utils/date';
import { invalidateDashboardCache } from './dashboard-cache';

export interface SettingsService {
  get(): Promise<CampSettings>;
  update(actor: Actor, patch: unknown): Promise<CampSettings>;
  getMode(): Promise<CampMode>;
  setMode(actor: Actor, mode: CampMode): Promise<CampSettings>;
}

export function makeSettingsService(repo: ISettingsRepository): SettingsService {
  async function get(): Promise<CampSettings> {
    const s = await repo.getSingleton();
    if (!s) throw new NotFoundError('Camp settings not initialised');
    return s;
  }

  return {
    get,

    async update(actor, patch) {
      assertCan(actor, 'admin:manage');
      const parsed = UpdateSettingsSchema.parse(patch);
      const current = await get();
      const updated: CampSettings = {
        ...current,
        ...parsed,
        id: SETTINGS_ID,
        updatedAt: nowISO(),
      };
      const saved = await repo.saveSingleton(updated);
      invalidateDashboardCache();
      return saved;
    },

    async getMode() {
      const s = await get();
      return s.campMode;
    },

    async setMode(actor, mode) {
      assertCan(actor, 'admin:manage');
      const current = await get();
      const saved = await repo.saveSingleton({ ...current, campMode: mode, updatedAt: nowISO() });
      invalidateDashboardCache();
      return saved;
    },
  };
}
