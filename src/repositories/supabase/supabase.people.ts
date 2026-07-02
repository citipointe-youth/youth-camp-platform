// ⚠️ UNVERIFIED SCAFFOLDING — see src/repositories/supabase/README.md.
//
// Reference implementation for the unified `people` table (design D2) with hybrid
// mapping (D4): scalar columns on `people`, JSONB `consents`, and the check-in /
// sign-out histories hydrated from CHILD TABLES (check_in_history, sign_out_history).
// This is the pattern the other Supabase repos should follow. NOT compiled or run.
import type { SqlClient, TxClient } from './client';
import type { IPersonRepository } from '../interfaces/entity-repositories';
import type { Person } from '../../core/entities/person';
import type { CheckInEntry, SignOutEvent, ElvantoMeta } from '../../core/entities/person';
import { isCamper } from '../../core/entities/person';

// ---------------------------------------------------------------------------
// Row → entity mappers
// ---------------------------------------------------------------------------

function dateOnly(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().split('T')[0]!;
  if (typeof v === 'string' && v) return v.split('T')[0]!;
  return null;
}

function toCheckInEntry(row: Record<string, unknown>): CheckInEntry {
  return {
    id: row['id'] as string,
    sessionId: row['session_id'] as string,
    sessionLabel: row['session_label'] as string,
    type: row['type'] as 'in' | 'out',
    leaderId: row['leader_id'] as string,
    timestamp: (row['timestamp'] as Date).toISOString(),
  };
}

function toSignOutEvent(row: Record<string, unknown>): SignOutEvent {
  return {
    id: row['id'] as string,
    type: row['type'] as 'out' | 'in',
    leaderName: row['leader_name'] as string,
    reason: (row['reason'] as string | null) ?? undefined,
    parentsMet: (row['parents_met'] as boolean | null) ?? undefined,
    authorId: row['author_id'] as string,
    timestamp: (row['timestamp'] as Date).toISOString(),
  };
}

/** Build a Person from a `people` row + its already-fetched history rows. */
function toPerson(
  row: Record<string, unknown>,
  checkIns: CheckInEntry[],
  signOuts: SignOutEvent[],
): Person {
  return {
    id: row['id'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    gender: row['gender'] as Person['gender'],
    dateOfBirth: dateOnly(row['date_of_birth']),
    grade: (row['grade'] as Person['grade'] | null) ?? null,
    school: (row['school'] as string | null) ?? null,
    kind: row['kind'] as Person['kind'],
    churchId: row['church_id'] as string,
    churchName: row['church_name'] as string,
    zone: row['zone'] as string,
    groupId: (row['group_id'] as string | null) ?? null,
    mobile: (row['mobile'] as string | null) ?? null,
    email: (row['email'] as string | null) ?? null,
    suburb: (row['suburb'] as string | null) ?? null,
    postcode: (row['postcode'] as string | null) ?? null,
    state: (row['state'] as string | null) ?? null,
    medicalConditions: (row['medical_conditions'] as string[] | null) ?? [],
    dietaryRequirements: (row['dietary_requirements'] as string[] | null) ?? [],
    otherMedications: (row['other_medications'] as string | null) ?? null,
    medicareNumber: (row['medicare_number'] as string | null) ?? null,
    churchUnlistedNote: (row['church_unlisted_note'] as string | null) ?? null,
    elvantoMeta: (row['elvanto_meta'] as ElvantoMeta | null) ?? null,
    parentGuardianName: (row['parent_guardian_name'] as string | null) ?? null,
    parentPhone: (row['parent_phone'] as string | null) ?? null,
    parentRelation: (row['parent_relation'] as string | null) ?? null,
    blueCardNumber: (row['blue_card_number'] as string | null) ?? null,
    blueCardExpiry: dateOnly(row['blue_card_expiry']),
    consents: (row['consents'] as Person['consents']) ?? {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: row['payment_status'] as Person['paymentStatus'],
    accommodationKind: (row['accommodation_kind'] as Person['accommodationKind']) ?? null,
    accommodationLabel: (row['accommodation_label'] as string | null) ?? null,
    registrationType: (row['registration_type'] as string | null) ?? null,
    registrationCost: (row['registration_cost'] as number | null) ?? null,
    discountCode: (row['discount_code'] as string | null) ?? null,
    ticketNumber: (row['ticket_number'] as string | null) ?? null,
    invoiceNumber: (row['invoice_number'] as string | null) ?? null,
    accommodationKindConfidence:
      (row['accommodation_kind_confidence'] as Person['accommodationKindConfidence']) ?? null,
    discountAmount: (row['discount_amount'] as number | null) ?? null,
    amountPaid: (row['amount_paid'] as number | null) ?? null,
    feesAmount: (row['fees_amount'] as number | null) ?? null,
    taxAmount: (row['tax_amount'] as number | null) ?? null,
    needsReview: (row['needs_review'] as boolean | null) ?? false,
    needsReviewReason: (row['needs_review_reason'] as string | null) ?? null,
    lifecycle: row['lifecycle'] as Person['lifecycle'],
    atCamp: row['at_camp'] as boolean,
    checkInHistory: checkIns,
    signOutHistory: signOuts,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

export class SupabasePersonRepository implements IPersonRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {
    // No-op: the table already exists (created by the migrations).
  }

  // --- history hydration -----------------------------------------------------

  /** Fetch + group both history tables for a set of person ids (avoids N+1). */
  private async loadHistories(ids: string[]): Promise<{
    checkIns: Map<string, CheckInEntry[]>;
    signOuts: Map<string, SignOutEvent[]>;
  }> {
    const checkIns = new Map<string, CheckInEntry[]>();
    const signOuts = new Map<string, SignOutEvent[]>();
    if (ids.length === 0) return { checkIns, signOuts };

    const ciRows = await this.sql`
      select * from check_in_history where person_id in ${this.sql(ids)} order by timestamp
    `;
    for (const r of ciRows) {
      const pid = r['person_id'] as string;
      (checkIns.get(pid) ?? checkIns.set(pid, []).get(pid)!).push(toCheckInEntry(r));
    }
    const soRows = await this.sql`
      select * from sign_out_history where person_id in ${this.sql(ids)} order by timestamp
    `;
    for (const r of soRows) {
      const pid = r['person_id'] as string;
      (signOuts.get(pid) ?? signOuts.set(pid, []).get(pid)!).push(toSignOutEvent(r));
    }
    return { checkIns, signOuts };
  }

  private async hydrate(rows: readonly Record<string, unknown>[]): Promise<Person[]> {
    const ids = rows.map((r) => r['id'] as string);
    const { checkIns, signOuts } = await this.loadHistories(ids);
    return rows.map((r) =>
      toPerson(r, checkIns.get(r['id'] as string) ?? [], signOuts.get(r['id'] as string) ?? []),
    );
  }

  // --- reads -----------------------------------------------------------------

  async findAll(): Promise<Person[]> {
    const rows = await this.sql`select * from people order by last_name, first_name`;
    return this.hydrate(rows);
  }

  async findById(id: string): Promise<Person | null> {
    const rows = await this.sql`select * from people where id = ${id}`;
    if (!rows[0]) return null;
    return (await this.hydrate(rows))[0] ?? null;
  }

  async findByChurch(churchId: string): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where church_id = ${churchId} order by last_name`);
  }

  async findByZone(zone: string): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where zone = ${zone} order by last_name`);
  }

  async findByGroup(groupId: string): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where group_id = ${groupId} order by last_name`);
  }

  async findByKind(kind: string): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where kind = ${kind} order by last_name`);
  }

  async findByLifecycle(lifecycle: string): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where lifecycle = ${lifecycle} order by last_name`);
  }

  async findCampers(): Promise<Person[]> {
    // lifecycle ∈ {arrived, checked_out, departed}
    const rows = await this.sql`
      select * from people where lifecycle in ('arrived','checked_out','departed') order by last_name
    `;
    return this.hydrate(rows);
  }

  async findAtCamp(): Promise<Person[]> {
    return this.hydrate(await this.sql`select * from people where at_camp = true order by last_name`);
  }

  async search(query: string): Promise<Person[]> {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const rows = await this.sql`select * from people order by last_name`;
    const matched = rows.filter((r: Record<string, unknown>) => {
      const full = `${r['first_name']} ${r['last_name']}`.toLowerCase();
      return terms.every((t) => full.includes(t));
    });
    return this.hydrate(matched);
  }

  // --- writes ----------------------------------------------------------------

  /** Upsert the `people` row + REPLACE its history child rows in one transaction. */
  async save(person: Person): Promise<Person> {
    await this.sql.begin(async (tx: TxClient) => {
      await tx`
        insert into people ${tx(personColumns(person))}
        on conflict (id) do update set ${tx(personColumns(person), ...PERSON_UPDATE_COLS)}
      `;
      await replaceHistories(tx, person);
    });
    return person;
  }

  async saveMany(people: Person[]): Promise<Person[]> {
    if (people.length === 0) return [];
    await this.sql.begin(async (tx: TxClient) => {
      // Each person must be upserted individually — the batch ON CONFLICT DO UPDATE
      // would incorrectly overwrite every conflicting row with batch[0]'s values.
      for (const p of people) {
        await tx`
          insert into people ${tx(personColumns(p))}
          on conflict (id) do update set ${tx(personColumns(p), ...PERSON_UPDATE_COLS)}
        `;
        await replaceHistories(tx, p);
      }
    });
    return people;
  }

  async delete(id: string): Promise<boolean> {
    // ON DELETE CASCADE removes the child history rows.
    const rows = await this.sql`delete from people where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from people returning id`;
    // children cascade; for a hard reset prefer `truncate people cascade` (no count).
    return rows.length;
  }
}

// ---------------------------------------------------------------------------
// Column maps + history replacement helpers
// ---------------------------------------------------------------------------

function personColumns(p: Person): Record<string, unknown> {
  return {
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName,
    gender: p.gender,
    date_of_birth: p.dateOfBirth ?? null,
    grade: p.grade ?? null,
    school: p.school ?? null,
    kind: p.kind,
    church_id: p.churchId ?? null,
    church_name: p.churchName,
    zone: p.zone,
    group_id: p.groupId ?? null,
    mobile: p.mobile ?? null,
    email: p.email ?? null,
    suburb: p.suburb ?? null,
    postcode: p.postcode ?? null,
    state: p.state ?? null,
    medical_conditions: p.medicalConditions,
    dietary_requirements: p.dietaryRequirements,
    other_medications: p.otherMedications ?? null,
    medicare_number: p.medicareNumber ?? null,
    church_unlisted_note: p.churchUnlistedNote ?? null,
    elvanto_meta: p.elvantoMeta ?? null,
    parent_guardian_name: p.parentGuardianName ?? null,
    parent_phone: p.parentPhone ?? null,
    parent_relation: p.parentRelation ?? null,
    blue_card_number: p.blueCardNumber ?? null,
    blue_card_expiry: p.blueCardExpiry ?? null,
    consents: p.consents,
    payment_status: p.paymentStatus,
    accommodation_kind: p.accommodationKind ?? null,
    accommodation_label: p.accommodationLabel ?? null,
    registration_type: p.registrationType ?? null,
    registration_cost: p.registrationCost ?? null,
    discount_code: p.discountCode ?? null,
    ticket_number: p.ticketNumber ?? null,
    invoice_number: p.invoiceNumber ?? null,
    accommodation_kind_confidence: p.accommodationKindConfidence ?? null,
    discount_amount: p.discountAmount ?? null,
    amount_paid: p.amountPaid ?? null,
    fees_amount: p.feesAmount ?? null,
    tax_amount: p.taxAmount ?? null,
    needs_review: p.needsReview ?? false,
    needs_review_reason: p.needsReviewReason ?? null,
    lifecycle: p.lifecycle,
    at_camp: p.atCamp,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// Columns updated on conflict (everything except id + created_at).
const PERSON_UPDATE_COLS = [
  'first_name', 'last_name', 'gender', 'date_of_birth', 'grade', 'school', 'kind',
  'church_id', 'church_name', 'zone', 'group_id', 'mobile', 'email', 'suburb',
  'postcode', 'state', 'medical_conditions', 'dietary_requirements', 'other_medications',
  'parent_guardian_name', 'parent_phone', 'parent_relation', 'blue_card_number',
  'blue_card_expiry', 'consents', 'payment_status', 'accommodation_kind',
  'accommodation_label', 'registration_type', 'registration_cost', 'discount_code',
  'lifecycle', 'at_camp', 'updated_at',
  // Pre-existing bug fix (unrelated to this change): these three columns were being
  // written on insert but never updated on conflict, so edits to them silently never
  // persisted on save/saveMany.
  'elvanto_meta', 'medicare_number', 'church_unlisted_note',
  // Ticket List / Invoice import fields (017).
  'ticket_number', 'invoice_number', 'accommodation_kind_confidence', 'discount_amount',
  'amount_paid', 'fees_amount', 'tax_amount', 'needs_review', 'needs_review_reason',
] as const;

/** Delete + reinsert a person's history child rows (authoritative replace). */
async function replaceHistories(tx: TxClient, p: Person): Promise<void> {
  await tx`delete from check_in_history where person_id = ${p.id}`;
  if (p.checkInHistory.length > 0) {
    await tx`insert into check_in_history ${tx(
      p.checkInHistory.map((e) => ({
        id: e.id,
        person_id: p.id,
        session_id: e.sessionId,
        session_label: e.sessionLabel,
        type: e.type,
        leader_id: e.leaderId,
        timestamp: e.timestamp,
      })),
    )}`;
  }
  await tx`delete from sign_out_history where person_id = ${p.id}`;
  if (p.signOutHistory.length > 0) {
    await tx`insert into sign_out_history ${tx(
      p.signOutHistory.map((e) => ({
        id: e.id,
        person_id: p.id,
        type: e.type,
        leader_name: e.leaderName,
        reason: e.reason ?? null,
        parents_met: e.parentsMet ?? null,
        author_id: e.authorId,
        timestamp: e.timestamp,
      })),
    )}`;
  }
}

// Silence "unused" until the live switchover wires findCampers' helper usage.
void isCamper;
