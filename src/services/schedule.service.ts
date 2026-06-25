import type { IScheduleRepository } from '../repositories/interfaces/entity-repositories';
import type { ScheduleItem } from '../core/entities/schedule';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { CreateScheduleItemSchema, UpdateScheduleItemSchema } from '../core/validation/content.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

export interface ScheduleService {
  getAll(actor: Actor): Promise<ScheduleItem[]>;
  getByDay(actor: Actor, day: string): Promise<ScheduleItem[]>;
  create(actor: Actor, input: unknown): Promise<ScheduleItem>;
  update(actor: Actor, id: string, input: unknown): Promise<ScheduleItem>;
  remove(actor: Actor, id: string): Promise<void>;
}

export function makeScheduleService(repo: IScheduleRepository): ScheduleService {
  return {
    async getAll(_actor) {
      return repo.findAll().then((items) =>
        items.sort((a, b) => {
          const d = a.day.localeCompare(b.day);
          return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
        }),
      );
    },

    async getByDay(_actor, day) {
      return repo.findByDay(day);
    },

    async create(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = CreateScheduleItemSchema.parse(input);
      const now = nowISO();
      const item: ScheduleItem = {
        id: newId('sched'),
        ...data,
        endTime: data.endTime ?? null,
        location: data.location ?? null,
        createdAt: now,
        updatedAt: now,
      };
      return repo.save(item);
    },

    async update(actor, id, input) {
      assertCan(actor, 'admin:manage');
      const existing = await repo.findById(id);
      if (!existing) throw new NotFoundError('Schedule item not found');
      const data = UpdateScheduleItemSchema.parse(input);
      return repo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async remove(actor, id) {
      assertCan(actor, 'admin:manage');
      const ok = await repo.delete(id);
      if (!ok) throw new NotFoundError('Schedule item not found');
    },
  };
}
