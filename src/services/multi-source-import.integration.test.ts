import { describe, it, expect } from 'vitest';
import { makeImportService } from './import.service';
import { makeTicketImportService } from './ticket-import.service';
import { makeInvoiceImportService } from './invoice-import.service';
import { InMemoryPersonRepository, InMemoryChurchRepository } from '../repositories/in-memory';
import type { Actor } from '../core/entities/user';

// ---------------------------------------------------------------------------
// Real-sample integration test — runs the ACTUAL three Elvanto exports the
// user supplied on 2026-07-02 (Form Submissions, Ticket List, Billing
// Contacts/Invoice) through all three importers in sequence, verifying the
// end-to-end pipeline against real column headers and real data quirks:
//   - Ticket List's real headers differ from the original guesses ("Event
//     Occurrence information" not "Event Occurrence", "Invoice Payment
//     Status" not "Payment Status") and include a "Ticket Status" column
//     not anticipated at design time (only "Active" tickets should count).
//   - Ticket Type values are "Classroom Accommodation" / "EARLY BIRD | Tent
//     Accomodation" (sic) — substring-matched, not exact.
//   - The Invoice export's billing-contact name is very often a PARENT, not
//     the registrant (e.g. invoice for "Jacqueline Hales" covers attendee
//     "Gizelle Hales") — proving why invoice-number matching must be tier 1,
//     not the name fallback.
//   - Invoice headers differ from the original guesses too ("Fees Paid" not
//     "Fees", "Total Tax" not "Tax", plain "First Name"/"Last Name" not
//     "Billing First Name").
// ---------------------------------------------------------------------------

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

const FORM_CSV = `Date Submitted,Submission Status,Person,Person Status,First Name,Last Name,Gender,Date of Birth,School Grade,Mobile Number,Email Address,Suburb,Postcode,State,Medicare Number,Medical Conditions,Dietary Requirements,List Other Medical Conditions or Medication Taken,Attendee's Church,"If from a church not listed, please specify church name & Youth Pastor",Blue Card/Working with Children Card Number,Blue Card/Working with Children Card Expiry,I give medical consent for my child as listed above.,I give photography and video consent for my child as listed above.,I understand and agree to the Supervision policy.,Parent/Guardian Name,Relation to Child,Parent/Guardian Phone Number,Today's Date
30/06/2026,Pending,"Hales, Gizelle",Pending,Gizellea,Halesaa,Female,24/04/2012,9,0416378611,ajhale992@gmail.com,Petrie,4502,QLD,4340288411,Penicilin Allergy,None,,Citipointe Pine Rivers,,,,Yes,Yes,Yes,Jacqueline Halesaa,Mother,0416378611,30/06/2026
30/06/2026,Pending,,Pending,Reubena,Rentschaa,Male,8/06/2009,12,0480590411,areubenrentsch@gmail.com,Loganholme,4129,Qld,3377829811,,,,Kingdom Hope Church,,,,Yes,Yes,Yes,Chrisa Rentschaa,Father,0438665211,30/06/2026
29/06/2026,Pending,"Drake, Isaiah",Pending,Isaiaha,Drakeaa,Male,1005-08-05,18+ Leader,0430802911,aisaiah@alivechurch.au,AVENELL HEIGHTS,4670,QLD,4409673211,,,,Alive Church Bundaberg,,1255325/5,15/11/2028,Yes,Yes,Yes,Isaiaha Drakeaa,myself,0430802911,29/06/2026
`;

const TICKET_CSV = `Ticket Number,Ticket Type,Invoice Number,Event Occurrence information,Last Name,First Name,Phone,Invoice Payment Status,Ticket Status
31318,Classroom Accommodation,022243,,Halesaa,Gizellea,0416378611,Paid,Active
31317,EARLY BIRD | Tent Accomodation,022242,,Rentschaa,Reubena,0480590411,Paid,Active
31316,EARLY BIRD | Tent Accomodation,022241,,Drakeaa,Isaiaha,0430802911,Paid,Active
`;

const INVOICE_CSV = `Invoice Number,Event Name,Last Name,First Name,Email,Phone,Home Address,Home Address City,Home Address State,Home Address Postcode,Home Address Country,Mailing Address,Mailing Address City,Mailing Address State,Mailing Address Postcode,Mailing Address Country,Payment Method,Invoice Date,Invoice Status,Registrants,Amount Paid,Ticket Total,Discount Total,Fees Paid,Total Tax,Tax Type,Total,Total Due,Transaction Total,Discount Code
022243,YOUTH CAMP 2026 - PREPARE THE WAY,Halesaa,Jacquelinea,ajhale992@gmail.com,,,,,,,,,,,,,30/06/2026 21:18,Paid,1,190,190,0,0,0,Inclusive,190,0,190,
022242,YOUTH CAMP 2026 - PREPARE THE WAY,Rentschaa,Chrisa,acrentsch79@gmail.com,,,,,,,,,,,,,30/06/2026 5:05,Paid,1,150,150,0,0,0,Inclusive,150,0,150,
022241,YOUTH CAMP 2026 - PREPARE THE WAY,Drakeaa,Isaiaha,aisaiah@alivechurch.au,,,,,,,,,,,,,29/06/2026 15:03,Paid,1,0,150,150,0,0,Inclusive,0,0,0,ALIVE100
`;

async function build() {
  const personRepo = new InMemoryPersonRepository();
  const churchRepo = new InMemoryChurchRepository();
  await personRepo.init();
  await churchRepo.init();
  return {
    personRepo,
    churchRepo,
    formSvc: makeImportService(personRepo, churchRepo),
    ticketSvc: makeTicketImportService(personRepo, churchRepo),
    invoiceSvc: makeInvoiceImportService(personRepo),
  };
}

describe('Multi-source import — real 2026-07-02 sample files, run in sequence (Form -> Ticket -> Invoice)', () => {
  it('creates 3 registrants from the real Form export, auto-creating their churches', async () => {
    const { formSvc, personRepo, churchRepo } = await build();
    const res = await formSvc.importCsv(actor('admin'), { csvData: FORM_CSV });
    expect(res).toMatchObject({ created: 3, updated: 0, skipped: 0, errors: [] });
    const people = await personRepo.findAll();
    expect(people).toHaveLength(3);
    const churches = await churchRepo.findAll();
    expect(churches.map((c) => c.name).sort()).toEqual(
      ['Alive Church Bundaberg', 'Citipointe Pine Rivers', 'Kingdom Hope Church'].sort(),
    );
    const isaiah = people.find((p) => p.firstName === 'Isaiaha')!;
    expect(isaiah.kind).toBe('leader'); // "18+ Leader" School Grade
  });

  it('the real Ticket List file matches all 3 by name (cross-church) and sets confirmed accommodation', async () => {
    const { formSvc, ticketSvc, personRepo } = await build();
    await formSvc.importCsv(actor('admin'), { csvData: FORM_CSV });
    const res = await ticketSvc.importTicketsCsv(actor('admin'), { csvData: TICKET_CSV });
    // All 3 real rows match an existing person by (cross-church) name — no orphans, no skips.
    expect(res).toMatchObject({ created: 0, updated: 3, skipped: 0, errors: [] });

    const people = await personRepo.findAll();
    expect(people).toHaveLength(3); // no orphans created

    const gizelle = people.find((p) => p.firstName === 'Gizellea')!;
    expect(gizelle.accommodationKind).toBe('classroom'); // "Classroom Accommodation"
    expect(gizelle.accommodationKindConfidence).toBe('confirmed');
    expect(gizelle.ticketNumber).toBe('31318');
    expect(gizelle.invoiceNumber).toBe('022243');
    expect(gizelle.paymentStatus).toBe('paid');

    const reuben = people.find((p) => p.firstName === 'Reubena')!;
    expect(reuben.accommodationKind).toBe('tent'); // "EARLY BIRD | Tent Accomodation" (real misspelling)
    expect(reuben.accommodationKindConfidence).toBe('confirmed');
    expect(reuben.ticketNumber).toBe('31317');
    expect(reuben.invoiceNumber).toBe('022242');

    const isaiah = people.find((p) => p.firstName === 'Isaiaha')!;
    expect(isaiah.accommodationKind).toBe('tent');
    expect(isaiah.ticketNumber).toBe('31316');
    expect(isaiah.invoiceNumber).toBe('022241');
  });

  it('a non-Active Ticket Status is skipped, not treated as confirmed truth', async () => {
    const { formSvc, ticketSvc, personRepo } = await build();
    await formSvc.importCsv(actor('admin'), { csvData: FORM_CSV });
    const cancelledCsv = TICKET_CSV.replace(
      '31318,Classroom Accommodation,022243,,Halesaa,Gizellea,0416378611,Paid,Active',
      '31318,Classroom Accommodation,022243,,Halesaa,Gizellea,0416378611,Paid,Cancelled',
    );
    const res = await ticketSvc.importTicketsCsv(actor('admin'), { csvData: cancelledCsv });
    expect(res.skipped).toBe(1); // the cancelled row
    expect(res.updated).toBe(2); // the other two still import
    expect(res.warnings.some((w) => /Ticket Status "Cancelled" is not Active/.test(w.message))).toBe(true);
    const gizelle = (await personRepo.findAll()).find((p) => p.firstName === 'Gizellea')!;
    expect(gizelle.accommodationKind).toBeNull(); // untouched — cancelled ticket never wrote it
  });

  it('the real Billing Contacts file attributes money to the RIGHT registrant via invoice number, even though the billing contact is a different-named parent', async () => {
    const { formSvc, ticketSvc, invoiceSvc, personRepo } = await build();
    await formSvc.importCsv(actor('admin'), { csvData: FORM_CSV });
    await ticketSvc.importTicketsCsv(actor('admin'), { csvData: TICKET_CSV });
    const res = await invoiceSvc.importInvoicesCsv(actor('admin'), { csvData: INVOICE_CSV });
    // All 3 real rows resolve via tier-1 invoiceNumber match (set by the Ticket List import
    // above) — the billing-contact-name fallback (tier 2) is never needed, which is exactly
    // right since "Jacquelinea Halesaa" (the billing contact) is NOT "Gizellea Halesaa" (the
    // registrant) and would otherwise risk a wrong/ambiguous name-only match.
    expect(res).toMatchObject({
      created: 0, updated: 3, skipped: 0, deleted: 0, ambiguousGroupInvoices: 0, errors: [],
    });
    expect(res.warnings.some((w) => /billing-contact name only/.test(w.message))).toBe(false);

    const people = await personRepo.findAll();
    const gizelle = people.find((p) => p.firstName === 'Gizellea')!;
    expect(gizelle.registrationCost).toBe(190);
    expect(gizelle.amountPaid).toBe(190);
    expect(gizelle.discountAmount).toBe(0);
    expect(gizelle.feesAmount).toBe(0);
    expect(gizelle.taxAmount).toBe(0);
    // accommodationKind was already 'confirmed' via Ticket List — Invoice must not touch it.
    expect(gizelle.accommodationKind).toBe('classroom');
    expect(gizelle.accommodationKindConfidence).toBe('confirmed');

    const isaiah = people.find((p) => p.firstName === 'Isaiaha')!;
    expect(isaiah.registrationCost).toBe(150);
    expect(isaiah.discountAmount).toBe(150); // ALIVE100 — fully discounted
    expect(isaiah.amountPaid).toBe(0);
    expect(isaiah.discountCode).toBe('ALIVE100');
  });

  it('full pipeline (Form -> Ticket -> Invoice) leaves all 3 real registrants fully reconciled with no orphans and nothing flagged for review', async () => {
    const { formSvc, ticketSvc, invoiceSvc, personRepo } = await build();
    await formSvc.importCsv(actor('admin'), { csvData: FORM_CSV });
    await ticketSvc.importTicketsCsv(actor('admin'), { csvData: TICKET_CSV });
    await invoiceSvc.importInvoicesCsv(actor('admin'), { csvData: INVOICE_CSV });

    const people = await personRepo.findAll();
    expect(people).toHaveLength(3);
    for (const p of people) {
      expect(p.needsReview).toBe(false);
      expect(p.accommodationKind).not.toBeNull();
      expect(p.accommodationKindConfidence).toBe('confirmed');
      expect(p.ticketNumber).not.toBeNull();
      expect(p.invoiceNumber).not.toBeNull();
      expect(p.registrationCost).not.toBeNull();
      expect(p.paymentStatus).toBe('paid');
      // grade/gender/medical (Form-owned) survive both later imports untouched.
      expect(p.gender).not.toBe('other'); // both real students/leader have a real Gender value
    }
  });
});
