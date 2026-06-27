import type { SqlClient } from './client';
import type { ISnapshotRepository } from '../interfaces/entity-repositories';
import type { CampDefaults } from '../../core/entities/settings';

function toDefaults(r: Record<string, unknown>): CampDefaults {
  const snap = r['snapshot'] as Record<string, unknown>;
  return {
    id: 'defaults',
    churches: (snap['churches'] as unknown[]) ?? [],
    users: (snap['users'] as unknown[]) ?? [],
    classrooms: (snap['classrooms'] as unknown[]) ?? [],
    faqs: (snap['faqs'] as unknown[]) ?? [],
    schedule: (snap['schedule'] as unknown[]) ?? [],
    devotionals: (snap['devotionals'] as unknown[]) ?? [],
    createdAt: (r['created_at'] as Date).toISOString(),
  };
}

export class SupabaseDefaultsRepository implements ISnapshotRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async getDefaults(): Promise<CampDefaults | null> {
    const rows = await this.sql`select * from defaults where id = 'defaults'`;
    return rows[0] ? toDefaults(rows[0]) : null;
  }

  async saveDefaults(defaults: CampDefaults): Promise<CampDefaults> {
    // Serialize snapshot as a JSON string and cast in SQL to avoid TypeScript
    // unknown[] constraint on postgres's JSONValue parameter type.
    const snapJson = JSON.stringify({
      churches: defaults.churches,
      users: defaults.users,
      classrooms: defaults.classrooms,
      faqs: defaults.faqs,
      schedule: defaults.schedule,
      devotionals: defaults.devotionals,
    });
    await this.sql`
      insert into defaults (id, snapshot, created_at)
      values ('defaults', ${snapJson}::jsonb, ${defaults.createdAt})
      on conflict (id) do update set snapshot = excluded.snapshot
    `;
    return defaults;
  }
}
