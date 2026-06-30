# Elvanto Import Fix + Data Table & Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CSV import correctly ingest the real Elvanto registration export, persist all previously-dropped fields, auto-create unknown churches, and add a director/admin **Data** tab with a filterable table and a round-trip CSV export.

**Architecture:** A pure `elvanto-mapping.ts` module owns header aliases + value normalizers, shared by a rewritten `import.service.ts` and a new `export.service.ts`. The `Person` entity gains two fields. A new controller + route exposes export; the SPA gains a `data` screen/tab.

**Tech Stack:** TypeScript (strict, ESM, `moduleResolution: Bundler`, extensionless imports), Express, Zod, Vitest. Vanilla-JS SPA in `public/index.html`.

## Global Constraints

- Extensionless ESM imports; each folder has an `index.ts` barrel.
- Strict TS: `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` — guard all indexed access.
- RBAC only via `assertCan(actor, perm)` from `src/services/access-control.ts`. Export is gated `import:run` (same as import).
- Validation with Zod inside services, not controllers.
- Backend returns results **bare** (`res.json(result)`); the CSV export route returns a bare string (like `/notes/export`).
- `medicalConditions`/`dietaryRequirements` stay `string[]`; store care text as a single verbatim element.
- Care-text junk placeholders (whole-value, case-insensitive): `na`, `n/a`, `no`, `none`, `nil`, `-`, `.` → empty.
- Leader marker: School Grade containing `leader` or `18+` (case-insensitive).
- Default zone for auto-created churches: `Yellow` (surface as a warning).
- The 29 Elvanto headers, in order, are the canonical export columns.
- Verify with `npm run typecheck` and `npm run test` (both run — `node_modules` is present).
- Commit messages end with the repo's Co-Authored-By/Claude-Session trailers (see existing history).

---

### Task 1: `elvanto-mapping.ts` — pure header/value mapping

**Files:**
- Create: `src/services/elvanto-mapping.ts`
- Test: `src/services/elvanto-mapping.test.ts`

**Interfaces:**
- Produces:
  - `ELVANTO_HEADERS: readonly string[]` (29 entries, canonical order)
  - `cleanCareText(raw?: string | null): string`
  - `normalizeDate(raw?: string | null): string | null` — `DD/MM/YYYY`→`YYYY-MM-DD`; ISO passes through; else `null`
  - `formatDateAU(iso?: string | null): string` — `YYYY-MM-DD`→`DD/MM/YYYY`; else pass through
  - `parseGradeOrLeader(raw?: string | null): { kind: 'youth' | 'leader'; grade: Grade | null }`
  - `yesToConsent(raw?: string | null): boolean`
  - `field(row: Record<string,string>, ...aliases: string[]): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/elvanto-mapping.test.ts
import { describe, it, expect } from 'vitest';
import {
  ELVANTO_HEADERS, cleanCareText, normalizeDate, formatDateAU,
  parseGradeOrLeader, yesToConsent, field,
} from './elvanto-mapping';

describe('elvanto-mapping', () => {
  it('has 29 canonical headers starting with Date Submitted and ending with Today\'s Date', () => {
    expect(ELVANTO_HEADERS).toHaveLength(29);
    expect(ELVANTO_HEADERS[0]).toBe('Date Submitted');
    expect(ELVANTO_HEADERS[28]).toBe("Today's Date");
    expect(ELVANTO_HEADERS).toContain('Medical Conditions');
  });

  it('strips whole-value junk but keeps real care text', () => {
    expect(cleanCareText('NA')).toBe('');
    expect(cleanCareText('  no ')).toBe('');
    expect(cleanCareText('-')).toBe('');
    expect(cleanCareText('No dairy no eggs no nuts')).toBe('No dairy no eggs no nuts');
    expect(cleanCareText('Ritalin\nFluexotine')).toBe('Ritalin\nFluexotine');
  });

  it('normalizes DD/MM/YYYY to ISO and round-trips back to AU', () => {
    expect(normalizeDate('30/09/2009')).toBe('2009-09-30');
    expect(normalizeDate('2009-09-30')).toBe('2009-09-30');
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate('rubbish')).toBeNull();
    expect(formatDateAU('2009-09-30')).toBe('30/09/2009');
    expect(formatDateAU('')).toBe('');
  });

  it('detects leaders and youth grades', () => {
    expect(parseGradeOrLeader('18+ Leader')).toEqual({ kind: 'leader', grade: null });
    expect(parseGradeOrLeader('Leader')).toEqual({ kind: 'leader', grade: null });
    expect(parseGradeOrLeader('11')).toEqual({ kind: 'youth', grade: 11 });
    expect(parseGradeOrLeader('')).toEqual({ kind: 'youth', grade: null });
    expect(parseGradeOrLeader('Kindy')).toEqual({ kind: 'youth', grade: null });
  });

  it('parses consent + resolves aliases', () => {
    expect(yesToConsent('Yes')).toBe(true);
    expect(yesToConsent('no')).toBe(false);
    const row = { 'First Name': 'Ada', firstName: '' };
    expect(field(row, 'First Name', 'firstName')).toBe('Ada');
    expect(field(row, 'firstName', 'First Name')).toBe('Ada');
    expect(field(row, 'Missing')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- elvanto-mapping`
Expected: FAIL — `Cannot find module './elvanto-mapping'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/services/elvanto-mapping.ts
import type { Grade } from '../core/types/enums';

/** The canonical 29 Elvanto export columns, in order. */
export const ELVANTO_HEADERS = [
  'Date Submitted',
  'Submission Status',
  'Person',
  'Person Status',
  'First Name',
  'Last Name',
  'Gender',
  'Date of Birth',
  'School Grade',
  'Mobile Number',
  'Email Address',
  'Suburb',
  'Postcode',
  'State',
  'Medicare Number',
  'Medical Conditions',
  'Dietary Requirements',
  'List Other Medical Conditions or Medication Taken',
  "Attendee's Church",
  'If from a church not listed, please specify church name & Youth Pastor',
  'Blue Card/Working with Children Card Number',
  'Blue Card/Working with Children Card Expiry',
  'I give medical consent for my child as listed above.',
  'I give photography and video consent for my child as listed above.',
  'I understand and agree to the Supervision policy.',
  'Parent/Guardian Name',
  'Relation to Child',
  'Parent/Guardian Phone Number',
  "Today's Date",
] as const;

const JUNK = new Set(['', 'na', 'n/a', 'no', 'none', 'nil', '-', '.']);

/** Care-text columns: preserve verbatim, but treat whole-value placeholders as empty. */
export function cleanCareText(raw?: string | null): string {
  const v = (raw ?? '').trim();
  return JUNK.has(v.toLowerCase()) ? '' : v;
}

/** DD/MM/YYYY (or D/M/YYYY, '/' or '-') → ISO; ISO passes through; else null. */
export function normalizeDate(raw?: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (isoMatch) return v;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (!m) return null;
  const dd = (m[1] ?? '').padStart(2, '0');
  const mm = (m[2] ?? '').padStart(2, '0');
  const yyyy = m[3] ?? '';
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO → DD/MM/YYYY for export; anything not ISO passes through unchanged. */
export function formatDateAU(iso?: string | null): string {
  const v = (iso ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const YOUTH_GRADES: readonly number[] = [7, 8, 9, 10, 11, 12];

/** School Grade → kind + grade. 'leader'/'18+' ⇒ leader; numeric 7–12 ⇒ that grade. */
export function parseGradeOrLeader(raw?: string | null): { kind: 'youth' | 'leader'; grade: Grade | null } {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.includes('leader') || v.includes('18+')) return { kind: 'leader', grade: null };
  const n = parseInt(v, 10);
  if (YOUTH_GRADES.includes(n)) return { kind: 'youth', grade: n as Grade };
  return { kind: 'youth', grade: null };
}

export function yesToConsent(raw?: string | null): boolean {
  return (raw ?? '').trim().toLowerCase() === 'yes';
}

/** First non-empty value among the given header aliases (values are pre-trimmed by parseCsv). */
export function field(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (v != null && v.trim() !== '') return v.trim();
  }
  return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- elvanto-mapping`
Expected: PASS (5 tests).

- [ ] **Step 5: Add to the services barrel and typecheck**

Add to `src/services/index.ts` (follow the existing export style there):

```ts
export * from './elvanto-mapping';
```

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/elvanto-mapping.ts src/services/elvanto-mapping.test.ts src/services/index.ts
git commit -m "feat: add elvanto-mapping (headers + value normalizers)"
```

---

### Task 2: `Person` entity — add `medicareNumber`, `churchUnlistedNote`, `elvantoMeta`

`elvantoMeta` holds the 5 Elvanto submission-metadata columns verbatim (Date Submitted,
Submission Status, the raw Person cell, Person Status, Today's Date) so an export round-trips
**byte-for-byte** for unmodified data — the only diffs that appear are the deliberate cleanups
(e.g. `NA`→blank). App-created people have `elvantoMeta: null` (export reconstructs `Person` =
`Last, First` and leaves the 4 metadata columns blank for them).

**Files:**
- Modify: `src/core/entities/person.ts` (the `// ----- contact + care -----` block + a new `ElvantoMeta` interface)
- Modify: `src/services/person.service.ts:203` (create-path Person literal)
- Modify: `src/repositories/supabase/supabase.people.ts:73` (row→Person) and `:261` (Person→row)

**Interfaces:**
- Produces:
  - `Person.medicareNumber?: string | null`, `Person.churchUnlistedNote?: string | null`
  - `ElvantoMeta = { dateSubmitted: string|null; submissionStatus: string|null; person: string|null; personStatus: string|null; todaysDate: string|null }`
  - `Person.elvantoMeta?: ElvantoMeta | null`

- [ ] **Step 1: Add the fields + interface to the entity**

In `src/core/entities/person.ts`, add the interface near the top (after the existing
`SignOutEvent` interface):

```ts
/** Raw Elvanto submission-metadata columns, kept verbatim for byte-for-byte export round-trip. */
export interface ElvantoMeta {
  dateSubmitted: string | null;
  submissionStatus: string | null;
  person: string | null;
  personStatus: string | null;
  todaysDate: string | null;
}
```

Inside the `contact + care` group (after `otherMedications?: string | null;`):

```ts
  medicareNumber?: string | null;
  churchUnlistedNote?: string | null;
```

And in the bottom metadata group (just before `createdAt: ISODateString;`):

```ts
  elvantoMeta?: ElvantoMeta | null;
```

- [ ] **Step 2: Default them where Person is constructed**

In `src/services/person.service.ts`, in the create literal next to `otherMedications: null,` add:

```ts
        medicareNumber: null,
        churchUnlistedNote: null,
        elvantoMeta: null,
```

In `src/repositories/supabase/supabase.people.ts`, in the row→Person mapper next to `otherMedications: ...` add:

```ts
    medicareNumber: (row['medicare_number'] as string | null) ?? null,
    churchUnlistedNote: (row['church_unlisted_note'] as string | null) ?? null,
    elvantoMeta: (row['elvanto_meta'] as import('../../core/entities/person').ElvantoMeta | null) ?? null,
```

and in the Person→row mapper next to `other_medications: ...` add:

```ts
    medicare_number: p.medicareNumber ?? null,
    church_unlisted_note: p.churchUnlistedNote ?? null,
    elvanto_meta: p.elvantoMeta ?? null,
```

> If the supabase mapper file already imports the `Person` type, reuse that import for
> `ElvantoMeta` instead of the inline `import('...')` form.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors (fields are optional; import.service still compiles).

- [ ] **Step 4: Commit**

```bash
git add src/core/entities/person.ts src/services/person.service.ts src/repositories/supabase/supabase.people.ts
git commit -m "feat: add medicareNumber, churchUnlistedNote, elvantoMeta to Person"
```

---

### Task 3: Rewrite `import.service.ts` to ingest the Elvanto export

**Files:**
- Modify: `src/services/import.service.ts` (full rewrite of field reading + church auto-create + consents + result shape; keep the existing match/dedup/batch machinery)
- Modify: `src/services/import.service.test.ts` (add Elvanto-shape tests)

**Interfaces:**
- Consumes: `elvanto-mapping` (Task 1), `Person.medicareNumber`/`churchUnlistedNote` (Task 2), `churchRepo.save`, `newId`.
- Produces: `ImportResult` now also has `churchesCreated: string[]` and `warnings: Array<{ row: number; message: string }>`.

- [ ] **Step 1: Write the failing tests** (append to `src/services/import.service.test.ts`)

```ts
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
    expect(kh.youthPastorName).toBe('Josh Gazzard');
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- import.service`
Expected: FAIL — `churchesCreated`/`warnings` undefined; fields null/unset.

- [ ] **Step 3: Rewrite `src/services/import.service.ts`**

Replace the whole file with:

```ts
import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Church } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import type { ConsentType } from '../core/types/enums';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  cleanCareText, field, normalizeDate, parseGradeOrLeader, yesToConsent,
} from './elvanto-mapping';
import { z } from 'zod';

const ImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  churchId: z.string().optional(),
  defaultZone: z.string().optional(),
  updateExisting: z.boolean().optional().default(false),
});

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  churchesCreated: string[];
}

export interface ImportService {
  importCsv(actor: Actor, input: unknown): Promise<ImportResult>;
}

function parseGender(val: string): Person['gender'] {
  const v = val.toLowerCase().trim();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}

function slugCode(name: string, taken: Set<string>): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'CHURCH';
  let code = base;
  let n = 1;
  while (taken.has(code)) code = `${base}${n++}`.slice(0, 10);
  taken.add(code);
  return code;
}

export function makeImportService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): ImportService {
  return {
    async importCsv(actor, input) {
      assertCan(actor, 'import:run');
      const opts = ImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: ImportResult['errors'] = [];
      const warnings: ImportResult['warnings'] = [];
      const churchesCreated: string[] = [];

      const churches = await churchRepo.findAll();
      const churchIdByName = new Map<string, string>();
      for (const c of churches) churchIdByName.set(c.name.toLowerCase(), c.id);
      const takenCodes = new Set<string>(churches.map((c) => c.code));
      const newlyCreated = new Map<string, string>(); // lowercased name -> id

      const allPersons = await personRepo.findAll();
      const nameChurchKey = (churchId: string, first: string, last: string): string =>
        `${churchId}::${first.toLowerCase()}::${last.toLowerCase()}`;
      const phoneKey = (mobile: string | null | undefined): string =>
        (mobile ?? '').replace(/\D/g, '');
      const poolByNameChurch = new Map<string, Person[]>();
      for (const p of allPersons) {
        const k = nameChurchKey(p.churchId, p.firstName, p.lastName);
        const pool = poolByNameChurch.get(k);
        if (pool) pool.push(p);
        else poolByNameChurch.set(k, [p]);
      }

      function pickMatch(pool: Person[] | undefined, phone: string): Person | undefined {
        if (!pool || pool.length === 0) return undefined;
        if (phone) {
          const byPhone = pool.find((p) => phoneKey(p.mobile) === phone);
          if (byPhone) return byPhone;
          if (pool.length === 1 && !phoneKey(pool[0]!.mobile)) return pool[0];
          return undefined;
        }
        return pool.length === 1 ? pool[0] : undefined;
      }

      // Resolve a church name to an id, auto-creating a minimal church on miss.
      async function resolveChurch(name: string, youthPastor: string, rowNum: number, createdAt: string): Promise<string> {
        if (!name) return '';
        const key = name.toLowerCase();
        const existing = churchIdByName.get(key) ?? newlyCreated.get(key);
        if (existing) return existing;
        const id = newId('church');
        const code = slugCode(name, takenCodes);
        const church: Church = {
          id,
          name,
          zone: 'Yellow',
          code,
          selfRegisterSlug: code.toLowerCase(),
          expectedCount: 0,
          ...(youthPastor ? { youthPastorName: youthPastor } : {}),
          reservations: [],
          contacts: {
            male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
            female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
          },
          createdAt,
          updatedAt: createdAt,
        };
        await churchRepo.save(church);
        newlyCreated.set(key, id);
        churchesCreated.push(name);
        warnings.push({ row: rowNum, message: `Church "${name}" not found — created (zone defaulted to Yellow)` });
        return id;
      }

      function buildConsents(med: boolean, media: boolean, sup: boolean, ts: string): Person['consents'] {
        const mk = (granted: boolean) => ({ granted, timestamp: granted ? ts : null });
        return { medical: mk(med), media: mk(media), supervision: mk(sup) } as Record<
          ConsentType,
          { granted: boolean; timestamp: string | null }
        >;
      }

      const touched = new Map<string, Person>();
      const createdIds = new Set<string>();

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

          const now = nowISO();

          const churchName = field(row, "Attendee's Church", 'churchName', 'church_name', 'Church');
          const churchUnlistedNote =
            field(row, 'If from a church not listed, please specify church name & Youth Pastor') || null;
          const explicitChurchId = field(row, 'churchId', 'church_id') || opts.churchId || '';
          const resolvedChurchId = explicitChurchId
            ? explicitChurchId
            : await resolveChurch(churchName, churchUnlistedNote ?? '', rowNum, now);

          const gender = parseGender(field(row, 'Gender', 'gender') || 'other');
          const gradeRaw = field(row, 'School Grade', 'grade', 'Grade');
          const { kind, grade } = parseGradeOrLeader(gradeRaw);
          if (gradeRaw && grade === null && kind === 'youth') {
            warnings.push({ row: rowNum, message: `Unrecognized School Grade "${gradeRaw}" — grade left blank` });
          }

          const dob = normalizeDate(field(row, 'Date of Birth', 'dateOfBirth', 'dob', 'DOB'));
          const mobile = field(row, 'Mobile Number', 'mobile', 'Mobile') || null;
          const email = field(row, 'Email Address', 'email', 'Email') || null;
          const suburb = field(row, 'Suburb', 'suburb') || null;
          const postcode = field(row, 'Postcode', 'postcode') || null;
          const state = field(row, 'State', 'state') || null;
          const medicareNumber = field(row, 'Medicare Number') || null;
          const medical = cleanCareText(field(row, 'Medical Conditions', 'medical', 'Medical'));
          const dietary = cleanCareText(field(row, 'Dietary Requirements', 'dietary', 'Dietary'));
          const otherMedications =
            cleanCareText(field(row, 'List Other Medical Conditions or Medication Taken')) || null;
          const blueCardNumber = field(row, 'Blue Card/Working with Children Card Number') || null;
          const blueCardExpiry = normalizeDate(field(row, 'Blue Card/Working with Children Card Expiry'));
          const parentName = field(row, 'Parent/Guardian Name', 'parentGuardianName', 'parent_name', 'Parent') || null;
          const parentRelation = field(row, 'Relation to Child', 'parentRelation') || null;
          const parentPhone = field(row, 'Parent/Guardian Phone Number', 'parentPhone', 'parent_phone') || null;
          const zone = field(row, 'zone', 'Zone') || opts.defaultZone || '';

          // Verbatim submission metadata (kept for byte-for-byte export round-trip).
          const raw = (h: string): string => (row[h] ?? '').trim();
          const elvantoMeta = {
            dateSubmitted: raw('Date Submitted'),
            submissionStatus: raw('Submission Status'),
            person: raw('Person'),
            personStatus: raw('Person Status'),
            todaysDate: raw("Today's Date"),
          };

          const submitted = normalizeDate(field(row, 'Date Submitted'));
          const consentTs = submitted ? `${submitted}T00:00:00.000Z` : now;
          const consents = buildConsents(
            yesToConsent(field(row, 'I give medical consent for my child as listed above.')),
            yesToConsent(field(row, 'I give photography and video consent for my child as listed above.')),
            yesToConsent(field(row, 'I understand and agree to the Supervision policy.')),
            consentTs,
          );

          const nck = nameChurchKey(resolvedChurchId, firstName, lastName);
          const rowPhone = phoneKey(mobile);
          const pool = poolByNameChurch.get(nck);
          const match = pickMatch(pool, rowPhone);
          const isExisting = match !== undefined && !createdIds.has(match.id);

          if (match && isExisting && !opts.updateExisting) {
            skipped++;
          } else if (match) {
            const merged: Person = {
              ...match,
              firstName,
              lastName,
              gender,
              grade,
              dateOfBirth: dob,
              mobile,
              email,
              suburb,
              postcode,
              state,
              medicareNumber,
              zone: zone || match.zone,
              kind,
              medicalConditions: medical ? [medical] : match.medicalConditions,
              dietaryRequirements: dietary ? [dietary] : match.dietaryRequirements,
              otherMedications: otherMedications ?? match.otherMedications,
              blueCardNumber: blueCardNumber ?? match.blueCardNumber,
              blueCardExpiry: blueCardExpiry ?? match.blueCardExpiry,
              churchUnlistedNote: churchUnlistedNote ?? match.churchUnlistedNote,
              elvantoMeta,
              consents,
              parentGuardianName: parentName ?? match.parentGuardianName,
              parentRelation: parentRelation ?? match.parentRelation,
              parentPhone: parentPhone ?? match.parentPhone,
              updatedAt: now,
            };
            if (pool) {
              const idx = pool.indexOf(match);
              if (idx >= 0) pool[idx] = merged;
            }
            const firstTouch = !touched.has(merged.id);
            touched.set(merged.id, merged);
            if (isExisting && firstTouch) updated++;
          } else {
            const person: Person = {
              id: newId('person'),
              firstName,
              lastName,
              gender,
              dateOfBirth: dob,
              grade,
              school: field(row, 'school') || null,
              zone,
              groupId: null,
              kind,
              mobile,
              email,
              suburb,
              postcode,
              state,
              medicalConditions: medical ? [medical] : [],
              dietaryRequirements: dietary ? [dietary] : [],
              otherMedications,
              medicareNumber,
              churchUnlistedNote,
              elvantoMeta,
              consents,
              parentGuardianName: parentName,
              parentPhone,
              parentRelation,
              blueCardNumber,
              blueCardExpiry,
              churchId: resolvedChurchId,
              churchName: churchName || resolvedChurchId,
              paymentStatus: 'unpaid',
              accommodationKind: null,
              accommodationLabel: null,
              lifecycle: 'registered',
              atCamp: false,
              checkInHistory: [],
              signOutHistory: [],
              createdAt: now,
              updatedAt: now,
            };
            touched.set(person.id, person);
            createdIds.add(person.id);
            const p = poolByNameChurch.get(nck);
            if (p) p.push(person);
            else poolByNameChurch.set(nck, [person]);
            created++;
          }
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
          skipped++;
        }
      }

      if (touched.size > 0) await personRepo.saveMany([...touched.values()]);

      return { created, updated, skipped, errors, warnings, churchesCreated };
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- import.service`
Expected: PASS — new Elvanto tests + all existing import tests (the legacy `Church`/`Grade` aliases still resolve, and a known church name still matches `c1`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/import.service.ts src/services/import.service.test.ts
git commit -m "feat: import the real Elvanto export (headers, dates, leaders, churches, consents)"
```

---

### Task 4: `export.service.ts` — Person → Elvanto CSV + round-trip

**Files:**
- Create: `src/services/export.service.ts`
- Test: `src/services/export.service.test.ts`

**Interfaces:**
- Consumes: `ELVANTO_HEADERS`, `formatDateAU` (Task 1); `toCsvString` from `../utils/csv`; `Person`, `Church`, `Actor`; `IPersonRepository`, `IChurchRepository`; `assertCan`.
- Produces:
  - `personToElvantoRow(p: Person, churchName: string): string[]`
  - `ExportFilters = { churchId?: string; gender?: string; kind?: string; grade?: string }`
  - `makeExportService(personRepo, churchRepo): { exportRegistrants(actor, filters): Promise<string> }`

- [ ] **Step 1: Write the failing test**

```ts
// src/services/export.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeExportService, personToElvantoRow } from './export.service';
import { makeImportService } from './import.service';
import { InMemoryPersonRepository, InMemoryChurchRepository } from '../repositories/in-memory';
import { ELVANTO_HEADERS } from './elvanto-mapping';
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- export.service`
Expected: FAIL — `Cannot find module './export.service'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/services/export.service.ts
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import { assertCan } from './access-control';
import { toCsvString } from '../utils/csv';
import { ELVANTO_HEADERS, formatDateAU } from './elvanto-mapping';

export interface ExportFilters {
  churchId?: string;
  gender?: string;
  kind?: string;
  grade?: string;
}

export function personToElvantoRow(p: Person, churchName: string): string[] {
  const consent = (t: 'medical' | 'media' | 'supervision'): string =>
    p.consents[t]?.granted ? 'Yes' : '';
  const gradeText = p.kind === 'leader' ? '18+ Leader' : p.grade != null ? String(p.grade) : '';
  const genderText = p.gender === 'male' ? 'Male' : p.gender === 'female' ? 'Female' : '';
  const meta = p.elvantoMeta ?? null;
  // Imported people reproduce the source metadata verbatim (incl. an originally-blank Person
  // cell); app-created people (no meta) reconstruct Person and leave metadata blank.
  const personCell = meta ? meta.person ?? '' : `${p.lastName}, ${p.firstName}`;
  return [
    meta?.dateSubmitted ?? '', // Date Submitted
    meta?.submissionStatus ?? '', // Submission Status
    personCell, // Person
    meta?.personStatus ?? '', // Person Status
    p.firstName,
    p.lastName,
    genderText,
    formatDateAU(p.dateOfBirth ?? ''),
    gradeText,
    p.mobile ?? '',
    p.email ?? '',
    p.suburb ?? '',
    p.postcode ?? '',
    p.state ?? '',
    p.medicareNumber ?? '',
    p.medicalConditions.join(', '),
    p.dietaryRequirements.join(', '),
    p.otherMedications ?? '',
    churchName,
    p.churchUnlistedNote ?? '',
    p.blueCardNumber ?? '',
    formatDateAU(p.blueCardExpiry ?? ''),
    consent('medical'),
    consent('media'),
    consent('supervision'),
    p.parentGuardianName ?? '',
    p.parentRelation ?? '',
    p.parentPhone ?? '',
    meta?.todaysDate ?? '', // Today's Date
  ];
}

export interface ExportService {
  exportRegistrants(actor: Actor, filters: ExportFilters): Promise<string>;
}

export function makeExportService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): ExportService {
  return {
    async exportRegistrants(actor, filters) {
      assertCan(actor, 'import:run');
      const [persons, churches] = await Promise.all([personRepo.findAll(), churchRepo.findAll()]);
      const nameById = new Map(churches.map((c) => [c.id, c.name] as const));
      const rows = persons
        .filter((p) => !filters.churchId || p.churchId === filters.churchId)
        .filter((p) => !filters.gender || p.gender === filters.gender)
        .filter((p) => !filters.kind || p.kind === filters.kind)
        .filter((p) => !filters.grade || String(p.grade ?? '') === filters.grade)
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))
        .map((p) => personToElvantoRow(p, nameById.get(p.churchId) ?? p.churchName));
      return toCsvString([...ELVANTO_HEADERS], rows);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- export.service`
Expected: PASS (3 tests).

- [ ] **Step 5: Add to the services barrel + typecheck**

Add to `src/services/index.ts`:

```ts
export * from './export.service';
```

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/services/export.service.ts src/services/export.service.test.ts src/services/index.ts
git commit -m "feat: add export.service (Person → Elvanto CSV) + round-trip test"
```

---

### Task 5: Wire export into the container, controller, route, and DTO

**Files:**
- Modify: `src/container.ts` (interface `Services` ~line 108; both composition sites ~line 167/176-178 and ~line 270/296-304)
- Create: `src/api/controllers/export.controller.ts`
- Modify: `src/api/controllers/index.ts` (barrel)
- Modify: `src/api/http/router.ts` (instantiate controller + add route)
- Modify: `src/api/dto/person.dto.ts` (surface new/dropped fields on `RegistrantDto`)

**Interfaces:**
- Consumes: `makeExportService`, `ExportService` (Task 4).
- Produces: `services.exportService`; `GET /export/registrants` returning a bare CSV string; `RegistrantDto` with `dateOfBirth/email/suburb/postcode/state/otherMedications/medicareNumber/churchUnlistedNote/parentRelation` plus `consentMedical/consentMedia/consentSupervision` booleans.

- [ ] **Step 1: Surface the fields on `RegistrantDto`** (so the SPA table can show them)

In `src/api/dto/person.dto.ts`, add to the `RegistrantDto` interface (after `dietaryRequirements: string[];`):

```ts
  email: string | null;
  dateOfBirth: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  otherMedications: string | null;
  medicareNumber: string | null;
  churchUnlistedNote: string | null;
  parentRelation: string | null;
  consentMedical: boolean;
  consentMedia: boolean;
  consentSupervision: boolean;
```

and in `toRegistrantDto`, before `createdAt: p.createdAt,`:

```ts
    email: p.email ?? null,
    dateOfBirth: p.dateOfBirth ?? null,
    suburb: p.suburb ?? null,
    postcode: p.postcode ?? null,
    state: p.state ?? null,
    otherMedications: p.otherMedications ?? null,
    medicareNumber: p.medicareNumber ?? null,
    churchUnlistedNote: p.churchUnlistedNote ?? null,
    parentRelation: p.parentRelation ?? null,
    consentMedical: p.consents.medical?.granted ?? false,
    consentMedia: p.consents.media?.granted ?? false,
    consentSupervision: p.consents.supervision?.granted ?? false,
```

- [ ] **Step 2: Create the controller**

```ts
// src/api/controllers/export.controller.ts
import type { HttpRequest } from '../http/types';
import type { ExportService } from '../../services/export.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface ExportControllerServices {
  exportService: ExportService;
}

export function makeExportController(services: ExportControllerServices) {
  return {
    async registrants(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const q = req.query;
      return services.exportService.exportRegistrants(req.ctx.actor, {
        churchId: q['churchId'],
        gender: q['gender'],
        kind: q['kind'],
        grade: q['grade'],
      });
    },
  };
}
```

Add to `src/api/controllers/index.ts` (follow existing barrel style):

```ts
export * from './export.controller';
```

- [ ] **Step 3: Wire the service into the container**

In `src/container.ts`:
- Add import near the other service imports:

```ts
import { makeExportService, type ExportService } from './services/export.service';
```

- Add to the `Services` interface (next to `importService: ImportService;`):

```ts
  exportService: ExportService;
```

- In **both** composition sites, next to `const importSvc = makeImportService(people, churches);` add:

```ts
    const exportSvc = makeExportService(people, churches);
```

- In **both** returned `Services` objects, next to `importService: importSvc,` add:

```ts
      exportService: exportSvc,
```

> Note: there are two `makeImportService(...)` sites (~line 167 and ~line 270) and two return objects (~line 178 and ~line 304). Edit all of them; use the local repo variable names already in scope (`people`, `churches`).

- [ ] **Step 4: Add the controller + route in the router**

In `src/api/http/router.ts`:
- Add import near the other controller imports:

```ts
import { makeExportController } from '../controllers/export.controller';
```

- Near `const importCtrl = makeImportController(...)`:

```ts
  const exportCtrl = makeExportController({ exportService: services.exportService });
```

- In the route array, right after the `/import/csv` route:

```ts
    { method: 'GET', path: '/export/registrants', auth: true, handler: (r) => exportCtrl.registrants(r) },
```

- [ ] **Step 5: Verify the route returns a bare CSV string**

Confirm the Express adapter sends a string body as text (same path `/notes/export` uses). Check `src/api/http/express-adapter.ts`: a handler returning a `string` should be written with a CSV/text content type or `res.send(string)`. If `/notes/export` already works as a string download, no change is needed; if the adapter `res.json()`s strings, mirror whatever special-casing `/notes/export` relies on. Do not add new behavior beyond matching the notes export.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Run the full test suite**

Run: `npm run test`
Expected: PASS (all suites).

- [ ] **Step 8: Commit**

```bash
git add src/container.ts src/api/controllers/export.controller.ts src/api/controllers/index.ts src/api/http/router.ts src/api/dto/person.dto.ts
git commit -m "feat: expose GET /export/registrants + surface fields on RegistrantDto"
```

---

### Task 6: SPA — director/admin **Data** tab (filterable table + export)

**Files:**
- Modify: `public/index.html` (add `<section id="data">`, a tab in `buildTabs`, `RENDER.data`, a CSV download helper)

**Interfaces:**
- Consumes: `GET /registrants` (now enriched), `GET /accounts/churches`, `GET /export/registrants?churchId=&gender=&kind=&grade=` (Task 5).
- Produces: a `data` screen reachable by `director`/`admin`.

- [ ] **Step 1: Add the screen section**

After `<section class="screen" id="import"></section>` (~line 195) add:

```html
    <section class="screen" id="data"></section>
```

- [ ] **Step 2: Add the tab for director/admin (pre-camp)**

In `buildTabs()`, in the `CAMP_MODE==='pre-camp'` branch, after the `['people','users','My Youth']` entry, insert a Data tab for director/admin:

```js
    if(ACTOR&&['director','admin'].includes(ACTOR.role))tabs.push(['data','users','Data']);
```

(Use an existing icon key from `ic()`; `users` is safe.)

- [ ] **Step 3: Add `RENDER.data` + helpers**

Add near `RENDER.import` (~line 1357):

```js
let _dataCache=null; // cached /registrants for client-side filtering
RENDER.data=async function(){
  if(!['director','admin'].includes(ACTOR.role)){paint('data','<p class="note-hint">This area is restricted to directors and admins.</p>','Data','');return;}
  const [regs,churches]=await Promise.all([
    api('/registrants').catch(()=>[]),
    api('/accounts/churches').catch(()=>[]),
  ]);
  _dataCache=regs||[];
  const chOpts=['<option value="">All churches</option>'].concat(
    (churches||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`)).join('');
  const gradeOpts=['<option value="">All grades</option>','<option value="leader">Leaders</option>']
    .concat([7,8,9,10,11,12].map(g=>`<option value="${g}">Grade ${g}</option>`)).join('');
  paint('data',`<div class="card">
    <div class="h3" style="margin-top:0">Registration data</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select class="fld" id="dfCh" style="flex:1;min-width:140px" onchange="dataApply()">${chOpts}</select>
      <select class="fld" id="dfGen" style="flex:1;min-width:110px" onchange="dataApply()">
        <option value="">All genders</option><option value="male">Male</option><option value="female">Female</option></select>
      <select class="fld" id="dfGr" style="flex:1;min-width:120px" onchange="dataApply()">${gradeOpts}</select>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" onclick="dataExport(true)">Export filtered</button>
      <button class="btn ghost" onclick="dataExport(false)">Export all</button>
    </div>
    <div id="dataCount" class="note-hint" style="margin-top:6px"></div>
    <div style="overflow-x:auto;margin-top:8px"><table class="dtable" id="dataTbl" style="min-width:860px;border-collapse:collapse;font-size:.8rem"></table></div>
  </div>`,'Data','Registrations');
  dataApply();
};
function dataFilters(){
  return {
    churchId:document.getElementById('dfCh')?.value||'',
    gender:document.getElementById('dfGen')?.value||'',
    grade:document.getElementById('dfGr')?.value||'',
  };
}
function dataApply(){
  const f=dataFilters();const rows=(_dataCache||[]).filter(r=>{
    if(f.churchId&&r.churchId!==f.churchId)return false;
    if(f.gender&&r.gender!==f.gender)return false;
    if(f.grade==='leader'){if(r.kind!=='leader')return false;}
    else if(f.grade){if(r.kind==='leader'||String(r.grade??'')!==f.grade)return false;}
    return true;
  });
  const hdr=['Name','Church','Gender','Grade','Mobile','Medical','Dietary','Other','Blue card'];
  const body=rows.map(r=>{
    const grade=r.kind==='leader'?'Leader':(r.grade??'—');
    const td=v=>`<td style="border-bottom:1px solid var(--line);padding:5px 8px;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(v||'—')}</td>`;
    return `<tr>${td(r.lastName+', '+r.firstName)}${td(r.churchName)}${td(r.gender)}${td(grade)}${td(r.mobile)}${td((r.medicalConditions||[]).join(', '))}${td((r.dietaryRequirements||[]).join(', '))}${td(r.otherMedications)}${td(r.blueCardNumber)}</tr>`;
  }).join('');
  const t=document.getElementById('dataTbl');
  if(t)t.innerHTML=`<thead><tr>${hdr.map(h=>`<th style="text-align:left;border-bottom:2px solid var(--line);padding:6px 8px;color:var(--muted)">${h}</th>`).join('')}</tr></thead><tbody>${body||'<tr><td colspan="9" style="padding:10px;color:var(--muted)">No matching registrants</td></tr>'}</tbody>`;
  const c=document.getElementById('dataCount');if(c)c.textContent=`${rows.length} of ${(_dataCache||[]).length} registrants`;
}
async function dataExport(filtered){
  try{
    let qs='';
    if(filtered){const f=dataFilters();const params=new URLSearchParams();
      if(f.churchId)params.set('churchId',f.churchId);
      if(f.gender)params.set('gender',f.gender);
      if(f.grade==='leader')params.set('kind','leader');
      else if(f.grade)params.set('grade',f.grade);
      const s=params.toString();if(s)qs='?'+s;}
    const csv=await api('/export/registrants'+qs);
    if(!csv||typeof csv!=='string'){toast('Nothing to export');return;}
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a=document.createElement('a');a.href=url;
    a.download='camp-registrations-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }catch(e){toast(e.message);}
}
```

> If `paint(id, html, title, subtitle)` has a different argument order, match the call used by `RENDER.import` exactly. Reuse the existing `esc()`, `api()`, `toast()`, and `paint()` helpers — do not redefine them.

- [ ] **Step 4: Manual verification (in-memory seed)**

```bash
npm run dev
```
Then in a browser at `http://localhost:4200`: log in as `director` (password `demo1234`), confirm a **Data** tab appears, the table lists seeded registrants, the three filters narrow the rows + count, **Export all** downloads a CSV whose header row matches the 29 Elvanto columns, and **Export filtered** reflects the active filters. Log in as `church` and confirm there is **no** Data tab.

- [ ] **Step 5: Commit**

```bash
git add public/index.html
git commit -m "feat: add director/admin Data tab (filterable table + CSV export)"
```

---

### Task 7: Supabase migration for the two new columns (scaffolding parity)

**Files:**
- Create: `supabase/migrations/<next-number>_person_extra_fields.sql`

**Interfaces:**
- Consumes: the `supabase.people.ts` mapping already updated in Task 2.
- Produces: schema parity for `medicare_number` + `church_unlisted_note` (NOT applied — repo layer stays scaffolding per known risk R11).

- [ ] **Step 1: Find the next migration number**

Run: `ls supabase/migrations`
Use the next sequential prefix following the highest existing number.

- [ ] **Step 2: Write the migration**

```sql
-- Adds the Person fields needed for full Elvanto round-trip fidelity.
alter table if exists people
  add column if not exists medicare_number text,
  add column if not exists church_unlisted_note text,
  add column if not exists elvanto_meta jsonb;
```

> Match the people table name to whatever the existing migrations use (e.g. `people`); if the column-naming convention differs, follow the existing migrations' casing.

- [ ] **Step 3: Verify it does not break typecheck/tests**

Run: `npm run typecheck && npm run test`
Expected: PASS (SQL isn't compiled, but confirm nothing else regressed).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "chore: migration for medicare_number + church_unlisted_note (not applied)"
```

---

## Self-Review

**Spec coverage:**
- Field-by-field remap → Task 3 (+ Task 1 normalizers). ✓
- Conditions verbatim + junk strip → Task 1 `cleanCareText`, Task 3 storage. ✓
- Leader detection → Task 1 `parseGradeOrLeader`, Task 3. ✓
- DOB/blue-card date normalization → Task 1, Task 3; export reformat → Task 4. ✓
- Auto-create unknown church → Task 3 `resolveChurch`. ✓
- Consents mapping → Task 3 `buildConsents`. ✓
- New entity fields → Task 2; DTO surfacing → Task 5. ✓
- Exact 29-col export + round-trip → Task 1 `ELVANTO_HEADERS`, Task 4. ✓
- Route/controller/container wiring → Task 5. ✓
- Data tab, director+admin, filters, export-respects-filters → Task 6. ✓
- Supabase parity migration → Task 7. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are concrete. The two "match existing style" notes (express-adapter string handling, migration table name) are verification instructions, not deferred implementation.

**Type consistency:** `ImportResult` fields (`warnings`, `churchesCreated`) are produced in Task 3 and not consumed by later tasks. `personToElvantoRow(p, churchName)` signature is identical in Tasks 4. `ExportFilters` keys (`churchId/gender/kind/grade`) match the controller (Task 5) and SPA query params (Task 6). `RegistrantDto` additions (Task 5) match the fields the SPA reads (Task 6 uses `medicalConditions/dietaryRequirements/otherMedications/blueCardNumber/kind/grade/gender/churchName` — all present).
