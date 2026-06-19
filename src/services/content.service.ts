import type { IFaqRepository, IDevotionalRepository } from '../repositories/interfaces/entity-repositories';
import type { FaqItem } from '../core/entities/content';
import type { Devotional } from '../core/entities/devotional';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { CreateFaqSchema, UpdateFaqSchema, SetDevotionalSchema } from '../core/validation/content.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

export interface ContentService {
  faqList(): Promise<FaqItem[]>;
  faqCreate(actor: Actor, input: unknown): Promise<FaqItem>;
  faqUpdate(actor: Actor, id: string, input: unknown): Promise<FaqItem>;
  faqDelete(actor: Actor, id: string): Promise<void>;
  devotionalGet(day: string): Promise<Devotional | null>;
  devotionalSet(actor: Actor, input: unknown): Promise<Devotional>;
}

export function makeContentService(
  faqRepo: IFaqRepository,
  devotionalRepo: IDevotionalRepository,
): ContentService {
  return {
    async faqList() {
      return faqRepo.findOrdered();
    },

    async faqCreate(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = CreateFaqSchema.parse(input);
      const now = nowISO();
      const item: FaqItem = {
        id: newId('faq'),
        question: data.question,
        answer: data.answer,
        order: data.order ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      return faqRepo.save(item);
    },

    async faqUpdate(actor, id, input) {
      assertCan(actor, 'admin:manage');
      const existing = await faqRepo.findById(id);
      if (!existing) throw new NotFoundError('FAQ item not found');
      const data = UpdateFaqSchema.parse(input);
      return faqRepo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async faqDelete(actor, id) {
      assertCan(actor, 'admin:manage');
      const ok = await faqRepo.delete(id);
      if (!ok) throw new NotFoundError('FAQ item not found');
    },

    async devotionalGet(day) {
      return devotionalRepo.findByDay(day);
    },

    async devotionalSet(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = SetDevotionalSchema.parse(input);
      const existing = await devotionalRepo.findByDay(data.day);
      const now = nowISO();
      const devotional: Devotional = {
        id: existing?.id ?? newId('dev'),
        ...data,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      return devotionalRepo.save(devotional);
    },
  };
}
