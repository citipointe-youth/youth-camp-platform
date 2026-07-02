import type { IPersonRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { AccommodationKind } from '../core/types/enums';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { nowISO } from '../utils/date';
import { field } from './elvanto-mapping';
import {
  buildNameIndex, findPersonMatch, mergeOwnedFields,
} from './person-matching';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// invoice-import.service.ts — Invoice CSV importer (Elvanto 3-CSV split, leg 2
// of 3 alongside the Form import in `import.service.ts` and the Ticket List
// import). This CSV carries per-invoice financial data (amount paid, discount,
// fees, tax) and — unlike the Form/Ticket List CSVs — has NO church field and
// often no reliable name field either, only a billing/payer contact and an
// invoice number. Matching is therefore tiered: invoice number first (against
// `Person.invoiceNumber`, set by the Ticket List import), then a cross-church
// name+phone fallback via `person-matching.ts`, and finally "unmatched" (never
// an orphan Person — see the no-orphan note below).
// ---------------------------------------------------------------------------

const InvoiceImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  dryRun: z.boolean().optional().default(false),
  minAccommodationSampleSize: z.number().int().min(1).optional().default(3),
  minAccommodationMajorityRatio: z.number().min(0).max(1).optional().default(0.9),
});

export interface InvoiceImportResult {
  created: 0;
  updated: number;
  skipped: number;
  deleted: 0;
  /** Invoices whose invoice number matched MORE THAN ONE person — $ fields withheld for all matched people. */
  ambiguousGroupInvoices: number;
  /** Persons who received a NEW accommodationKind guess this run (via the price lookup). */
  guessedAccommodationCount: number;
  dryRun: boolean;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  unmatchedInvoices: Array<{
    row: number;
    invoiceNumber: string | null;
    billingName: string | null;
    amountPaid: number | null;
    ticketTotal: number | null;
  }>;
}

export interface InvoiceImportService {
  importInvoicesCsv(actor: Actor, input: unknown): Promise<InvoiceImportResult>;
}

/**
 * Parse a money string, PRESERVING a leading minus sign (discount/fee rows may be
 * negative depending on export convention). Strips everything except digits, '.',
 * and a leading '-'. Returns null for empty/blank input or a non-finite result.
 */
export function parseMoney(raw: string): number | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const negative = trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

/**
 * Build a price(cents) -> AccommodationKind lookup from persons whose accommodationKind
 * was CONFIRMED (never guessed) and whose registrationCost is known. Only prices with
 * at least `minSample` confirmed observations, where one kind holds at least
 * `minMajorityRatio` of them, are trusted as a guess source.
 */
export function buildAccommodationPriceLookup(
  allPeople: Person[],
  minSample: number,
  minMajorityRatio: number,
): Map<number, AccommodationKind> {
  const counts = new Map<number, Map<AccommodationKind, number>>();
  for (const p of allPeople) {
    if (p.accommodationKindConfidence !== 'confirmed') continue;
    if (p.accommodationKind == null) continue;
    if (p.registrationCost == null) continue;
    const cents = Math.round(p.registrationCost * 100);
    let kindCounts = counts.get(cents);
    if (!kindCounts) {
      kindCounts = new Map<AccommodationKind, number>();
      counts.set(cents, kindCounts);
    }
    kindCounts.set(p.accommodationKind, (kindCounts.get(p.accommodationKind) ?? 0) + 1);
  }

  const lookup = new Map<number, AccommodationKind>();
  for (const [cents, kindCounts] of counts) {
    let total = 0;
    let majorityKind: AccommodationKind | null = null;
    let majorityCount = 0;
    for (const [kind, count] of kindCounts) {
      total += count;
      if (count > majorityCount) {
        majorityCount = count;
        majorityKind = kind;
      }
    }
    if (total < minSample) continue;
    if (majorityKind === null) continue;
    if (majorityCount / total < minMajorityRatio) continue;
    lookup.set(cents, majorityKind);
  }
  return lookup;
}

const OWNED_KEYS = [
  'registrationCost',
  'discountCode',
  'discountAmount',
  'amountPaid',
  'feesAmount',
  'taxAmount',
  'accommodationKind',
  'accommodationKindConfidence',
] as const satisfies readonly (keyof Person)[];

export function makeInvoiceImportService(personRepo: IPersonRepository): InvoiceImportService {
  return {
    async importInvoicesCsv(actor, input) {
      assertCan(actor, 'import:run');
      const opts = InvoiceImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      let updated = 0;
      let skipped = 0;
      let ambiguousGroupInvoices = 0;
      let guessedAccommodationCount = 0;
      const errors: InvoiceImportResult['errors'] = [];
      const warnings: InvoiceImportResult['warnings'] = [];
      const unmatchedInvoices: InvoiceImportResult['unmatchedInvoices'] = [];

      const allPeople = await personRepo.findAll();

      const priceLookup = buildAccommodationPriceLookup(
        allPeople,
        opts.minAccommodationSampleSize,
        opts.minAccommodationMajorityRatio,
      );

      const byInvoiceNumber = new Map<string, Person[]>();
      for (const p of allPeople) {
        if (!p.invoiceNumber) continue;
        const pool = byInvoiceNumber.get(p.invoiceNumber);
        if (pool) pool.push(p);
        else byInvoiceNumber.set(p.invoiceNumber, [p]);
      }

      const nameIndex = buildNameIndex(allPeople);

      const touched = new Map<string, Person>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;

        try {
          const invoiceNumber = field(row, 'Invoice Number', 'Invoice #', 'Invoice ID', 'invoiceNumber') || null;
          // Real Billing Contacts export (2026-07-02 sample) uses plain "First Name"/"Last Name"
          // for the billing contact — NOT a "Billing "/"Payer " prefix as first guessed. Note this
          // is very often a PARENT, not the registrant (e.g. invoice billed to "Jacqueline Hales"
          // for attendee "Gizelle Hales") — that's exactly why invoice-number matching is tier 1
          // and this name is only a fallback (see the "billing-contact name only" warning below).
          const billingFirst = field(row, 'First Name', 'Billing First Name', 'Payer First Name') || '';
          const billingLast = field(row, 'Last Name', 'Billing Last Name', 'Payer Last Name') || '';
          const billingPhone = field(row, 'Phone', 'Billing Phone', 'Payer Phone', 'Mobile Number') || null;

          const ticketTotalRaw = field(row, 'Ticket Total', 'Tickets Total', 'registrationCost') || '';
          const discountTotalRaw = field(row, 'Discount Total', 'Discount Amount') || '';
          const amountPaidRaw = field(row, 'Amount Paid', 'Paid Amount', 'Total Paid') || '';
          const feesRaw = field(row, 'Fees Paid', 'Fees', 'Processing Fee', 'Fees Total') || '';
          const taxRaw = field(row, 'Total Tax', 'Tax', 'GST', 'Tax Total') || '';
          const discountCode = field(row, 'Discount Code', 'Code', 'Coupon Code') || null;

          const ticketTotal = parseMoney(ticketTotalRaw);
          const discountAmount = parseMoney(discountTotalRaw);
          const amountPaid = parseMoney(amountPaidRaw);
          const feesAmount = parseMoney(feesRaw);
          const taxAmount = parseMoney(taxRaw);

          if (
            ticketTotal === null &&
            discountAmount === null &&
            amountPaid === null &&
            feesAmount === null &&
            taxAmount === null
          ) {
            warnings.push({ row: rowNum, message: 'No financial data in row — skipped' });
            skipped++;
            continue;
          }

          const billingName = billingFirst || billingLast ? `${billingFirst} ${billingLast}`.trim() : null;

          // ---- Tiered matching ----
          let matchedPeople: Person[] = [];
          let viaGroup = false;

          if (invoiceNumber) {
            const candidates = byInvoiceNumber.get(invoiceNumber);
            if (candidates && candidates.length === 1) {
              matchedPeople = [candidates[0]!];
            } else if (candidates && candidates.length > 1) {
              matchedPeople = candidates;
              viaGroup = true;
            }
          }

          if (matchedPeople.length === 0 && billingFirst && billingLast) {
            const result = findPersonMatch(nameIndex, {
              firstName: billingFirst,
              lastName: billingLast,
              phone: billingPhone,
            });
            if (result.status === 'matched') {
              matchedPeople = [result.person];
              warnings.push({
                row: rowNum,
                message: `Matched by billing-contact name only — verify "${billingFirst} ${billingLast}" is actually a covered registrant, not just the payer`,
              });
            } else if (result.reason === 'ambiguous') {
              warnings.push({
                row: rowNum,
                message: `Billing contact "${billingFirst} ${billingLast}" matches ${result.candidates.length} people — ambiguous, invoice unmatched`,
              });
            }
          }

          if (matchedPeople.length === 0) {
            unmatchedInvoices.push({
              row: rowNum,
              invoiceNumber,
              billingName,
              amountPaid,
              ticketTotal,
            });
            warnings.push({
              row: rowNum,
              message: `No matching person for invoice ${invoiceNumber ?? '(no invoice number)'} (amount paid: ${amountPaid ?? 'unknown'}) — not imported`,
            });
            skipped++;
            continue;
          }

          if (viaGroup) {
            ambiguousGroupInvoices++;
            warnings.push({
              row: rowNum,
              message: `Invoice ${invoiceNumber} matches ${matchedPeople.length} people — financial fields withheld for all of them (cannot attribute a shared total to individuals)`,
            });
            if (discountCode) {
              for (const person of matchedPeople) {
                const incoming: Partial<Person> = { discountCode };
                const merged = mergeOwnedFields(person, incoming, OWNED_KEYS);
                merged.updatedAt = nowISO();
                const firstTouch = !touched.has(merged.id);
                touched.set(merged.id, merged);
                if (firstTouch) updated++;
              }
            }
            continue;
          }

          // Single match.
          const person = matchedPeople[0]!;
          const incoming: Partial<Person> = {};
          if (ticketTotal !== null) incoming.registrationCost = ticketTotal;
          if (discountAmount !== null) incoming.discountAmount = discountAmount;
          if (amountPaid !== null) incoming.amountPaid = amountPaid;
          if (feesAmount !== null) incoming.feesAmount = feesAmount;
          if (taxAmount !== null) incoming.taxAmount = taxAmount;
          if (discountCode) incoming.discountCode = discountCode;

          const alreadyConfirmed =
            person.accommodationKind != null && person.accommodationKindConfidence === 'confirmed';
          if (ticketTotal !== null && !alreadyConfirmed) {
            const guess = priceLookup.get(Math.round(ticketTotal * 100));
            if (guess) {
              incoming.accommodationKind = guess;
              incoming.accommodationKindConfidence = 'guessed';
              guessedAccommodationCount++;
            }
          }

          if (Object.keys(incoming).length === 0) {
            skipped++;
            continue;
          }

          const merged = mergeOwnedFields(person, incoming, OWNED_KEYS);
          merged.updatedAt = nowISO();
          const firstTouch = !touched.has(merged.id);
          touched.set(merged.id, merged);
          if (firstTouch) updated++;
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
          skipped++;
        }
      }

      if (!opts.dryRun && touched.size > 0) {
        await personRepo.saveMany([...touched.values()]);
      }

      return {
        created: 0,
        updated,
        skipped,
        deleted: 0,
        ambiguousGroupInvoices,
        guessedAccommodationCount,
        dryRun: opts.dryRun,
        errors,
        warnings,
        unmatchedInvoices,
      };
    },
  };
}
