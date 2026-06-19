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
    id: 'c1', name: 'Victory', zone: 'Yellow', code: 'VIC', selfRegisterSlug: 'victory',
    expectedCount: 0, reservations: [],
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
