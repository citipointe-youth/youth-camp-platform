import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import type { AccommodationKind, PaymentStatus } from '../core/types/enums';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { field } from './elvanto-mapping';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  buildNameIndex, addToIndex, findPersonMatch, mergeOwnedFields,
} from './person-matching';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// ticket-import.service.ts — Ticket List CSV importer (Elvanto 3-CSV split, leg
// 1 of 3 alongside the Form import in `import.service.ts` and the Invoice
// import in `invoice-import.service.ts`). This CSV carries per-ticket
// accommodation/payment data (ticket #, invoice #, ticket type, payment
// status) and is matched cross-church by name (+phone tiebreak) via
// `person-matching.ts`, since it has no church column of its own. Unmatched
// rows create a flagged "orphan" Person (needsReview:true) rather than being
// dropped — someone must reconcile them against the Form import later. This
// service NEVER deletes a person: absence from a Ticket List upload is not
// evidence the person doesn't exist (that's the Form import's job).
// ---------------------------------------------------------------------------

const TicketImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  eventOccurrence: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

export interface TicketImportResult {
  created: number; // orphans created
  updated: number; // matched persons updated
  skipped: number; // missing name / ambiguous match / occurrence-filtered / row error
  dryRun: boolean;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  orphansCreated: string[]; // "First Last" labels
}

export interface TicketImportService {
  importTicketsCsv(actor: Actor, input: unknown): Promise<TicketImportResult>;
}

/** 'Classroom'/'Tent' (any case, substring) → AccommodationKind; anything else → null (unrecognized). */
function mapTicketType(raw: string): AccommodationKind | null {
  const v = raw.toLowerCase();
  if (v.includes('classroom')) return 'classroom';
  if (v.includes('tent')) return 'tent';
  return null;
}

/** Common Payment Status spellings → PaymentStatus; anything else → null (unrecognized). */
function mapPaymentStatus(raw: string): PaymentStatus | null {
  const v = raw.trim().toLowerCase();
  if (v === 'paid' || v === 'complete' || v === 'completed') return 'paid';
  if (v === 'partial' || v === 'part paid' || v === 'part-paid' || v === 'deposit') return 'deposit';
  if (v === 'pending' || v === 'unpaid' || v === 'not paid' || v === 'awaiting payment') return 'unpaid';
  return null;
}

function blankConsents(): Person['consents'] {
  const mk = (): { granted: boolean; timestamp: null } => ({ granted: false, timestamp: null });
  return { medical: mk(), media: mk(), supervision: mk() } as Person['consents'];
}

const OWNED_KEYS = ['ticketNumber', 'invoiceNumber', 'paymentStatus'] as const satisfies readonly (keyof Person)[];

export function makeTicketImportService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): TicketImportService {
  return {
    async importTicketsCsv(actor, input) {
      assertCan(actor, 'import:run');
      const opts = TicketImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: TicketImportResult['errors'] = [];
      const warnings: TicketImportResult['warnings'] = [];
      const orphansCreated: string[] = [];

      const churches = await churchRepo.findAll();
      const churchOverrideById = new Map<string, Person['accommodationKind']>();
      for (const c of churches) {
        if (c.accommodationOverride) churchOverrideById.set(c.id, c.accommodationOverride);
      }

      const allPersons = await personRepo.findAll();
      const index = buildNameIndex(allPersons);
      const touched = new Map<string, Person>();
      const occurrencesSeen = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;

        try {
          const firstName = field(row, 'First Name', 'firstName', 'first_name');
          const lastName = field(row, 'Last Name', 'lastName', 'last_name');
          if (!firstName || !lastName) {
            errors.push({ row: rowNum, message: 'Missing firstName or lastName' });
            skipped++;
            continue;
          }

          const eventOccurrenceRaw = field(row, 'Event Occurrence information', 'Event Occurrence', 'Occurrence', 'Event');
          if (eventOccurrenceRaw) occurrencesSeen.add(eventOccurrenceRaw);
          if (
            opts.eventOccurrence &&
            eventOccurrenceRaw.toLowerCase() !== opts.eventOccurrence.trim().toLowerCase()
          ) {
            warnings.push({
              row: rowNum,
              message:
                `Row occurrence "${eventOccurrenceRaw || '(blank)'}" does not match filter ` +
                `"${opts.eventOccurrence}" — skipped`,
            });
            skipped++;
            continue;
          }

          // A cancelled/refunded ticket must never be treated as confirmed accommodation truth —
          // "Active" is the only value observed in a real export; anything else explicitly not
          // active is skipped so it can't silently overwrite a good value. Blank/unrecognized
          // (e.g. a differently-worded export) passes through unfiltered rather than blocking.
          const ticketStatusRaw = field(row, 'Ticket Status');
          if (ticketStatusRaw && ticketStatusRaw.trim().toLowerCase() !== 'active') {
            warnings.push({
              row: rowNum,
              message: `Ticket Status "${ticketStatusRaw}" is not Active — row skipped`,
            });
            skipped++;
            continue;
          }

          const now = nowISO();

          const ticketNumber = field(row, 'Ticket Number', 'Ticket #', 'ticketNumber', 'ticket_number');
          const invoiceNumber = field(row, 'Invoice Number', 'Invoice #', 'invoiceNumber', 'invoice_number');
          const ticketTypeRaw = field(row, 'Ticket Type', 'Type', 'ticketType', 'ticket_type');
          const parsedKind = ticketTypeRaw ? mapTicketType(ticketTypeRaw) : null;
          if (ticketTypeRaw && parsedKind === null) {
            warnings.push({
              row: rowNum,
              message: `Unrecognized Ticket Type "${ticketTypeRaw}" — accommodation left unchanged`,
            });
          }
          const phoneRaw = field(row, 'Phone', 'Phone Number', 'Mobile', 'Mobile Number');
          const paymentStatusRaw = field(row, 'Invoice Payment Status', 'Payment Status', 'paymentStatus', 'Status');
          const parsedPaymentStatus = paymentStatusRaw ? mapPaymentStatus(paymentStatusRaw) : null;
          if (paymentStatusRaw && parsedPaymentStatus === null) {
            warnings.push({
              row: rowNum,
              message: `Unrecognized Payment Status "${paymentStatusRaw}" — left unchanged`,
            });
          }

          const match = findPersonMatch(index, { firstName, lastName, phone: phoneRaw });

          if (match.status === 'matched') {
            const existing = touched.get(match.person.id) ?? match.person;
            const churchOverride =
              existing.kind === 'youth' ? churchOverrideById.get(existing.churchId) : undefined;

            let finalKind: Person['accommodationKind'] = existing.accommodationKind;
            let finalConfidence: Person['accommodationKindConfidence'] = existing.accommodationKindConfidence;
            if (churchOverride) {
              finalKind = churchOverride;
              finalConfidence = 'confirmed';
              if (parsedKind && parsedKind !== churchOverride) {
                warnings.push({
                  row: rowNum,
                  message: `Accommodation "${parsedKind}" overridden to "${churchOverride}" (church override)`,
                });
              }
            } else if (parsedKind != null) {
              // Ticket List always overwrites unconditionally — even over an existing 'guessed' value.
              finalKind = parsedKind;
              finalConfidence = 'confirmed';
            }

            const mergedOwned = mergeOwnedFields(
              existing,
              { ticketNumber, invoiceNumber, paymentStatus: parsedPaymentStatus ?? undefined },
              OWNED_KEYS,
            );

            const merged: Person = {
              ...mergedOwned,
              accommodationKind: finalKind,
              accommodationKindConfidence: finalConfidence,
              updatedAt: now,
            };

            const firstTouch = !touched.has(merged.id);
            touched.set(merged.id, merged);
            addToIndex(index, merged);
            if (firstTouch) updated++;
          } else {
            const person: Person = {
              id: newId('person'),
              firstName,
              lastName,
              gender: 'other',
              dateOfBirth: null,
              grade: null,
              school: null,
              zone: '',
              groupId: null,
              kind: 'youth',
              mobile: phoneRaw || null,
              email: null,
              suburb: null,
              postcode: null,
              state: null,
              medicalConditions: [],
              dietaryRequirements: [],
              otherMedications: null,
              medicareNumber: null,
              churchUnlistedNote: null,
              elvantoMeta: null,
              consents: blankConsents(),
              parentGuardianName: null,
              parentPhone: null,
              parentRelation: null,
              blueCardNumber: null,
              blueCardExpiry: null,
              churchId: '',
              churchName: '',
              paymentStatus: parsedPaymentStatus ?? 'unpaid',
              accommodationKind: parsedKind,
              accommodationLabel: null,
              registrationType: null,
              registrationCost: null,
              discountCode: null,
              ticketNumber: ticketNumber || null,
              invoiceNumber: invoiceNumber || null,
              accommodationKindConfidence: parsedKind ? 'confirmed' : null,
              discountAmount: null,
              amountPaid: null,
              feesAmount: null,
              taxAmount: null,
              needsReview: true,
              needsReviewReason:
                `No matching person found for ticket row ${rowNum} (ticket #${ticketNumber || '—'}) — ` +
                'created as an unmatched orphan',
              lifecycle: 'registered',
              atCamp: false,
              checkInHistory: [],
              signOutHistory: [],
              createdAt: now,
              updatedAt: now,
            };

            touched.set(person.id, person);
            addToIndex(index, person);
            orphansCreated.push(`${firstName} ${lastName}`);
            warnings.push({
              row: rowNum,
              message: `No matching person found for "${firstName} ${lastName}" — created as an unmatched orphan`,
            });
            created++;
          }
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
          skipped++;
        }
      }

      if (!opts.eventOccurrence && occurrencesSeen.size > 1) {
        warnings.push({
          row: 0,
          message:
            `Multiple event occurrences found in this file (${[...occurrencesSeen].join(', ')}) — ` +
            'consider using the eventOccurrence filter to import one at a time',
        });
      }

      if (!opts.dryRun && touched.size > 0) {
        await personRepo.saveMany([...touched.values()]);
      }

      return { created, updated, skipped, dryRun: opts.dryRun, errors, warnings, orphansCreated };
    },
  };
}
