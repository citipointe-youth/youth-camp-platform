import type { SqlClient } from './client';
import type { IChurchRepository } from '../interfaces/entity-repositories';
import type { Church } from '../../core/entities/church';

function toChurch(row: Record<string, unknown>): Church {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    zone: row['zone'] as Church['zone'],
    contactPhone: (row['contact_phone'] as string | null) ?? undefined,
    contacts: (row['contacts'] as Church['contacts']) ?? {
      male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
    },
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function churchColumns(c: Church): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    zone: c.zone,
    contact_phone: c.contactPhone ?? null,
    contacts: c.contacts,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

const UPDATE_COLS = [
  'name', 'zone', 'contact_phone', 'contacts', 'updated_at',
] as const;

export class SupabaseChurchRepository implements IChurchRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Church[]> {
    return (await this.sql`select * from churches order by zone, name`).map(toChurch);
  }

  async findById(id: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where id = ${id}`;
    return rows[0] ? toChurch(rows[0]) : null;
  }

  async findByZone(zone: string): Promise<Church[]> {
    return (await this.sql`select * from churches where zone = ${zone} order by name`).map(toChurch);
  }

  async save(church: Church): Promise<Church> {
    const c = churchColumns(church);
    await this.sql`
      insert into churches ${this.sql(c)}
      on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}
    `;
    return church;
  }

  async saveMany(churches: Church[]): Promise<Church[]> {
    for (const c of churches) await this.save(c);
    return churches;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from churches where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from churches returning id`;
    return rows.length;
  }
}
