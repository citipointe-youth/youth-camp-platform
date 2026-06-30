import type { SqlClient } from './client';
import type { IAllocationRepository } from '../interfaces/entity-repositories';
import type { RoomAllocation } from '../../core/entities/accommodation';

function toAlloc(r: Record<string, unknown>): RoomAllocation {
  return {
    id: r['id'] as string,
    roomId: r['room_id'] as string,
    churchId: r['church_id'] as string,
    gender: r['gender'] as RoomAllocation['gender'],
    n: r['n'] as number,
    // C-1: PC-10 split sub-pools carry a grade bracket. null/absent for non-split pools.
    bracket: (r['bracket'] as RoomAllocation['bracket']) ?? null,
  };
}

function cols(a: RoomAllocation): Record<string, unknown> {
  return { id: a.id, room_id: a.roomId, church_id: a.churchId, gender: a.gender, n: a.n, bracket: a.bracket ?? null };
}

const UPDATE_COLS = ['room_id', 'church_id', 'gender', 'n', 'bracket'] as const;

export class SupabaseAllocationRepository implements IAllocationRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<RoomAllocation[]> {
    return (await this.sql`select * from classroom_allocations`).map(toAlloc);
  }

  async findById(id: string): Promise<RoomAllocation | null> {
    const rows = await this.sql`select * from classroom_allocations where id = ${id}`;
    return rows[0] ? toAlloc(rows[0]) : null;
  }

  async findByRoom(roomId: string): Promise<RoomAllocation[]> {
    return (await this.sql`select * from classroom_allocations where room_id = ${roomId}`).map(toAlloc);
  }

  async save(a: RoomAllocation): Promise<RoomAllocation> {
    const c = cols(a);
    await this.sql`
      insert into classroom_allocations ${this.sql(c)}
      on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}
    `;
    return a;
  }

  async saveMany(rows: RoomAllocation[]): Promise<RoomAllocation[]> {
    for (const r of rows) await this.save(r);
    return rows;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from classroom_allocations where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from classroom_allocations returning id`;
    return rows.length;
  }
}
