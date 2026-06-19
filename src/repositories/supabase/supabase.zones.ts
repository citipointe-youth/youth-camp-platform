import type { SqlClient } from './client';
import type { IZoneRepository } from '../interfaces/entity-repositories';
import type { Zone } from '../../core/entities/zone';

function toZone(r: Record<string, unknown>): Zone {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    label: r['label'] as string,
    colorHex: r['color_hex'] as string,
    leaderIds: (r['leader_ids'] as string[] | null) ?? [],
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function zoneCols(z: Zone): Record<string, unknown> {
  return {
    id: z.id,
    name: z.name,
    label: z.label,
    color_hex: z.colorHex,
    leader_ids: z.leaderIds,
    created_at: z.createdAt,
    updated_at: z.updatedAt,
  };
}

const UPDATE_COLS = ['name', 'label', 'color_hex', 'leader_ids', 'updated_at'] as const;

export class SupabaseZoneRepository implements IZoneRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Zone[]> {
    return (await this.sql`select * from zones order by name`).map(toZone);
  }

  async findById(id: string): Promise<Zone | null> {
    const rows = await this.sql`select * from zones where id = ${id}`;
    return rows[0] ? toZone(rows[0]) : null;
  }

  async findByName(name: string): Promise<Zone | null> {
    const rows = await this.sql`select * from zones where name = ${name}`;
    return rows[0] ? toZone(rows[0]) : null;
  }

  async save(zone: Zone): Promise<Zone> {
    const cols = zoneCols(zone);
    await this.sql`
      insert into zones ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return zone;
  }

  async saveMany(zones: Zone[]): Promise<Zone[]> {
    for (const z of zones) await this.save(z);
    return zones;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from zones where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from zones returning id`;
    return rows.length;
  }
}
