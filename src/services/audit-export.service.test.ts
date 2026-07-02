import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { makeAuditExportService } from './audit-export.service';
import { makeNoteService } from './note.service';
import {
  InMemoryNoteRepository,
  InMemoryPersonRepository,
  InMemorySettingsRepository,
} from '../repositories/in-memory';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';

// ---------------------------------------------------------------------------
// audit-export.service — regression coverage.
//   * Bug 7 (2026-07-02): the 'Sign-in/Sign-out Log' worksheet name contained a
//     '/', which ExcelJS forbids → addWorksheet threw and the whole download 500'd
//     on EVERY call. This proves the workbook now builds end-to-end.
//   * Bug 9 (2026-07-02): first-aid records must land in their own 'First-Aid
//     Records' sheet with the 4-line body parsed into columns, and must NOT also
//     appear in 'Notes & Testimonies'.
// ---------------------------------------------------------------------------

function person(over: Partial<Person> = {}): Person {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'cam1', firstName: 'Ada', lastName: 'Lovelace', gender: 'female', kind: 'youth',
    churchId: 'c1', churchName: 'Victory', zone: 'Yellow',
    medicalConditions: [], dietaryRequirements: [],
    consents: {
      medical: { granted: false, timestamp: null },
      media: { granted: false, timestamp: null },
      supervision: { granted: false, timestamp: null },
    },
    paymentStatus: 'unpaid', needsReview: false, lifecycle: 'arrived', atCamp: true,
    checkInHistory: [], signOutHistory: [], createdAt: now, updatedAt: now, ...over,
  };
}

const actor: Actor = { id: 'u', role: 'admin', churchId: null, churchName: null, zone: null, displayName: 'Admin' };

let people: InMemoryPersonRepository;
let notes: InMemoryNoteRepository;
let settings: InMemorySettingsRepository;
let svc: ReturnType<typeof makeAuditExportService>;

beforeEach(async () => {
  people = new InMemoryPersonRepository();
  notes = new InMemoryNoteRepository();
  settings = new InMemorySettingsRepository();
  await people.init(); await notes.init(); await settings.init();
  await people.save(person());
  const noteSvc = makeNoteService(notes, people);
  await noteSvc.add(actor, {
    camperId: 'cam1', category: 'firstaid',
    body: 'Problem: Sprained ankle\nTreatment: Ice + rest\nFirst-aider: Jo\nBrought by: Sam',
  });
  await noteSvc.add(actor, { camperId: 'cam1', category: 'testimony', body: 'Great week' });
  svc = makeAuditExportService(people, notes, settings);
});

async function load(): Promise<ExcelJS.Workbook> {
  const buf = await svc.exportMasterWorkbook(actor);
  const wb = new ExcelJS.Workbook();
  // ExcelJS's load() Buffer generic is stricter than Node's Buffer type here; the bytes are fine.
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe('audit-export: master workbook', () => {
  it('builds without throwing and no sheet name contains an illegal character (bug 7)', async () => {
    const wb = await load();
    const illegal = /[*?:\\/[\]]/;
    for (const ws of wb.worksheets) expect(ws.name).not.toMatch(illegal);
    expect(wb.getWorksheet('Sign-in & Sign-out Log')).toBeTruthy();
  });

  it('has a dedicated First-Aid Records sheet with the body parsed into columns (bug 9)', async () => {
    const wb = await load();
    const fa = wb.getWorksheet('First-Aid Records');
    expect(fa).toBeTruthy();
    const header = (fa!.getRow(1).values as unknown[]).map((v) => String(v ?? ''));
    expect(header).toContain('Problem');
    expect(header).toContain('First-aider');
    const row = fa!.getRow(2).values as unknown[];
    const cells = row.map((v) => String(v ?? ''));
    expect(cells).toContain('Sprained ankle');
    expect(cells).toContain('Ice + rest');
    expect(cells).toContain('Jo');
    expect(cells).toContain('Sam');
  });

  it('does NOT duplicate first-aid records into Notes & Testimonies (bug 9)', async () => {
    const wb = await load();
    const ns = wb.getWorksheet('Notes & Testimonies')!;
    const bodies: string[] = [];
    ns.eachRow((r) => bodies.push((r.values as unknown[]).map((v) => String(v ?? '')).join('|')));
    expect(bodies.some((b) => b.includes('Sprained ankle'))).toBe(false); // first-aid excluded
    expect(bodies.some((b) => b.includes('Great week'))).toBe(true); // testimony still present
  });
});
