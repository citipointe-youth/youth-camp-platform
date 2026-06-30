import type { SqlClient } from './client';
import type { ISettingsRepository } from '../interfaces/entity-repositories';
import type { CampSettings } from '../../core/entities/settings';
import { SETTINGS_ID } from '../../core/entities/settings';

function toSettings(r: Record<string, unknown>): CampSettings {
  return {
    id: SETTINGS_ID,
    campName: r['camp_name'] as string,
    year: r['year'] as number,
    startDate: r['start_date'] as string,
    endDate: r['end_date'] as string,
    timezone: r['timezone'] as string,
    checkInBanner: (r['check_in_banner'] as string | null) ?? undefined,
    checkInDays: (r['check_in_days'] as string[] | null) ?? [],
    accommodationLocked: r['accommodation_locked'] as boolean,
    tentPrice: (r['tent_price'] as number) ?? 0,
    classroomPrice: (r['classroom_price'] as number) ?? 0,
    churchLoginLocked: (r['church_login_locked'] as boolean | null) ?? false,
    zoneLeaderLoginLocked: (r['zone_leader_login_locked'] as boolean | null) ?? false,
    campMode: r['camp_mode'] as CampSettings['campMode'],
    lastTempPasswords: (r['last_temp_passwords'] as CampSettings['lastTempPasswords']) ?? null,
    lastExportedAt: (r['last_exported_at'] as Date | null)?.toISOString() ?? null,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function settingsCols(s: CampSettings): Record<string, unknown> {
  return {
    id: SETTINGS_ID,
    camp_name: s.campName,
    year: s.year,
    start_date: s.startDate,
    end_date: s.endDate,
    timezone: s.timezone,
    check_in_banner: s.checkInBanner ?? null,
    check_in_days: s.checkInDays,
    accommodation_locked: s.accommodationLocked,
    tent_price: s.tentPrice,
    classroom_price: s.classroomPrice,
    church_login_locked: s.churchLoginLocked,
    zone_leader_login_locked: s.zoneLeaderLoginLocked,
    camp_mode: s.campMode,
    last_temp_passwords: s.lastTempPasswords ?? null,
    last_exported_at: s.lastExportedAt ?? null,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

const UPDATE_COLS = [
  'camp_name', 'year', 'start_date', 'end_date', 'timezone',
  'check_in_banner', 'check_in_days', 'accommodation_locked',
  'tent_price', 'classroom_price',
  'church_login_locked', 'zone_leader_login_locked', 'camp_mode',
  'last_temp_passwords', 'last_exported_at', 'updated_at',
] as const;

export class SupabaseSettingsRepository implements ISettingsRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async getSingleton(): Promise<CampSettings | null> {
    const rows = await this.sql`select * from settings where id = 'settings'`;
    return rows[0] ? toSettings(rows[0]) : null;
  }

  async saveSingleton(settings: CampSettings): Promise<CampSettings> {
    const cols = settingsCols(settings);
    await this.sql`
      insert into settings ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return settings;
  }
}
