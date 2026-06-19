import type { SqlClient } from './client';
import type { IAccommodationRepository } from '../interfaces/entity-repositories';
import type { AccommodationBlock } from '../../core/entities/accommodation';

function toBlock(r: Record<string, unknown>): AccommodationBlock {
  return {
    id: r['id'] as string,
    kind: r['kind'] as AccommodationBlock['kind'],
    name: r['name'] as string,
    price: r['price'] as number,
    capacity: r['capacity'] as number,
    baseTaken: r['base_taken'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function blockCols(b: AccommodationBlock): Record<string, unknown> {
  return {
    id: b.id,
    kind: b.kind,
    name: b.name,
    price: b.price,
    capacity: b.capacity,
    base_taken: b.baseTaken,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  };
}

const UPDATE_COLS = ['kind', 'name', 'price', 'capacity', 'base_taken', 'updated_at'] as const;

export class SupabaseAccommodationRepository implements IAccommodationRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<AccommodationBlock[]> {
    return (await this.sql`select * from accommodation_blocks order by kind, name`).map(toBlock);
  }

  async findById(id: string): Promise<AccommodationBlock | null> {
    const rows = await this.sql`select * from accommodation_blocks where id = ${id}`;
    return rows[0] ? toBlock(rows[0]) : null;
  }

  async findByKind(kind: string): Promise<AccommodationBlock[]> {
    return (await this.sql`select * from accommodation_blocks where kind = ${kind} order by name`).map(toBlock);
  }

  async save(block: AccommodationBlock): Promise<AccommodationBlock> {
    const cols = blockCols(block);
    await this.sql`
      insert into accommodation_blocks ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return block;
  }

  async saveMany(blocks: AccommodationBlock[]): Promise<AccommodationBlock[]> {
    for (const b of blocks) await this.save(b);
    return blocks;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from accommodation_blocks where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from accommodation_blocks returning id`;
    return rows.length;
  }
}
