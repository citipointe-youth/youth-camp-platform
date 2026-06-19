import type { SqlClient } from './client';
import type { IScheduleRepository } from '../interfaces/entity-repositories';
import type { ScheduleItem } from '../../core/entities/schedule';

function toItem(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r['id'] as string,
    day: r['day'] as string,
    startTime: r['start_time'] as string,
    endTime: (r['end_time'] as string | null) ?? undefined,
    title: r['title'] as string,
    location: (r['location'] as string | null) ?? undefined,
    type: r['type'] as ScheduleItem['type'],
    isCheckInPoint: r['is_check_in_point'] as boolean,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function itemCols(s: ScheduleItem): Record<string, unknown> {
  return {
    id: s.id,
    day: s.day,
    start_time: s.startTime,
    end_time: s.endTime ?? null,
    title: s.title,
    location: s.location ?? null,
    type: s.type,
    is_check_in_point: s.isCheckInPoint,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

const UPDATE_COLS = [
  'day', 'start_time', 'end_time', 'title', 'location', 'type', 'is_check_in_point', 'updated_at',
] as const;

export class SupabaseScheduleRepository implements IScheduleRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<ScheduleItem[]> {
    return (await this.sql`select * from schedule_items order by day, start_time`).map(toItem);
  }

  async findById(id: string): Promise<ScheduleItem | null> {
    const rows = await this.sql`select * from schedule_items where id = ${id}`;
    return rows[0] ? toItem(rows[0]) : null;
  }

  async findByDay(day: string): Promise<ScheduleItem[]> {
    return (await this.sql`select * from schedule_items where day = ${day} order by start_time`).map(toItem);
  }

  async getCheckInPoints(): Promise<ScheduleItem[]> {
    return (await this.sql`
      select * from schedule_items where is_check_in_point = true order by day, start_time
    `).map(toItem);
  }

  async save(item: ScheduleItem): Promise<ScheduleItem> {
    const cols = itemCols(item);
    await this.sql`
      insert into schedule_items ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return item;
  }

  async saveMany(items: ScheduleItem[]): Promise<ScheduleItem[]> {
    for (const i of items) await this.save(i);
    return items;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from schedule_items where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from schedule_items returning id`;
    return rows.length;
  }
}
