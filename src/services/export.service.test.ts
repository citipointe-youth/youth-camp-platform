import { describe, it, expect, beforeEach } from 'vitest';
import { makeExportService } from './export.service';
import { makeImportService } from './import.service';
import { InMemoryPersonRepository, InMemoryChurchRepository } from '../repositories/in-memory';
import { parseCsv } from '../utils/csv';
import type { Church } from '../core/entities/church';
import type { Actor } from '../core/entities/user';

function actor(role: Actor['role']): Actor {
  return { id: 'u', role, churchId: null, churchName: null, zone: null, displayName: role };
}
function church(over: Partial<Church>): Church {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'c1', name: 'Victory', zone: 'Yellow', code: 'VIC', selfRegisterSlug: 'victory',
    expectedCount: 0, reservations: [],
    contacts: { male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } }, female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } } },
    createdAt: now, updatedAt: now, ...over,
  };
}
async function build() {
  const personRepo = new InMemoryPersonRepository();
  const churchRepo = new InMemoryChurchRepository();
  await personRepo.init();
  await churchRepo.init();
  await churchRepo.save(church({ id: 'c1', name: 'Victory' }));
  return { personRepo, churchRepo };
}

const HEADER =
  'Date Submitted,Submission Status,Person,Person Status,First Name,Last Name,Gender,Date of Birth,School Grade,Mobile Number,Email Address,Suburb,Postcode,State,Medicare Number,Medical Conditions,Dietary Requirements,List Other Medical Conditions or Medication Taken,Attendee\'s Church,"If from a church not listed, please specify church name & Youth Pastor",Blue Card/Working with Children Card Number,Blue Card/Working with Children Card Expiry,I give medical consent for my child as listed above.,I give photography and video consent for my child as listed above.,I understand and agree to the Supervision policy.,Parent/Guardian Name,Relation to Child,Parent/Guardian Phone Number,Today\'s Date';
const LIAM =
  '21/06/2026,Pending,"Est, Liam",Pending,Liam,Est,Male,30/09/2009,11,0402113441,liam@x.com,Carindale,4152,QLD,4148431533,"Anaphylaxis, Dairy Intolerance",No dairy no nuts,,Victory,,,,Yes,Yes,Yes,Penny Est,Mother,0413510011,21/06/2026';

describe('export.service', () => {
  let h: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => { h = await build(); });

  it('produces a header row + the filtered persons', async () => {
    const imp = makeImportService(h.personRepo, h.churchRepo);
    await imp.importCsv(actor('admin'), { csvData: `${HEADER}\n${LIAM}` });
    const exp = makeExportService(h.personRepo, h.churchRepo);
    const csv = await exp.exportRegistrants(actor('admin'), {});
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!['First Name']).toBe('Liam');
    expect(parsed[0]!['School Grade']).toBe('11');
    expect(parsed[0]!['Date of Birth']).toBe('30/09/2009');
    expect(parsed[0]!['Gender']).toBe('Male');
    expect(parsed[0]!["Attendee's Church"]).toBe('Victory');
    expect(parsed[0]!['Person']).toBe('Est, Liam');
    expect(parsed[0]!['Medical Conditions']).toBe('Anaphylaxis, Dairy Intolerance');
  });

  it('round-trips: import → export → re-import yields identical modelled fields', async () => {
    const imp = makeImportService(h.personRepo, h.churchRepo);
    await imp.importCsv(actor('admin'), { csvData: `${HEADER}\n${LIAM}` });
    const original = (await h.personRepo.findAll())[0]!;
    const exp = makeExportService(h.personRepo, h.churchRepo);
    const csv = await exp.exportRegistrants(actor('admin'), {});

    const fresh = await build();
    const imp2 = makeImportService(fresh.personRepo, fresh.churchRepo);
    await imp2.importCsv(actor('admin'), { csvData: csv });
    const reimported = (await fresh.personRepo.findAll())[0]!;

    const fields = ['firstName','lastName','gender','grade','kind','dateOfBirth','mobile','email','suburb','postcode','state','medicareNumber','medicalConditions','dietaryRequirements','otherMedications','blueCardNumber','blueCardExpiry','parentGuardianName','parentRelation','parentPhone'] as const;
    for (const f of fields) {
      expect(reimported[f]).toEqual(original[f]);
    }
    expect(reimported.consents.medical.granted).toBe(original.consents.medical.granted);

    // Byte-for-byte idempotence: exporting the re-imported data reproduces the same CSV.
    const exp2 = makeExportService(fresh.personRepo, fresh.churchRepo);
    const csv2 = await exp2.exportRegistrants(actor('admin'), {});
    expect(csv2).toBe(csv);
  });

  it('respects the gender filter', async () => {
    const exp = makeExportService(h.personRepo, h.churchRepo);
    const csv = await exp.exportRegistrants(actor('admin'), { gender: 'female' });
    expect(parseCsv(csv)).toHaveLength(0);
    expect(csv.split('\n')[0]).toContain('First Name'); // header still present
  });
});
