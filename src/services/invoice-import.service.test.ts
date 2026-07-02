import { describe, it, expect } from 'vitest';
import { makeInvoiceImportService, parseMoney } from './invoice-import.service';
import { InMemoryPersonRepository } from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { ForbiddenError, BadRequestError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// invoice-import.service.test.ts — Invoice CSV importer (Elvanto 3-CSV split).
// This CSV has no church field and often no reliable name field, so matching
// is tiered (invoice number -> cross-church name+phone -> unmatched, never an
// orphan). Coverage focuses on the tiers, the group-invoice $ withholding, the
// never-overwrite-confirmed-accommodation invariant, and the price->kind guess
// thresholds.
// ---------------------------------------------------------------------------

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

let idCounter = 0;
function person(over: Partial<Person> = {}): Person {
  idCounter += 1;
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: `p${idCounter}`,
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    kind: 'youth',
    churchId: 'c1',
    churchName: 'Victory',
    zone: 'Yellow',
    mobile: null,
    email: null,
    medicalConditions: [],
    dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid',
    needsReview: false,
    lifecycle: 'registered',
    atCamp: false,
    checkInHistory: [],
    signOutHistory: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

async function build(people: Person[] = []) {
  const personRepo = new InMemoryPersonRepository();
  await personRepo.init();
  for (const p of people) await personRepo.save(p);
  const svc = makeInvoiceImportService(personRepo);
  return { svc, personRepo };
}

const HDR = 'Invoice Number,Billing First Name,Billing Last Name,Billing Phone,Ticket Total,Discount Total,Amount Paid,Fees,Tax,Discount Code';

describe('parseMoney', () => {
  it('parses a plain amount', () => {
    expect(parseMoney('250')).toBe(250);
  });

  it('strips currency symbols/commas', () => {
    expect(parseMoney('$1,250.50')).toBe(1250.5);
  });

  it('preserves a leading minus sign (negative discount/fee)', () => {
    expect(parseMoney('-15.50')).toBe(-15.5);
  });

  it('returns null for empty/blank input', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('   ')).toBeNull();
  });

  it('returns null when nothing numeric remains', () => {
    expect(parseMoney('N/A')).toBeNull();
  });
});

describe('InvoiceImportService.importInvoicesCsv — RBAC + validation', () => {
  it('forbids roles without import:run (church, zoneLeader)', async () => {
    const { svc } = await build();
    for (const role of ['church', 'zoneLeader'] as const) {
      await expect(svc.importInvoicesCsv(actor(role), { csvData: `${HDR}\nINV-1,,,,250,,250,,,` }))
        .rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('throws BadRequest when there are no data rows', async () => {
    const { svc } = await build();
    await expect(svc.importInvoicesCsv(actor('admin'), { csvData: HDR })).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('InvoiceImportService.importInvoicesCsv — invoice-number matching (single)', () => {
  it('matches a single person by invoice number and applies financial fields', async () => {
    const target = person({ id: 'p1', invoiceNumber: 'INV-100' });
    const { svc, personRepo } = await build([target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-100,,,,250,10,240,5,2,SUMMER10`,
    });
    expect(res.updated).toBe(1);
    expect(res.ambiguousGroupInvoices).toBe(0);
    const p = (await personRepo.findAll()).find((x) => x.id === 'p1')!;
    expect(p.registrationCost).toBe(250);
    expect(p.discountAmount).toBe(10);
    expect(p.amountPaid).toBe(240);
    expect(p.feesAmount).toBe(5);
    expect(p.taxAmount).toBe(2);
    expect(p.discountCode).toBe('SUMMER10');
  });
});

describe('InvoiceImportService.importInvoicesCsv — invoice-number matching (group)', () => {
  it('withholds $ fields for a group match but still applies discountCode; increments ambiguousGroupInvoices', async () => {
    const a = person({ id: 'p1', firstName: 'Ada', lastName: 'Lovelace', invoiceNumber: 'INV-200' });
    const b = person({ id: 'p2', firstName: 'Grace', lastName: 'Hopper', invoiceNumber: 'INV-200' });
    const { svc, personRepo } = await build([a, b]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-200,,,,500,,500,,,SUMMER10`,
    });
    expect(res.ambiguousGroupInvoices).toBe(1);
    expect(res.warnings.some((w) => w.message.includes('INV-200') && w.message.includes('2'))).toBe(true);
    const all = await personRepo.findAll();
    const pa = all.find((x) => x.id === 'p1')!;
    const pb = all.find((x) => x.id === 'p2')!;
    for (const p of [pa, pb]) {
      expect(p.registrationCost).toBeUndefined();
      expect(p.amountPaid).toBeUndefined();
      expect(p.discountCode).toBe('SUMMER10');
    }
    expect(res.updated).toBe(2);
  });
});

describe('InvoiceImportService.importInvoicesCsv — billing-name fallback', () => {
  it('matches by billing-contact name when no invoice number matches, with a verify warning', async () => {
    const target = person({ id: 'p1', firstName: 'Liam', lastName: 'Est' });
    const { svc, personRepo } = await build([target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\n,Liam,Est,,300,,300,,,`,
    });
    expect(res.updated).toBe(1);
    const p = (await personRepo.findAll()).find((x) => x.id === 'p1')!;
    expect(p.registrationCost).toBe(300);
    expect(res.warnings.some((w) => w.message.includes('Matched by billing-contact name only'))).toBe(true);
  });
});

describe('InvoiceImportService.importInvoicesCsv — unmatched invoices (no orphan)', () => {
  it('records an unmatched invoice without creating a Person', async () => {
    const { svc, personRepo } = await build([]);
    const before = await personRepo.findAll();
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-999,Unknown,Payer,,100,,100,,,`,
    });
    expect(res.unmatchedInvoices).toHaveLength(1);
    expect(res.unmatchedInvoices[0]).toMatchObject({
      invoiceNumber: 'INV-999',
      billingName: 'Unknown Payer',
      amountPaid: 100,
      ticketTotal: 100,
    });
    expect(res.created).toBe(0);
    const after = await personRepo.findAll();
    expect(after).toHaveLength(before.length);
  });

  it('rows with no financial data at all are skipped with a warning (not treated as unmatched)', async () => {
    const { svc } = await build([]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-1,,,,,,,,,`,
    });
    expect(res.skipped).toBe(1);
    expect(res.unmatchedInvoices).toHaveLength(0);
    expect(res.warnings.some((w) => w.message.includes('No financial data'))).toBe(true);
  });
});

describe('InvoiceImportService.importInvoicesCsv — accommodation guess', () => {
  function confirmed(kind: Person['accommodationKind'], cost: number, idOver: string): Person {
    return person({
      id: idOver,
      accommodationKind: kind,
      accommodationKindConfidence: 'confirmed',
      registrationCost: cost,
    });
  }

  it('never overwrites an already-confirmed accommodationKind', async () => {
    const samples = [
      confirmed('tent', 300, 's1'),
      confirmed('tent', 300, 's2'),
      confirmed('tent', 300, 's3'),
    ];
    const target = person({
      id: 'target',
      invoiceNumber: 'INV-CONF',
      accommodationKind: 'classroom',
      accommodationKindConfidence: 'confirmed',
    });
    const { svc, personRepo } = await build([...samples, target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-CONF,,,,300,,300,,,`,
    });
    const p = (await personRepo.findAll()).find((x) => x.id === 'target')!;
    expect(p.accommodationKind).toBe('classroom');
    expect(p.accommodationKindConfidence).toBe('confirmed');
    expect(res.guessedAccommodationCount).toBe(0);
  });

  it('does NOT guess when there are too few samples at that price', async () => {
    const samples = [confirmed('tent', 400, 's1'), confirmed('tent', 400, 's2')]; // only 2, default minSample=3
    const target = person({ id: 'target', invoiceNumber: 'INV-FEW' });
    const { svc, personRepo } = await build([...samples, target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-FEW,,,,400,,400,,,`,
    });
    const p = (await personRepo.findAll()).find((x) => x.id === 'target')!;
    expect(p.accommodationKind).toBeUndefined();
    expect(res.guessedAccommodationCount).toBe(0);
  });

  it('does NOT guess when enough samples exist but below the majority ratio', async () => {
    const samples = [
      confirmed('tent', 500, 's1'),
      confirmed('tent', 500, 's2'),
      confirmed('classroom', 500, 's3'),
    ]; // 3 samples (meets minSample) but majority ratio is 2/3 ≈ 0.667 < default 0.9
    const target = person({ id: 'target', invoiceNumber: 'INV-SPLIT' });
    const { svc, personRepo } = await build([...samples, target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-SPLIT,,,,500,,500,,,`,
    });
    const p = (await personRepo.findAll()).find((x) => x.id === 'target')!;
    expect(p.accommodationKind).toBeUndefined();
    expect(res.guessedAccommodationCount).toBe(0);
  });

  it('guesses accommodationKind when sample size and majority thresholds are met', async () => {
    const samples = [
      confirmed('classroom', 600, 's1'),
      confirmed('classroom', 600, 's2'),
      confirmed('classroom', 600, 's3'),
    ];
    const target = person({ id: 'target', invoiceNumber: 'INV-GUESS' });
    const { svc, personRepo } = await build([...samples, target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-GUESS,,,,600,,600,,,`,
    });
    const p = (await personRepo.findAll()).find((x) => x.id === 'target')!;
    expect(p.accommodationKind).toBe('classroom');
    expect(p.accommodationKindConfidence).toBe('guessed');
    expect(res.guessedAccommodationCount).toBe(1);
  });
});

describe('InvoiceImportService.importInvoicesCsv — never deletes, dry-run', () => {
  it('never deletes anyone (created/deleted are always 0)', async () => {
    const target = person({ id: 'p1', invoiceNumber: 'INV-1' });
    const other = person({ id: 'p2', firstName: 'Other', lastName: 'Person' });
    const { svc, personRepo } = await build([target, other]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-1,,,,100,,100,,,`,
    });
    expect(res.created).toBe(0);
    expect(res.deleted).toBe(0);
    const all = await personRepo.findAll();
    expect(all).toHaveLength(2);
  });

  it('dry-run makes no changes to the repo', async () => {
    const target = person({ id: 'p1', invoiceNumber: 'INV-1' });
    const { svc, personRepo } = await build([target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-1,,,,100,,100,,,`,
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
    expect(res.updated).toBe(1); // counted, but not persisted
    const p = (await personRepo.findAll()).find((x) => x.id === 'p1')!;
    expect(p.registrationCost).toBeUndefined();
  });
});

describe('InvoiceImportService.importInvoicesCsv — negative amounts', () => {
  it('parses a negative discount amount correctly via parseMoney', async () => {
    const target = person({ id: 'p1', invoiceNumber: 'INV-NEG' });
    const { svc, personRepo } = await build([target]);
    const res = await svc.importInvoicesCsv(actor('admin'), {
      csvData: `${HDR}\nINV-NEG,,,,100,-15.50,84.50,,,`,
    });
    expect(res.updated).toBe(1);
    const p = (await personRepo.findAll()).find((x) => x.id === 'p1')!;
    expect(p.discountAmount).toBe(-15.5);
  });
});
