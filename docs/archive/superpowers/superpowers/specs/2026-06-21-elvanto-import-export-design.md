# Elvanto Import Fix + Data Table & Export — Design

**Date:** 2026-06-21
**Status:** Approved (design); implementation plan to follow.
**Scope:** the real camp app (`src/` + `public/`). Fix the CSV import so it correctly
ingests the **Elvanto registration export**, store previously-dropped fields, and add a
director/admin **Data** tab with a filterable table and a round-trip CSV export.

---

## 1. Problem statement

The import (`src/services/import.service.ts`) was written against an idealised internal CSV
schema, not the Elvanto export. Run against the real Elvanto export (`Camp Sample Data.csv`,
29 columns) **only First Name, Last Name and Gender import correctly** — every other field is
silently dropped because the header names the code looks for don't match Elvanto's.

### Field-by-field audit (against the real export)

| Elvanto column | Code looked for | Status before fix |
|---|---|---|
| First Name / Last Name / Gender | match | OK |
| Date of Birth (`30/09/2009`, DD/MM/YYYY) | `dateOfBirth`/`dob`/`DOB` | dropped; format also breaks `ageFromDob()` |
| School Grade (`11`, `18+ Leader`) | `Grade` | dropped; no leader detection at all |
| Mobile Number / Email Address | `Mobile` / `Email` | dropped |
| Suburb / Postcode / State | — | never read (entity has fields) |
| Medicare Number | — | no entity field |
| Medical Conditions | `Medical` | dropped |
| Dietary Requirements | `Dietary` | dropped |
| List Other Medical Conditions or Medication Taken | — | never read (`otherMedications` exists) |
| Attendee's Church | `Church` | dropped → empty `churchId` |
| If church not listed … specify name & Youth Pastor | — | no field |
| Blue Card Number / Expiry | — | never read (fields exist) |
| 3 consent columns (`Yes`) | — | never mapped → consents stored `false` |
| Parent/Guardian Name / Relation / Phone | `Parent`/… | relation dropped; others dropped |

### Data-shape variations observed (the three "conditions" columns)

Families use the three care columns inconsistently:

- **Liam (row 2):** Medical = clinical list (`Anaphylaxis, Dairy Intolerance, Egg Allergy, Nut
  Allergy`); Dietary = free-text sentence (`No dairy no eggs no nuts no fish no sesame`); Other = empty.
- **Alelia (row 3):** Medical = a list; Dietary = empty; Other = empty. **Leader** (`Person` cell
  empty, School Grade = `18+ Leader`); church not in system (`Kingdom Hope Church`); has Blue Card.
- **Cooper (row 4):** Medical = empty; Dietary = `NA` (junk placeholder); Other = a **multi-line
  medication list** (`Ritalin`⏎`Fluexotine`, a quoted field spanning two CSV lines).

Implication: the same information lands in different columns per family; `NA`/`No`/blank all mean
"nothing". We must **preserve each column verbatim** and never attempt to parse/split medical text.

---

## 2. Decisions (confirmed with owner)

1. **Conditions storage:** preserve verbatim as three separate free-text fields; no splitting.
   Strip whole-value junk placeholders (`NA`, `N/A`, `No`, `None`, `Nil`, `-`) to empty; keep
   partial matches like `No dairy…`.
2. **Leader detection:** School Grade containing `leader` or `18+` (case-insensitive) ⇒
   `kind:'leader'`, `grade:null`; numeric 7–12 ⇒ `kind:'youth'` with that grade.
3. **Unknown church:** auto-create a minimal `Church` record (name + `youthPastorName` from the
   "specify" column); report created churches in the import result.
4. **Export format:** reproduce the exact 29 Elvanto columns for round-trip comparison.
5. **Extra fields:** add `medicareNumber` and `churchUnlistedNote` to `Person` (persisted) for
   full round-trip fidelity.
6. **Menu placement:** new top-level **Data** tab, visible to `director` + `admin` (same gate as
   Import).
7. **Export scope:** table shows all fields; export respects active filters ("Export filtered")
   with a separate "Export all".

---

## 3. Architecture

Follows the existing layering: `api (Express) → controllers → services → repositories → core`.

### 3.1 Core / entities

- `Person` (`src/core/entities/person.ts`): add `medicareNumber?: string | null` and
  `churchUnlistedNote?: string | null`. `medicalConditions`/`dietaryRequirements` stay `string[]`
  (stored as a single verbatim element so the SPA's `.join(', ')` renders unchanged).
- Default value `null` everywhere a `Person` is constructed (create service, seed, mappers) to
  keep `strict`/`noUncheckedIndexedAccess` happy.

### 3.2 New module: `src/services/elvanto-mapping.ts`

Pure, dependency-free mapping/normalization used by both import and export (and unit-tested in
isolation):

- `ELVANTO_HEADERS: readonly string[]` — the canonical 29-column order.
- `normalizeDate(raw): string | null` — `DD/MM/YYYY` → ISO `YYYY-MM-DD`; passes through ISO; null
  on blank/invalid.
- `formatDateAU(iso): string` — ISO → `DD/MM/YYYY` for export.
- `parseGradeOrLeader(raw): { kind: 'youth'|'leader'; grade: Grade|null }`.
- `cleanCareText(raw): string` — trims; returns `''` for whole-value junk placeholders.
- `field(row, ...aliases): string` — first non-empty among Elvanto + internal aliases.
- `yesToConsent(raw): boolean`.

### 3.3 Import (`src/services/import.service.ts`)

Reuse the existing match/dedup/batch machinery (pool by name+church, phone disambiguation,
single `saveMany`). Replace the per-field `row['x'] ?? row['y']` reads with the alias layer and
the normalizers above. Additions:

- Resolve church by name; on miss, **auto-create** via `churchRepo` (see 3.5) and use the new id.
- Map the three care columns verbatim; map `otherMedications`, `medicareNumber`,
  `churchUnlistedNote`, suburb/postcode/state, blue card, email, dob.
- Map the 3 consent columns into `consents` with a timestamp (Date Submitted, else import time).
- `ImportResult` gains `churchesCreated: string[]` and per-row `warnings: Array<{row,message}>`
  (e.g. "church 'X' auto-created", "defaulted zone to Yellow").

### 3.4 Export (`src/services/export.service.ts`)

- `personToElvantoRow(p: Person, church?: Church): string[]` — `Person` → 29 values in
  `ELVANTO_HEADERS` order. Pure-submission-metadata columns (`Date Submitted`, `Submission
  Status`, `Person Status`, `Today's Date`) emitted blank; `Person` reconstructed as `Last, First`;
  dates via `formatDateAU`; care arrays joined back to their verbatim string.
- `exportRegistrants(actor, filters): Promise<string>` — `assertCan(actor,'import:run')`, load
  persons (+ churches for names), apply filters (`churchId`, `gender`, `kind`, `grade`), build CSV
  via `toCsvString(ELVANTO_HEADERS, rows)`.

### 3.5 Church auto-create

When a CSV church name has no match: construct a `Church` with `name`, `youthPastorName` =
"specify" column, generated `code` (slug of name, upper-cased, deduped) + `selfRegisterSlug`,
`zone: 'Yellow'` (default — surfaced as a warning), `expectedCount: 0`, empty
`reservations`/`contacts`. Persist via `churchRepo.save`. Cache created churches in-run so two
rows with the same new church don't double-create.

### 3.6 API

- `src/api/controllers/export.controller.ts` → `exportRegistrants(req)` reads
  `churchId`/`gender`/`kind`/`grade` from `req.query`, returns the CSV string bare.
- Route: `GET /export/registrants` (auth, gated `import:run`) added to `src/api/http/router.ts`.
- DTOs (`person.dto.ts`): surface previously-dropped/new fields on `RegistrantDto` so the table can
  render them (dob, email, suburb, postcode, state, otherMedications, medicareNumber,
  churchUnlistedNote, parentRelation, consents). Keep existing field names stable.

### 3.7 Supabase scaffolding

Add a migration adding `medicare_number` and `church_unlisted_note` to the people table (parity
with the unverified Supabase repo layer; in-memory/JSON need no migration). `supabase.people.ts`
read/write mapping updated. Not applied in this work (repo layer remains scaffolding per R11) but
kept consistent.

### 3.8 Frontend — Data tab (`public/index.html`)

- New nav tab **Data**, gated to `director`/`admin` (mirror the Import gate).
- `RENDER.data` renders: a filter bar (Church dropdown from `/accounts/churches`; Gender;
  Grade/Leader = 7–12 + "Leader"), a result count, and a horizontally scrollable table of
  registrants (`overflow-x-auto` + `min-w-[…]`) with the key columns including medical/dietary/
  contacts. Filtering is client-side over a single `/registrants` fetch for instant response.
- Two buttons: **Export filtered** (sends current filters as query params to
  `/export/registrants`) and **Export all** (no filters). Download via the existing blob pattern
  used by the testimonies export (`a.download = 'camp-registrations-<date>.csv'`).

---

## 4. Data flow

```
Elvanto CSV ─▶ parseCsv ─▶ [elvanto-mapping aliases+normalizers] ─▶ Person(s)
                                   │ church miss ─▶ churchRepo.save (auto-create)
                                   ▼
                          personRepo.saveMany  ─▶  in-memory/JSON/(supabase)

Data tab ─▶ GET /registrants ─▶ client filter ─▶ table
        └─▶ GET /export/registrants?filters ─▶ personToElvantoRow ─▶ CSV ─▶ download
```

Round-trip invariant: `import(CSV) → export() ≡ CSV` for the modelled student-data columns
(submission-metadata columns are intentionally blank).

---

## 5. Error handling

- Missing first/last name → row skipped, recorded in `errors` (unchanged).
- Unparseable date → field stored `null`, row still imported, `warnings` entry.
- Unknown church → auto-created, `warnings` + `churchesCreated` entry.
- Invalid grade text that isn't a leader marker → `grade:null`, `kind:'youth'`, `warnings` entry.
- Export with no persons → empty CSV with header row only (not an error).
- Access: both import and export gated by `import:run` via `assertCan`.

---

## 6. Testing (TDD; `npm run typecheck` + `npm run test`)

`node_modules` is present, so both gates run locally.

- **`elvanto-mapping.test.ts`** — date normalize/format round-trip, grade/leader detection, junk
  stripping (keeps `No dairy…`, drops `NA`), alias resolution, consent parsing.
- **`import.service.test.ts`** (extend) — feed the 3 sample rows; assert: leader detection (Alelia),
  DOB ISO, all fields mapped, multi-line "Other" preserved (Cooper), `NA` dietary → empty,
  auto-created church (`Kingdom Hope Church`) + warning, consents `granted:true`.
- **`export.service.test.ts`** — `Person` → 29-col row shape; **round-trip**: import sample →
  export → re-import → persons identical on modelled fields.

---

## 7. Out of scope / non-goals

- No parsing/normalising of medical semantics (store verbatim).
- No applying the Supabase migration (repo layer stays scaffolding).
- No change to match/dedup rules beyond church resolution.
- No redaction/privacy layer on the table (full data per decision 7).
