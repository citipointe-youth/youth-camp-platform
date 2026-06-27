import type { SqlClient } from './client';
import type { IClassroomRepository } from '../interfaces/entity-repositories';
import type { Classroom } from '../../core/entities/accommodation';

function toRoom(r: Record<string, unknown>): Classroom {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    capacity: r['capacity'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function cols(c: Classroom): Record<string, unknown> {
  return { id: c.id, name: c.name, capacity: c.capacity, created_at: c.createdAt, updated_at: c.updatedAt };
}

const UPDATE_COLS = ['name', 'capacity', 'updated_at'] as const;

export class SupabaseClassroomRepository implements IClassroomRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Classroom[]> {
    return (await this.sql`select * from classrooms order by name`).map(toRoom);
  }

  async findById(id: string): Promise<Classroom | null> {
    const rows = await this.sql`select * from classrooms where id = ${id}`;
    return rows[0] ? toRoom(rows[0]) : null;
  }

  async save(room: Classroom): Promise<Classroom> {
    const c = cols(room);
    await this.sql`
      insert into classrooms ${this.sql(c)}
      on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}
    `;
    return room;
  }

  async saveMany(rooms: Classroom[]): Promise<Classroom[]> {
    for (const r of rooms) await this.save(r);
    return rooms;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from classrooms where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from classrooms returning id`;
    return rows.length;
  }
}
