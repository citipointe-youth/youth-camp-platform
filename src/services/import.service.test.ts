import { describe, it, expect, beforeEach } from 'vitest';
import { makeImportService } from './import.service';
import { InMemoryPersonRepository, InMemoryChurchRepository } from '../repositories/in-memory';
import type { Church } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import { ForbiddenError, BadRequestError } from '../core/errors/app-error';

// ---------------------------------------------------------------------------
// ImportService tests — focus on the C1 fix: church/camper indexing, in-file
// dedup (last row wins), batched write, and correct created/updated/skipped counts.
// ---------------------------------------------------------------------------

function actor(role: Actor['role'], over: Partial<Actor> = {}): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role, ...over };
}

function church(over: Partial<Church>): Church {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'c1', name: 'Victory', zone: 'Yellow', reservations: [],
    contacts: { male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } }, female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } } },
    createdAt: now, updatedAt: now, ...over,
  };
}

async function build(churches: Church[] = [church({ id: 'c1', name: 'Victory' })]) {
  const personRepo = new InMemoryPersonRepository();
  const churchRepo = new InMemoryChurchRepository();
  await personRepo.init();
  await churchRepo.init();
  for (const c of churches) await churchRepo.save(c);
  const svc = makeImportService(personRepo, churchRepo);
  return { svc, personRepo, churchRepo };
}

describe('ImportService.importCsv — RBAC + validation', () => {
  it('forbids roles without import:run (church, zoneLeader)', async () => {
    const { svc } = await build();
    for (const role of ['church', 'zoneLeader'] as const) {
      await expect(svc.importCsv(actor(role), { csvData: 'First Name,Last Name\nA,B' })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it('throws BadRequest when there are no data rows', async () => {
    const { svc } = await build();
    await expect(svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name' })).rejects.toBeInstanceOf(BadRequestError);
  });
});

describe('ImportService.importCsv — create / counts', () => {
  let h: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => { h = await build(); });

  it('creates new campers and resolves churchId by church name', async () => {
    const csv = 'First Name,Last Name,Church,Zone,Grade\nAda,Lovelace,Victory,Yellow,9\nGrace,Hopper,Victory,Yellow,8';
    const res = await h.svc.importCsv(actor('admin'), { csvData: csv });
    expect(res).toMatchObject({ created: 2, updated: 0, skipped: 0 });
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.churchId === 'c1')).toBe(true);
  });

  it('records an error + skip for a row missing a name', async () => {
    const csv = 'First Name,Last Name,Church\nAda,,Victory\nGrace,Hopper,Victory';
    const res = await h.svc.importCsv(actor('admin'), { csvData: csv });
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.row).toBe(2);
  });

  it('C1: de-duplicates rows for the same person in one file (last row wins, one create)', async () => {
    const csv = 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9\nAda,Lovelace,Victory,11';
    const res = await h.svc.importCsv(actor('admin'), { csvData: csv });
    expect(res.created).toBe(1); // not 2 — same person de-duped
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.grade).toBe(11); // last row wins
  });
});

describe('ImportService.importCsv — same-name disambiguation by phone', () => {
  let h: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => { h = await build(); });

  it('creates TWO people with the same name in the same church when phones differ', async () => {
    const csv =
      'First Name,Last Name,Church,Mobile,Grade\n' +
      'Sam,Lee,Victory,0400 111 111,9\n' +
      'Sam,Lee,Victory,0400 222 222,11';
    const res = await h.svc.importCsv(actor('admin'), { csvData: csv });
    expect(res.created).toBe(2); // distinct phones => two distinct people
    expect((await h.personRepo.findAll())).toHaveLength(2);
  });

  it('treats same name + same church + same phone as ONE person (collapsed)', async () => {
    const csv =
      'First Name,Last Name,Church,Mobile,Grade\n' +
      'Sam,Lee,Victory,0400 111 111,9\n' +
      'Sam,Lee,Victory,0400111111,11'; // same digits, different formatting
    const res = await h.svc.importCsv(actor('admin'), { csvData: csv });
    expect(res.created).toBe(1);
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.grade).toBe(11);
  });

  it('a single existing person updates even when the re-import omits the phone', async () => {
    await h.svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name,Church,Mobile,Grade\nAda,Lovelace,Victory,0400 999 999,9' });
    const res = await h.svc.importCsv(actor('admin'), {
      csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12', // no Mobile column
      updateExisting: true,
    });
    expect(res).toMatchObject({ created: 0, updated: 1 });
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.grade).toBe(12);
  });

  it('updates the phone-matching existing twin (not the other) on re-import', async () => {
    await h.svc.importCsv(actor('admin'), {
      csvData:
        'First Name,Last Name,Church,Mobile,Grade\n' +
        'Sam,Lee,Victory,0400 111 111,9\n' +
        'Sam,Lee,Victory,0400 222 222,9',
    });
    const res = await h.svc.importCsv(actor('admin'), {
      csvData: 'First Name,Last Name,Church,Mobile,Grade\nSam,Lee,Victory,0400 222 222,12',
      updateExisting: true,
    });
    expect(res).toMatchObject({ created: 0, updated: 1 });
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(2);
    const twin1 = all.find((c) => (c.mobile ?? '').replace(/\D/g, '') === '0400111111');
    const twin2 = all.find((c) => (c.mobile ?? '').replace(/\D/g, '') === '0400222222');
    expect(twin1!.grade).toBe(9); // untouched
    expect(twin2!.grade).toBe(12); // the phone-matched twin updated
  });
});

describe('ImportService.importCsv — updateExisting', () => {
  it('skips an existing camper when updateExisting is false', async () => {
    const h = await build();
    await h.svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9' });
    const res = await h.svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12' });
    expect(res).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    const all = await h.personRepo.findAll();
    expect(all[0]!.grade).toBe(9); // unchanged
  });

  it('updates an existing camper when updateExisting is true', async () => {
    const h = await build();
    await h.svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9' });
    const res = await h.svc.importCsv(actor('admin'), { csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,12', updateExisting: true });
    expect(res).toMatchObject({ created: 0, updated: 1, skipped: 0 });
    const all = await h.personRepo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.grade).toBe(12);
  });
});

describe('ImportService.importCsv — dryRun', () => {
  it('dryRun:true returns counts but does NOT persist any persons', async () => {
    const { svc, personRepo } = await build();
    const res = await svc.importCsv(actor('admin'), {
      csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,Victory,9',
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
    expect(res.created).toBe(1);
    const all = await personRepo.findAll();
    expect(all).toHaveLength(0); // nothing written
  });

  it('dryRun:true flags unrecognised church names as phantomChurches with a warning', async () => {
    const { svc, churchRepo } = await build([]);
    const res = await svc.importCsv(actor('admin'), {
      csvData: 'First Name,Last Name,Church,Grade\nAda,Lovelace,New Church,9',
      dryRun: true,
    });
    expect(res.phantomChurches).toContain('New Church');
    expect(res.warnings.length).toBeGreaterThan(0);
    const churches = await churchRepo.findAll();
    expect(churches).toHaveLength(0); // not created in dry-run
  });

  it('dryRun result has dryRun:true in the returned object', async () => {
    const { svc } = await build();
    const res = await svc.importCsv(actor('admin'), {
      csvData: 'First Name,Last Name,Church\nAda,Lovelace,Victory',
      dryRun: true,
    });
    expect(res.dryRun).toBe(true);
  });
});

describe('ImportService.importCsv — Elvanto export shape', () => {
  const ELVANTO_HEADER =
    'Date Submitted,Submission Status,Person,Person Status,First Name,Last Name,Gender,Date of Birth,School Grade,Mobile Number,Email Address,Suburb,Postcode,State,Medicare Number,Medical Conditions,Dietary Requirements,List Other Medical Conditions or Medication Taken,Attendee\'s Church,"If from a church not listed, please specify church name & Youth Pastor",Blue Card/Working with Children Card Number,Blue Card/Working with Children Card Expiry,I give medical consent for my child as listed above.,I give photography and video consent for my child as listed above.,I understand and agree to the Supervision policy.,Parent/Guardian Name,Relation to Child,Parent/Guardian Phone Number,Today\'s Date';

  // Liam: youth, grade 11, medical list + dietary sentence, consents all Yes, known church.
  const LIAM =
    '21/06/2026,Pending,"Est, Liam",Pending,Liam,Est,Male,30/09/2009,11,0402113441,liam@x.com,Carindale,4152,QLD,4148431533,"Anaphylaxis, Dairy Intolerance, Egg Allergy, Nut Allergy",No dairy no eggs no nuts no fish no sesame,,Victory,,,,Yes,Yes,Yes,Penny Est,Mother,0413510011,21/06/2026';
  // Alelia: LEADER (18+ Leader), blank Person cell, church NOT in system, blue card, dietary blank.
  const ALELIA =
    '21/06/2026,Pending,,Pending,Alelia,Ino,Female,31/12/2006,18+ Leader,0434998611,ale@x.com,Woodhill,4285,QLD,4285242212,"Gluten Intolerance, Lactose Intolerance",,,Kingdom Hope Church,Josh Gazzard,2532285 / 2,30/04/2029,Yes,Yes,Yes,Nyree Ino,Mother,0481092411,21/06/2026';
  // Cooper: dietary "NA" (junk), multi-line Other meds. Quoted field spans two lines.
  const COOPER =
    '21/06/2026,Pending,"Haw, Cooper",Pending,Cooper,Haw,Male,24/03/2010,11,0499 259 222,coop@x.com,Morayfield,4506,Queensland,2582677511,,NA,"Ritalin\nFluexotine",Victory,,,,Yes,Yes,Yes,Tracy-Lee Ba,Mother,0448835711,21/06/2026';

  it('imports a youth with all fields normalized', async () => {
    const { svc, personRepo } = await build();
    const res = await svc.importCsv(actor('admin'), { csvData: `${ELVANTO_HEADER}\n${LIAM}` });
    expect(res.created).toBe(1);
    const p = (await personRepo.findAll())[0]!;
    expect(p.kind).toBe('youth');
    expect(p.grade).toBe(11);
    expect(p.dateOfBirth).toBe('2009-09-30');
    expect(p.gender).toBe('male');
    expect(p.churchId).toBe('c1');
    expect(p.suburb).toBe('Carindale');
    expect(p.postcode).toBe('4152');
    expect(p.state).toBe('QLD');
    expect(p.medicareNumber).toBe('4148431533');
    expect(p.medicalConditions).toEqual(['Anaphylaxis, Dairy Intolerance, Egg Allergy, Nut Allergy']);
    expect(p.dietaryRequirements).toEqual(['No dairy no eggs no nuts no fish no sesame']);
    expect(p.parentRelation).toBe('Mother');
    expect(p.parentPhone).toBe('0413510011');
    expect(p.consents.medical.granted).toBe(true);
    expect(p.consents.media.granted).toBe(true);
    expect(p.consents.supervision.granted).toBe(true);
  });

  it('detects a leader and auto-creates an unknown church', async () => {
    const { svc, personRepo, churchRepo } = await build();
    const res = await svc.importCsv(actor('admin'), { csvData: `${ELVANTO_HEADER}\n${ALELIA}` });
    expect(res.created).toBe(1);
    expect(res.churchesCreated).toContain('Kingdom Hope Church');
    expect(res.warnings.length).toBeGreaterThan(0);
    const p = (await personRepo.findAll())[0]!;
    expect(p.kind).toBe('leader');
    expect(p.grade).toBeNull();
    expect(p.blueCardNumber).toBe('2532285 / 2');
    expect(p.blueCardExpiry).toBe('2029-04-30');
    expect(p.churchUnlistedNote).toBe('Josh Gazzard');
    const created = await churchRepo.findAll();
    const kh = created.find((c) => c.name === 'Kingdom Hope Church')!;
    expect(kh).toBeTruthy();
    expect(p.churchId).toBe(kh.id);
    // The "unlisted church / youth pastor" free-text note is preserved on the PERSON
    // (asserted above); the auto-created church no longer stores a youth-pastor field.
  });

  it('strips junk dietary and preserves multi-line medication text', async () => {
    const { svc, personRepo } = await build();
    await svc.importCsv(actor('admin'), { csvData: `${ELVANTO_HEADER}\n${COOPER}` });
    const p = (await personRepo.findAll())[0]!;
    expect(p.dietaryRequirements).toEqual([]); // "NA" → empty
    expect(p.medicalConditions).toEqual([]);   // blank
    expect(p.otherMedications).toBe('Ritalin\nFluexotine');
    expect(p.mobile).toBe('0499 259 222');
  });
});
