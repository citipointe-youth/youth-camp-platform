import type { SqlClient, TxClient } from './client';
import type { IChurchRepository } from '../interfaces/entity-repositories';
import type { Church } from '../../core/entities/church';
import { newId } from '../../utils/id';

function toChurch(row: Record<string, unknown>, reservations: Church['reservations']): Church {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    zone: row['zone'] as Church['zone'],
    code: row['code'] as string,
    selfRegisterSlug: row['self_register_slug'] as string,
    expectedCount: row['expected_count'] as number,
    youthPastorName: (row['youth_pastor_name'] as string | null) ?? undefined,
    contactEmail: (row['contact_email'] as string | null) ?? undefined,
    contactPhone: (row['contact_phone'] as string | null) ?? undefined,
    contacts: (row['contacts'] as Church['contacts']) ?? {
      male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
      female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
    },
    reservations,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function churchColumns(c: Church): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    zone: c.zone,
    code: c.code,
    self_register_slug: c.selfRegisterSlug,
    expected_count: c.expectedCount,
    youth_pastor_name: c.youthPastorName ?? null,
    contact_email: c.contactEmail ?? null,
    contact_phone: c.contactPhone ?? null,
    contacts: c.contacts,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

const UPDATE_COLS = [
  'name', 'zone', 'code', 'self_register_slug', 'expected_count',
  'youth_pastor_name', 'contact_email', 'contact_phone', 'contacts', 'updated_at',
] as const;

export class SupabaseChurchRepository implements IChurchRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  private async loadReservations(churchIds: string[]): Promise<Map<string, Church['reservations']>> {
    const map = new Map<string, Church['reservations']>();
    if (churchIds.length === 0) return map;
    const rows = await this.sql`select * from reservations where church_id in ${this.sql(churchIds)}`;
    for (const r of rows) {
      const cid = r['church_id'] as string;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push({
        kind: r['kind'] as 'tent' | 'classroom',
        spots: r['spots'] as number,
        label: r['label'] as string,
        confirmed: r['confirmed'] as boolean,
      });
    }
    return map;
  }

  private async hydrate(rows: readonly Record<string, unknown>[]): Promise<Church[]> {
    const ids = rows.map((r) => r['id'] as string);
    const resMap = await this.loadReservations(ids);
    return rows.map((r) => toChurch(r, resMap.get(r['id'] as string) ?? []));
  }

  async findAll(): Promise<Church[]> {
    return this.hydrate(await this.sql`select * from churches order by zone, name`);
  }

  async findById(id: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where id = ${id}`;
    return rows[0] ? (await this.hydrate(rows))[0] ?? null : null;
  }

  async findByCode(code: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where code = ${code}`;
    return rows[0] ? (await this.hydrate(rows))[0] ?? null : null;
  }

  async findByZone(zone: string): Promise<Church[]> {
    return this.hydrate(await this.sql`select * from churches where zone = ${zone} order by name`);
  }

  async findBySlug(slug: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where self_register_slug = ${slug}`;
    return rows[0] ? (await this.hydrate(rows))[0] ?? null : null;
  }

  async save(church: Church): Promise<Church> {
    await this.sql.begin(async (tx: TxClient) => {
      await tx`
        insert into churches ${tx(churchColumns(church))}
        on conflict (id) do update set ${tx(churchColumns(church), ...UPDATE_COLS)}
      `;
      // Replace reservations: delete existing, re-insert with generated IDs.
      await tx`delete from reservations where church_id = ${church.id}`;
      if (church.reservations.length > 0) {
        await tx`insert into reservations ${tx(
          church.reservations.map((r) => ({
            id: newId('rsv'),
            church_id: church.id,
            kind: r.kind,
            spots: r.spots,
            label: r.label,
            confirmed: r.confirmed,
          })),
        )}`;
      }
    });
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
