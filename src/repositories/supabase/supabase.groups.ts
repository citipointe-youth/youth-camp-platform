import type { SqlClient } from './client';
import type { IGroupRepository } from '../interfaces/entity-repositories';
import type { Group } from '../../core/entities/group';

function toGroup(r: Record<string, unknown>): Group {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    churchId: r['church_id'] as string,
    zone: r['zone'] as string,
    leaderId: r['leader_id'] as string,
    camperIds: (r['camper_ids'] as string[] | null) ?? [],
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function groupCols(g: Group): Record<string, unknown> {
  return {
    id: g.id,
    name: g.name,
    church_id: g.churchId,
    zone: g.zone,
    leader_id: g.leaderId,
    camper_ids: g.camperIds,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  };
}

const UPDATE_COLS = ['name', 'church_id', 'zone', 'leader_id', 'camper_ids', 'updated_at'] as const;

export class SupabaseGroupRepository implements IGroupRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<Group[]> {
    return (await this.sql`select * from groups order by name`).map(toGroup);
  }

  async findById(id: string): Promise<Group | null> {
    const rows = await this.sql`select * from groups where id = ${id}`;
    return rows[0] ? toGroup(rows[0]) : null;
  }

  async findByChurch(churchId: string): Promise<Group[]> {
    return (await this.sql`select * from groups where church_id = ${churchId} order by name`).map(toGroup);
  }

  async findByZone(zone: string): Promise<Group[]> {
    return (await this.sql`select * from groups where zone = ${zone} order by name`).map(toGroup);
  }

  async findByLeader(leaderId: string): Promise<Group[]> {
    return (await this.sql`select * from groups where leader_id = ${leaderId} order by name`).map(toGroup);
  }

  async save(group: Group): Promise<Group> {
    const cols = groupCols(group);
    await this.sql`
      insert into groups ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return group;
  }

  async saveMany(groups: Group[]): Promise<Group[]> {
    for (const g of groups) await this.save(g);
    return groups;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from groups where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from groups returning id`;
    return rows.length;
  }
}
