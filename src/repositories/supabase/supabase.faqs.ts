import type { SqlClient } from './client';
import type { IFaqRepository } from '../interfaces/entity-repositories';
import type { FaqItem } from '../../core/entities/content';

function toFaq(r: Record<string, unknown>): FaqItem {
  return {
    id: r['id'] as string,
    question: r['question'] as string,
    answer: r['answer'] as string,
    order: r['order'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function faqCols(f: FaqItem): Record<string, unknown> {
  return {
    id: f.id,
    question: f.question,
    answer: f.answer,
    order: f.order,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}

const UPDATE_COLS = ['question', 'answer', 'order', 'updated_at'] as const;

export class SupabaseFaqRepository implements IFaqRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<FaqItem[]> {
    return (await this.sql`select * from faqs order by "order", created_at`).map(toFaq);
  }

  async findById(id: string): Promise<FaqItem | null> {
    const rows = await this.sql`select * from faqs where id = ${id}`;
    return rows[0] ? toFaq(rows[0]) : null;
  }

  async findOrdered(): Promise<FaqItem[]> {
    return (await this.sql`select * from faqs order by "order", created_at`).map(toFaq);
  }

  async save(faq: FaqItem): Promise<FaqItem> {
    const cols = faqCols(faq);
    await this.sql`
      insert into faqs ${this.sql(cols)}
      on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}
    `;
    return faq;
  }

  async saveMany(faqs: FaqItem[]): Promise<FaqItem[]> {
    for (const f of faqs) await this.save(f);
    return faqs;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from faqs where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from faqs returning id`;
    return rows.length;
  }
}
