import type { SqlClient } from './client';
import type { IDevotionalRepository } from '../interfaces/entity-repositories';
import type { Devotional } from '../../core/entities/devotional';

function toDev(r: Record<string, unknown>): Devotional {
  return {
    id: r['id'] as string,
    day: r['day'] as string,
    verse: r['verse'] as string,
    reference: r['reference'] as string,
    reflection: r['reflection'] as string,
    prayer: r['prayer'] as string,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function devCols(d: Devotional): Record<string, unknown> {
  return {
    id: d.id,
    day: d.day,
    verse: d.verse,
    reference: d.reference,
    reflection: d.reflection,
    prayer: d.prayer,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const UPDATE_COLS = ['day', 'verse', 'reference', 'reflection', 'prayer', 'updated_at'] as const;

export class SupabaseDevotionalRepository implements IDevotionalRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Devotional[]> {
    return (await this.sql`select * from devotionals order by day`).map(toDev);
  }

  async findById(id: string): Promise<Devotional | null> {
    const rows = await this.sql`select * from devotionals where id = ${id}`;
    return rows[0] ? toDev(rows[0]) : null;
  }

  async findByDay(day: string): Promise<Devotional | null> {
    const rows = await this.sql`select * from devotionals where day = ${day}`;
    return rows[0] ? toDev(rows[0]) : null;
  }

  async save(d: Devotional): Promise<Devotional> {
    const cols = devCols(d);
    await this.sql`
      insert into devotionals ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return d;
  }

  async saveMany(ds: Devotional[]): Promise<Devotional[]> {
    for (const d of ds) await this.save(d);
    return ds;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from devotionals where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from devotionals returning id`;
    return rows.length;
  }
}
