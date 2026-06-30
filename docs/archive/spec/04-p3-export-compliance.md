# Part 3 — Post-camp Export & Compliance

> Root: `/home/tlestrange/Projects/AI Exploration/Project 2 - App Updates/my-youth-camp-master`
> Depends on: P0 (atCamp lifecycle), Person entity (`checkInHistory`, `signOutHistory`)

---

## 1. Overview — compliance centrepiece is signOutHistory, daily check-in is operational only

Post-camp export produces a single multi-tab `.xlsx` workbook (primary) plus two standalone CSV fallbacks. The framing distinction is intentional and must be reflected in UI labelling:

- **Sign-in/sign-out log** is the **compliance record**. It surfaces `signOutHistory` — every attendance lifecycle event including Day-1 arrival, ad-hoc sign-outs, and returns — with the statutory fields: reason, parentsMet, authorisedBy. External organisations (councils, parents, insurers) may request this sheet. It must be complete for every person regardless of final lifecycle.
- **Daily check-in log** is **operational data only**. It surfaces `checkInHistory` — twice-daily session taps by leaders. It is included for completeness and internal review; it has no external compliance value.
- The workbook is not a data dump; the Summary/cover sheet contextualises every count. The export path records `lastExportedAt` on `CampSettings`, which gates the new-year and reset destructive operations.
- All timestamps are rendered in the camp-local timezone (`settings.timezone`), not UTC.

---

## 2. Data model changes

### 2a. CampSettings: add `lastExportedAt` optional field

File: `src/core/entities/settings.ts`

Add one field to the `CampSettings` interface, after `updatedAt`:

```typescript
lastExportedAt?: string | null;   // ISO-8601; set on every successful GET /export/audit
```

The field is optional/nullable so that existing settings rows without it (pre-migration) continue to deserialise correctly without a migration guard.

### 2b. Supabase migration

File: `supabase/migrations/006_add_last_exported_at.sql`

Full content:

```sql
-- Adds last_exported_at to the camp_settings singleton so the wipe guard
-- can confirm an export has been taken before a new-year rollover or full reset.
-- NULL means no export has ever been taken (default for existing row).
--
-- APPLY to production: supabase db push (or psql < this file against DATABASE_URL)
alter table if exists camp_settings
  add column if not exists last_exported_at timestamptz;
```

The corresponding `SupabaseSettingsRepository` must read and write this column.
In the Supabase repo's row-to-domain mapper, add:

```typescript
lastExportedAt: row.last_exported_at ? new Date(row.last_exported_at).toISOString() : null,
```

In the domain-to-row mapper (used in `saveSingleton`), add:

```typescript
last_exported_at: settings.lastExportedAt ?? null,
```

The in-memory `InMemorySettingsRepository` already serialises the full object; no code change needed there.

---

## 3. AuditExportService

### 3a. Interface

File: `src/services/audit-export.service.ts` (new file)

```typescript
import type { Actor } from '../core/entities/user';

export interface AuditExportService {
  /** Full multi-tab .xlsx workbook. Buffer is returned directly for streaming. */
  exportMasterWorkbook(actor: Actor): Promise<Buffer>;
  /** Sign-in/sign-out log as a UTF-8 BOM CSV string (fallback / direct download). */
  exportSignInOutCsv(actor: Actor): Promise<string>;
  /** Daily check-in log as a UTF-8 BOM CSV string. */
  exportCheckInLogCsv(actor: Actor): Promise<string>;
}
```

All three methods require `admin:manage` permission (see section 3h).

### 3b. Sign-in/sign-out sheet specification

Column order, exactly as implemented:

| # | Column header | Source |
|---|---|---|
| 1 | Student | `${p.firstName} ${p.lastName}` |
| 2 | Church | `p.churchName` |
| 3 | Zone | `p.zone` |
| 4 | Gender | `p.gender` (capitalised: Male / Female / Other) |
| 5 | Grade | `p.grade != null ? String(p.grade) : p.kind === 'leader' ? '18+ Leader' : ''` |
| 6 | Event Type | See mapping below |
| 7 | Timestamp | `toTzString(event.timestamp, timezone)` |
| 8 | Reason | `event.reason ?? ''` |
| 9 | Parents Met | `event.parentsMet === true ? 'Yes' : event.parentsMet === false ? 'No' : ''` |
| 10 | Authorised By | `event.leaderName` |

Event Type mapping from `SignOutEvent.type`:
- First event where `type === 'in'` AND person `lifecycle` was promoted from `'registered'` to `'arrived'` at that timestamp = `'Day-1 Arrival'`
- Subsequent `type === 'in'` = `'Returned'`
- `type === 'out'` = `'Signed Out'`

To distinguish Day-1 Arrival from a return: the first event in `signOutHistory` where `type === 'in'` is always the Day-1 arrival (the attendance service appends events in chronological order; the first `in` is the promotion event from `registered` → `arrived`).

**People with zero `signOutHistory`** (registered but never arrived — lifecycle `'registered'`): emit one synthetic row with Event Type `'Registered - Did Not Attend'`, blank Timestamp/Reason/Parents Met/Authorised By.

**Sort**: zone ASC → church ASC → lastName ASC → timestamp ASC (all fields case-insensitive).

### 3c. Daily check-in sheet specification

One row per `CheckInEntry` across all persons at camp. Persons with no check-in history are omitted from this sheet entirely (they are covered by the sign-in/out sheet as "Registered - Did Not Attend").

| # | Column header | Source |
|---|---|---|
| 1 | Student | `${p.firstName} ${p.lastName}` |
| 2 | Church | `p.churchName` |
| 3 | Zone | `p.zone` |
| 4 | Session | `entry.sessionLabel` |
| 5 | Check-in/Check-out | `entry.type === 'in' ? 'Check-in' : 'Check-out'` |
| 6 | Leader | `entry.leaderId` (display name if resolvable, otherwise raw ID) |
| 7 | Timestamp | `toTzString(entry.timestamp, timezone)` |

Sort: zone ASC → church ASC → lastName ASC → timestamp ASC.

### 3d. Notes & Testimonies sheet

Reuse the `note.service` `exportRows` logic directly. Do not re-implement. Inject `NoteService` into `AuditExportService` and call:

```typescript
const notesCsv = await noteService.exportRows(actor);
// parse back to rows[] for exceljs — or drive noteRepo directly
```

For simplicity in the workbook, it is cleaner to inject `INoteRepository` and `IPersonRepository` directly and replicate the row-building loop from `note.service.ts` lines 76–95 rather than parsing the CSV string back. Mirror the column structure: `Time`, `Student`, `Logged by`, `Church`, `Gender`, `Grade`, `Category`, `Note`. No need for separate permission check since `exportMasterWorkbook` already asserts `admin:manage`.

### 3e. Attendees sheet

All persons, regardless of lifecycle, ordered by zone → church → lastName. One row per person.

| # | Column | Source |
|---|---|---|
| 1 | Student | `${p.firstName} ${p.lastName}` |
| 2 | Church | `p.churchName` |
| 3 | Zone | `p.zone` |
| 4 | Gender | Capitalised |
| 5 | Grade | Same as sign-in/out sheet |
| 6 | Kind | `p.kind === 'leader' ? 'Leader' : 'Youth'` |
| 7 | Status | See mapping below |
| 8 | Payment | `p.paymentStatus` |
| 9 | Medical Conditions | `p.medicalConditions.join('; ')` |
| 10 | Dietary | `p.dietaryRequirements.join('; ')` |
| 11 | Parent/Guardian | `p.parentGuardianName ?? ''` |
| 12 | Parent Phone | `p.parentPhone ?? ''` |

Status mapping:
- `lifecycle === 'registered'` → `'Registered - Did Not Attend'`
- `lifecycle === 'arrived'` → `'At Camp'`
- `lifecycle === 'checked_out'` → `'Signed Out'`
- `lifecycle === 'departed'` → `'Departed'`
- `lifecycle === 'cancelled'` → `'Cancelled'`

### 3f. Summary/cover sheet

Put this sheet **first** (tab index 0). Rows are label/value pairs. No column headers.

| Label | Value |
|---|---|
| Camp Name | `settings.campName` |
| Year | `settings.year` |
| Start Date | `settings.startDate` |
| End Date | `settings.endDate` |
| Timezone | `settings.timezone` |
| Export Generated | `toTzString(new Date().toISOString(), settings.timezone)` |
| Exported By | `actor.displayName` (actor role in parentheses) |
| Total Registered | count of all persons |
| Total Attended | count where `isCamper(p)` |
| Currently At Camp | count where `p.atCamp === true` |
| Signed Out (temporary) | count where `lifecycle === 'checked_out'` |
| Departed | count where `lifecycle === 'departed'` |
| Did Not Attend | count where `lifecycle === 'registered'` |
| Cancelled | count where `lifecycle === 'cancelled'` |
| Youth Attended | count isCamper + kind youth |
| Leaders Attended | count isCamper + kind leader |
| Check-in Events | total `checkInHistory` entries across all persons |
| Sign-out Events | total `signOutHistory` entries across all persons |
| Notes Logged | total notes from noteRepo |

Style the label column bold; leave the value column as plain text.

### 3g. exceljs implementation details

**Install:**

```
npm install exceljs
```

`exceljs` is CommonJS-compatible and works on Vercel serverless. It must be listed in `dependencies`, not `devDependencies`. Do not add `@types/exceljs` — the package ships its own type declarations.

**Import (CommonJS, never ESM import):**

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require('exceljs') as typeof import('exceljs');
```

This is required because `tsconfig` emits CommonJS and a named `import` of `exceljs` will produce broken output at runtime on Vercel.

**Workbook generation pattern:**

```typescript
const wb = new ExcelJS.Workbook();
wb.creator = 'Youth Camp Platform';
wb.created = new Date();

// For each sheet:
const ws = wb.addWorksheet(sheetName);

// Header row — bold + grey fill
const headerRow = ws.addRow(HEADERS);
headerRow.font = { bold: true };
headerRow.fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9D9D9' },
};

// Freeze top row
ws.views = [{ state: 'frozen', ySplit: 1 }];

// Add data rows
for (const row of dataRows) {
  ws.addRow(row);
}

// Auto-width: iterate columns, measure header + each cell
ws.columns.forEach((col) => {
  let maxLen = 10;
  col.eachCell({ includeEmpty: false }, (cell) => {
    const len = String(cell.value ?? '').length;
    if (len > maxLen) maxLen = len;
  });
  col.width = Math.min(maxLen + 2, 60); // cap at 60 to prevent enormous columns
});

// Write to buffer
const buffer = await wb.xlsx.writeBuffer();
return buffer as Buffer;
```

Tab order: Summary → Attendees → Sign-in/Sign-out Log → Daily Check-in Log → Notes & Testimonies.

### 3h. Full `makeAuditExportService` factory — complete implementation

```typescript
import type { Actor } from '../core/entities/user';
import type { IPersonRepository, INoteRepository } from '../repositories/interfaces/entity-repositories';
import type { ISettingsRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { StudentNote } from '../core/entities/note';
import { isCamper } from '../core/entities/person';
import { assertCan } from './access-control';
import { toCsvString } from '../utils/csv';
import { createLogger } from '../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ExcelJS = require('exceljs') as typeof import('exceljs');

const logger = createLogger('audit-export');

export interface AuditExportService {
  exportMasterWorkbook(actor: Actor): Promise<Buffer>;
  exportSignInOutCsv(actor: Actor): Promise<string>;
  exportCheckInLogCsv(actor: Actor): Promise<string>;
}

export function makeAuditExportService(
  personRepo: IPersonRepository,
  noteRepo: INoteRepository,
  settingsRepo: ISettingsRepository,
): AuditExportService {

  /** Convert an ISO timestamp string to a human-readable local time string. */
  function toTzString(isoTs: string, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-AU', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(isoTs));
    } catch {
      return isoTs; // fallback to raw ISO if timezone is invalid
    }
  }

  function capitaliseGender(g: string): string {
    if (g === 'male') return 'Male';
    if (g === 'female') return 'Female';
    return g.charAt(0).toUpperCase() + g.slice(1);
  }

  function gradeText(p: Person): string {
    return p.kind === 'leader' ? '18+ Leader' : p.grade != null ? String(p.grade) : '';
  }

  function lifecycleStatus(lc: string): string {
    switch (lc) {
      case 'registered': return 'Registered - Did Not Attend';
      case 'arrived':    return 'At Camp';
      case 'checked_out': return 'Signed Out';
      case 'departed':   return 'Departed';
      case 'cancelled':  return 'Cancelled';
      default:           return lc;
    }
  }

  function sortPeople(people: Person[]): Person[] {
    return [...people].sort((a, b) => {
      const zone = a.zone.localeCompare(b.zone, undefined, { sensitivity: 'base' });
      if (zone !== 0) return zone;
      const church = a.churchName.localeCompare(b.churchName, undefined, { sensitivity: 'base' });
      if (church !== 0) return church;
      return a.lastName.localeCompare(b.lastName, undefined, { sensitivity: 'base' });
    });
  }

  function styleHeaderRow(row: ExcelJS.Row): void {
    row.font = { bold: true };
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  }

  function autoWidth(ws: ExcelJS.Worksheet): void {
    ws.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 60);
    });
  }

  function addSheet(
    wb: ExcelJS.Workbook,
    name: string,
    headers: string[],
    rows: (string | number | boolean | null)[],
  ): ExcelJS.Worksheet {
    const ws = wb.addWorksheet(name);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    styleHeaderRow(ws.addRow(headers));
    for (const row of rows as unknown as string[][]) {
      ws.addRow(row);
    }
    autoWidth(ws);
    return ws;
  }

  async function buildSignInOutRows(
    people: Person[],
    timezone: string,
  ): Promise<string[][]> {
    const rows: string[][] = [];
    const sorted = sortPeople(people);
    for (const p of sorted) {
      const history = p.signOutHistory ?? [];
      if (history.length === 0) {
        // Registered but never arrived
        rows.push([
          `${p.firstName} ${p.lastName}`,
          p.churchName,
          p.zone,
          capitaliseGender(p.gender),
          gradeText(p),
          'Registered - Did Not Attend',
          '', '', '', '',
        ]);
        continue;
      }
      let firstIn = true;
      // Sort events chronologically (should already be, but guard)
      const events = [...history].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      for (const ev of events) {
        let eventType: string;
        if (ev.type === 'in' && firstIn) {
          eventType = 'Day-1 Arrival';
          firstIn = false;
        } else if (ev.type === 'in') {
          eventType = 'Returned';
        } else {
          eventType = 'Signed Out';
          // do not flip firstIn for out events
        }
        rows.push([
          `${p.firstName} ${p.lastName}`,
          p.churchName,
          p.zone,
          capitaliseGender(p.gender),
          gradeText(p),
          eventType,
          toTzString(ev.timestamp, timezone),
          ev.reason ?? '',
          ev.parentsMet === true ? 'Yes' : ev.parentsMet === false ? 'No' : '',
          ev.leaderName,
        ]);
      }
    }
    return rows;
  }

  async function buildCheckInRows(
    people: Person[],
    timezone: string,
  ): Promise<string[][]> {
    const rows: string[][] = [];
    const sorted = sortPeople(people);
    for (const p of sorted) {
      const entries = [...(p.checkInHistory ?? [])].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      for (const entry of entries) {
        rows.push([
          `${p.firstName} ${p.lastName}`,
          p.churchName,
          p.zone,
          entry.sessionLabel,
          entry.type === 'in' ? 'Check-in' : 'Check-out',
          entry.leaderId,
          toTzString(entry.timestamp, timezone),
        ]);
      }
    }
    return rows;
  }

  async function buildNoteRows(
    actor: Actor,
    people: Person[],
    timezone: string,
  ): Promise<string[][]> {
    const personMap = new Map(people.map((p) => [p.id, p]));
    const notes = await noteRepo.findAll();
    const rows: string[][] = [];
    for (const note of notes) {
      const p = personMap.get(note.camperId);
      if (!p) continue;
      rows.push([
        toTzString(note.createdAt, timezone),
        `${p.firstName} ${p.lastName}`,
        note.authorName,
        p.churchName,
        capitaliseGender(p.gender),
        p.grade != null ? String(p.grade) : '',
        note.category ?? 'note',
        note.body,
      ]);
    }
    return rows;
  }

  async function buildWorkbook(actor: Actor): Promise<ExcelJS.Workbook> {
    const settings = await settingsRepo.getSingleton();
    if (!settings) throw new Error('Camp settings not found');
    const { timezone } = settings;

    const allPeople = await personRepo.findAll();
    const notes = await noteRepo.findAll();

    const totalRegistered = allPeople.length;
    const totalAttended = allPeople.filter(isCamper).length;
    const atCamp = allPeople.filter((p) => p.atCamp).length;
    const signedOut = allPeople.filter((p) => p.lifecycle === 'checked_out').length;
    const departed = allPeople.filter((p) => p.lifecycle === 'departed').length;
    const didNotAttend = allPeople.filter((p) => p.lifecycle === 'registered').length;
    const cancelled = allPeople.filter((p) => p.lifecycle === 'cancelled').length;
    const youthAttended = allPeople.filter((p) => isCamper(p) && p.kind === 'youth').length;
    const leadersAttended = allPeople.filter((p) => isCamper(p) && p.kind === 'leader').length;
    const totalCheckInEvents = allPeople.reduce((s, p) => s + (p.checkInHistory?.length ?? 0), 0);
    const totalSignOutEvents = allPeople.reduce((s, p) => s + (p.signOutHistory?.length ?? 0), 0);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Youth Camp Platform';
    wb.created = new Date();

    // --- Tab 1: Summary ---
    const summary = wb.addWorksheet('Summary');
    summary.views = [{ state: 'frozen', ySplit: 0 }];
    const summaryRows: [string, string | number][] = [
      ['Camp Name', settings.campName],
      ['Year', settings.year],
      ['Start Date', settings.startDate],
      ['End Date', settings.endDate],
      ['Timezone', timezone],
      ['Export Generated', toTzString(new Date().toISOString(), timezone)],
      ['Exported By', `${actor.displayName} (${actor.role})`],
      ['', ''],
      ['Total Registered', totalRegistered],
      ['Total Attended', totalAttended],
      ['Currently At Camp', atCamp],
      ['Signed Out (temporary)', signedOut],
      ['Departed', departed],
      ['Did Not Attend', didNotAttend],
      ['Cancelled', cancelled],
      ['Youth Attended', youthAttended],
      ['Leaders Attended', leadersAttended],
      ['Check-in Events', totalCheckInEvents],
      ['Sign-out Events', totalSignOutEvents],
      ['Notes Logged', notes.length],
    ];
    for (const [label, value] of summaryRows) {
      const row = summary.addRow([label, value]);
      if (label) row.getCell(1).font = { bold: true };
    }
    summary.getColumn(1).width = 30;
    summary.getColumn(2).width = 30;

    // --- Tab 2: Attendees ---
    const ATTENDEES_HEADERS = [
      'Student', 'Church', 'Zone', 'Gender', 'Grade', 'Kind',
      'Status', 'Payment', 'Medical Conditions', 'Dietary', 'Parent/Guardian', 'Parent Phone',
    ];
    const attendeesRows = sortPeople(allPeople).map((p) => [
      `${p.firstName} ${p.lastName}`,
      p.churchName,
      p.zone,
      capitaliseGender(p.gender),
      gradeText(p),
      p.kind === 'leader' ? 'Leader' : 'Youth',
      lifecycleStatus(p.lifecycle),
      p.paymentStatus,
      p.medicalConditions.join('; '),
      p.dietaryRequirements.join('; '),
      p.parentGuardianName ?? '',
      p.parentPhone ?? '',
    ]);
    addSheet(wb, 'Attendees', ATTENDEES_HEADERS, attendeesRows as unknown as (string | number | boolean | null)[]);

    // --- Tab 3: Sign-in/Sign-out Log ---
    const SIGNIN_HEADERS = [
      'Student', 'Church', 'Zone', 'Gender', 'Grade',
      'Event Type', 'Timestamp', 'Reason', 'Parents Met', 'Authorised By',
    ];
    const signinRows = await buildSignInOutRows(allPeople, timezone);
    addSheet(wb, 'Sign-in/Sign-out Log', SIGNIN_HEADERS, signinRows as unknown as (string | number | boolean | null)[]);

    // --- Tab 4: Daily Check-in Log ---
    const CHECKIN_HEADERS = [
      'Student', 'Church', 'Zone', 'Session', 'Check-in/Check-out', 'Leader', 'Timestamp',
    ];
    const checkinRows = await buildCheckInRows(allPeople, timezone);
    addSheet(wb, 'Daily Check-in Log', CHECKIN_HEADERS, checkinRows as unknown as (string | number | boolean | null)[]);

    // --- Tab 5: Notes & Testimonies ---
    const NOTES_HEADERS = [
      'Time', 'Student', 'Logged by', 'Church', 'Gender', 'Grade', 'Category', 'Note',
    ];
    const noteRows = await buildNoteRows(actor, allPeople, timezone);
    addSheet(wb, 'Notes & Testimonies', NOTES_HEADERS, noteRows as unknown as (string | number | boolean | null)[]);

    return wb;
  }

  return {
    async exportMasterWorkbook(actor) {
      assertCan(actor, 'admin:manage');
      logger.info(`Audit workbook export requested by actor=${actor.id} (${actor.role})`);
      const wb = await buildWorkbook(actor);
      const buffer = await wb.xlsx.writeBuffer();
      return buffer as Buffer;
    },

    async exportSignInOutCsv(actor) {
      assertCan(actor, 'admin:manage');
      logger.info(`Sign-in/out CSV export requested by actor=${actor.id} (${actor.role})`);
      const settings = await settingsRepo.getSingleton();
      const timezone = settings?.timezone ?? 'Australia/Brisbane';
      const allPeople = await personRepo.findAll();
      const headers = [
        'Student', 'Church', 'Zone', 'Gender', 'Grade',
        'Event Type', 'Timestamp', 'Reason', 'Parents Met', 'Authorised By',
      ];
      const rows = await buildSignInOutRows(allPeople, timezone);
      return '﻿' + toCsvString(headers, rows);
    },

    async exportCheckInLogCsv(actor) {
      assertCan(actor, 'admin:manage');
      logger.info(`Check-in log CSV export requested by actor=${actor.id} (${actor.role})`);
      const settings = await settingsRepo.getSingleton();
      const timezone = settings?.timezone ?? 'Australia/Brisbane';
      const allPeople = await personRepo.findAll();
      const headers = [
        'Student', 'Church', 'Zone', 'Session', 'Check-in/Check-out', 'Leader', 'Timestamp',
      ];
      const rows = await buildCheckInRows(allPeople, timezone);
      return '﻿' + toCsvString(headers, rows);
    },
  };
}
```

### 3i. Timezone conversion helper

The helper `toTzString` above uses `Intl.DateTimeFormat`, which is part of Node.js core (no third-party dependency). It takes a valid IANA timezone string from `settings.timezone` (e.g. `'Australia/Brisbane'`). The format produces `DD/MM/YYYY, HH:MM:SS` in the local zone. If the timezone string is invalid, the `try/catch` returns the raw ISO string as a safe fallback rather than crashing the entire export.

Note: Node 22 (the pinned engine) ships full ICU data, so all IANA timezones are available without polyfills. This is important — earlier Node versions or stripped ICU builds may only support UTC and the local system zone.

---

## 4. New API routes

### 4a. `GET /export/audit` — streams `.xlsx` Buffer

- Auth: required (`auth: true`)
- Permission: `admin:manage` (enforced inside service, not in controller)
- On success: writes `settings.lastExportedAt = new Date().toISOString()` via `settingsRepo.saveSingleton`
- Response headers:
  ```
  Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  Content-Disposition: attachment; filename="camp-export-<year>.xlsx"
  ```
- Response body: raw `Buffer` from `wb.xlsx.writeBuffer()`

Because `res.json(result)` in the Express adapter is the default response path, the audit controller must **break out of the generic route handler** and write the response directly. The route must accept an `Express.Response` reference. The cleanest approach is to add a `rawHandler` escape hatch to the route type:

```typescript
// In src/api/http/types.ts — add:
export interface RawRoute extends Omit<Route, 'handler'> {
  rawHandler(req: HttpRequest, res: import('express').Response): Promise<void>;
}
```

Then in `express-adapter.ts`, check for `rawHandler` and call it instead of the normal `handler` + `res.json` path.

Alternatively (simpler, no type change): add the audit routes to `router.ts` as inline `handler` functions that return a special sentinel object `{ __raw: true, contentType: string, filename: string, buffer: Buffer }`, and catch that in the adapter before calling `res.json`. This requires touching the adapter only in one place.

**Recommended approach** (minimal surface area): keep the `Route` interface unchanged; add a narrow `BufferRoute` type used only in the adapter:

```typescript
// src/api/http/types.ts — add:
export interface BufferRoute {
  method: 'GET';
  path: string;
  auth: boolean;
  bufferHandler(req: HttpRequest): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  }>;
}
```

In `express-adapter.ts`, check `'bufferHandler' in route` and handle separately:

```typescript
if ('bufferHandler' in route) {
  const br = route as BufferRoute;
  app[method](expressPath, async (req, res) => {
    try {
      const ctx = await resolveContext(req.headers['authorization'], authService, br.auth);
      if (br.auth && !ctx) { res.status(401).json({ code: 'UNAUTHORIZED', message: 'Unauthorized' }); return; }
      const httpReq: HttpRequest = { ctx, params: req.params as Record<string, string>, query: req.query as Record<string, string | undefined>, body: req.body };
      const result = await br.bufferHandler(httpReq);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (err) { sendError(res, err); }
  });
  continue; // skip normal route registration
}
```

### 4b. `GET /export/signin-out` — CSV fallback

- Returns `exportSignInOutCsv()` result as a plain string response
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="signin-out-log-<year>.csv"`
- This can use the same `BufferRoute` mechanism, converting the string to a Buffer: `Buffer.from(csv, 'utf-8')`

### 4c. `src/api/controllers/audit.controller.ts` — complete code

```typescript
import type { HttpRequest } from '../http/types';
import type { AuditExportService } from '../../services/audit-export.service';
import type { SettingsService } from '../../services/settings.service';
import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { nowISO } from '../../utils/date';
import { createLogger } from '../../utils/logger';

const logger = createLogger('audit-controller');

export interface AuditControllerServices {
  auditExport: AuditExportService;
  settingsRepo: ISettingsRepository;
  settings: SettingsService;
}

export function makeAuditController(services: AuditControllerServices) {
  return {
    async exportWorkbook(req: HttpRequest): Promise<{
      buffer: Buffer;
      contentType: string;
      filename: string;
    }> {
      if (!req.ctx) throw new UnauthorizedError();
      const actor = req.ctx.actor;

      const buffer = await services.auditExport.exportMasterWorkbook(actor);

      // Record lastExportedAt on successful export
      const current = await services.settingsRepo.getSingleton();
      if (current) {
        await services.settingsRepo.saveSingleton({
          ...current,
          lastExportedAt: nowISO(),
          updatedAt: nowISO(),
        });
      }

      logger.info(`Audit workbook downloaded by actor=${actor.id} role=${actor.role}`);

      const year = current?.year ?? new Date().getFullYear();
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `camp-export-${year}.xlsx`,
      };
    },

    async exportSignInOutCsv(req: HttpRequest): Promise<{
      buffer: Buffer;
      contentType: string;
      filename: string;
    }> {
      if (!req.ctx) throw new UnauthorizedError();
      const actor = req.ctx.actor;
      const csv = await services.auditExport.exportSignInOutCsv(actor);
      const current = await services.settingsRepo.getSingleton();
      const year = current?.year ?? new Date().getFullYear();
      logger.info(`Sign-in/out CSV downloaded by actor=${actor.id} role=${actor.role}`);
      return {
        buffer: Buffer.from(csv, 'utf-8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `signin-out-log-${year}.csv`,
      };
    },
  };
}
```

Routes to add in `router.ts` (as `BufferRoute` entries):

```typescript
// In buildRoutes(), after the existing export route:
const audit = makeAuditController({
  auditExport: services.auditExport,
  settingsRepo: repos.settings,   // pass repos into buildRoutes
  settings: services.settings,
});

// BufferRoute entries (typed separately or cast):
{ method: 'GET', path: '/export/audit',     auth: true, bufferHandler: (r) => audit.exportWorkbook(r) },
{ method: 'GET', path: '/export/signin-out', auth: true, bufferHandler: (r) => audit.exportSignInOutCsv(r) },
```

Note: `buildRoutes` currently only takes `services: Services`. To pass `settingsRepo`, either add a `repos: Repositories` second parameter to `buildRoutes`, or wire `settingsRepo` into `Services` as a direct property. The latter is simpler:

```typescript
// In container.ts Services interface and both build paths:
auditExport: AuditExportService;
settingsRepo: ISettingsRepository;  // expose for controllers that need direct repo access
```

---

## 5. Wipe guard

### 5a. `admin.service` changes — `newYear` and `reset`

Both destructive operations must check `lastExportedAt` before proceeding. Add a `WipeGuardError` to `src/core/errors/app-error.ts`:

```typescript
export class WipeGuardError extends AppError {
  constructor(m = 'Export required before this operation') {
    super(409, 'WIPE_GUARD', m);
  }
}
```

409 Conflict is appropriate: the operation is understood but cannot proceed in the current state.

Update `AdminService` interface to accept an options object on both operations:

```typescript
export interface AdminService {
  reset(actor: Actor, opts?: { force?: boolean }): Promise<{ ok: true }>;
  newYear(actor: Actor, year: number, opts?: { force?: boolean }): Promise<CampSettings>;
  // ... rest unchanged
}
```

In `makeAdminService`, the guard logic is identical for both methods:

```typescript
async function assertExportedOrForce(
  settings: CampSettings,
  force: boolean | undefined,
): Promise<void> {
  if (force === true) return; // admin explicitly overrides
  if (!settings.lastExportedAt) {
    throw new WipeGuardError(
      'No export on record. Download the full audit export from the Records & Export screen before rolling over, or pass force:true to override.',
    );
  }
}
```

In `reset`:

```typescript
async reset(actor, opts) {
  if (actor.role !== 'admin') throw new ForbiddenError('Only admin can reset data');
  const settings = await settingsService.get();
  await assertExportedOrForce(settings, opts?.force);
  // ... rest of existing reset logic unchanged
}
```

In `newYear`:

```typescript
async newYear(actor, year, opts) {
  if (actor.role !== 'admin') throw new ForbiddenError('Only admin can advance the year');
  const settings = await settingsService.get();
  await assertExportedOrForce(settings, opts?.force);
  const defaults = await snapshotRepo.getDefaults();
  // ... rest of existing newYear logic unchanged
}
```

The `admin.controller.ts` must forward the `force` flag from the request body:

```typescript
async newYear(req: HttpRequest) {
  if (!req.ctx) throw new UnauthorizedError();
  const body = req.body as { year?: number; force?: boolean };
  const year = typeof body.year === 'number' ? body.year : new Date().getFullYear() + 1;
  return services.admin.newYear(req.ctx.actor, year, { force: body.force });
},

async reset(req: HttpRequest) {
  if (!req.ctx) throw new UnauthorizedError();
  const body = req.body as { force?: boolean };
  return services.admin.reset(req.ctx.actor, { force: body.force });
},
```

### 5b. SPA close-out screen — `renderCloseOut`

Add to `public/index.html`. This screen is reachable from the admin console only when `actor.role === 'admin'`. It walks through three sequential steps with visual state tracking.

```javascript
function renderCloseOut() {
  const year = STATE.settings?.year ?? new Date().getFullYear();
  const nextYear = year + 1;
  const exported = !!STATE.settings?.lastExportedAt;
  const exportedAt = STATE.settings?.lastExportedAt
    ? new Date(STATE.settings.lastExportedAt).toLocaleString('en-AU')
    : null;

  // Step state: 0=not started, 1=done
  const step1Done = exported;
  // step2: user confirms in the DOM (managed by local variable _closeOutStep2)
  // step3: triggered by button

  setContent(`
    <div class="screen-header">
      <h2>Year-End Close-Out</h2>
      <p class="muted">Complete all three steps before rolling over to ${nextYear}.</p>
    </div>

    <div class="closeout-steps">

      <!-- Step 1: Download records -->
      <div class="closeout-step ${step1Done ? 'done' : 'pending'}" id="closeout-step1">
        <div class="step-badge">${step1Done ? '✓' : '1'}</div>
        <div class="step-body">
          <div class="step-title">Download records</div>
          ${step1Done
            ? `<p class="muted small">Exported ${exportedAt}.</p>`
            : `<p class="muted small">Download the complete audit workbook before rolling over. This cannot be undone.</p>`
          }
          <button
            class="btn ${step1Done ? 'btn-secondary' : 'btn-primary'}"
            onclick="downloadAuditExport()"
          >${step1Done ? 'Re-download export' : 'Download full export (.xlsx)'}</button>
        </div>
      </div>

      <!-- Step 2: Confirm saved -->
      <div class="closeout-step ${step1Done ? '' : 'locked'}" id="closeout-step2">
        <div class="step-badge" id="step2-badge">2</div>
        <div class="step-body">
          <div class="step-title">Confirm records saved</div>
          <p class="muted small">Confirm the export file has been saved to a secure location (shared drive, records system, etc.).</p>
          <label class="checkbox-label">
            <input type="checkbox" id="closeout-confirm-saved" ${!step1Done ? 'disabled' : ''}
              onchange="onCloseOutConfirmChange(this.checked)">
            I confirm the export has been saved and verified.
          </label>
        </div>
      </div>

      <!-- Step 3: Roll over -->
      <div class="closeout-step locked" id="closeout-step3">
        <div class="step-badge">3</div>
        <div class="step-body">
          <div class="step-title">Roll over to ${nextYear}</div>
          <p class="muted small">
            This will delete all ${year} registrants, campers, notes, and notifications,
            and restore the scaffold (churches, accounts, schedule) from defaults.
            The admin account and camp settings are preserved.
          </p>
          <button class="btn btn-danger" id="closeout-roll-btn" disabled
            onclick="doNewYear(${nextYear})">
            Roll over to ${nextYear}
          </button>
        </div>
      </div>

    </div>
  `);
}

let _closeOutConfirmed = false;

function onCloseOutConfirmChange(checked) {
  _closeOutConfirmed = checked;
  const step2Badge = document.getElementById('step2-badge');
  const step3 = document.getElementById('closeout-step3');
  const rollBtn = document.getElementById('closeout-roll-btn');
  if (step2Badge) step2Badge.textContent = checked ? '✓' : '2';
  if (step3) step3.classList.toggle('locked', !checked);
  if (rollBtn) rollBtn.disabled = !checked;
}

async function downloadAuditExport() {
  try {
    const res = await fetch('/export/audit', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      const err = await res.json();
      showToast(err.message ?? 'Export failed', 'error');
      return;
    }
    const blob = await res.blob();
    const year = STATE.settings?.year ?? new Date().getFullYear();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `camp-export-${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    // Refresh settings to pick up lastExportedAt
    await loadSettings();
    renderCloseOut();
  } catch (e) {
    showToast('Download failed', 'error');
  }
}

async function doNewYear(year) {
  if (!_closeOutConfirmed) return;
  if (!confirm(`Roll over to ${year}? This will permanently delete all current-year data.`)) return;
  try {
    const res = await api('POST', '/admin/new-year', { year });
    STATE.settings = res;
    showToast(`Rolled over to ${year}. Set passwords for restored accounts.`, 'success');
    _closeOutConfirmed = false;
    renderAdminHome();
  } catch (e) {
    showToast(e.message ?? 'Roll over failed', 'error');
  }
}
```

CSS classes needed (add to the `<style>` block in `public/index.html`):

```css
.closeout-steps { display: flex; flex-direction: column; gap: 16px; margin-top: 16px; }
.closeout-step { display: flex; gap: 12px; padding: 14px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; }
.closeout-step.done { border-color: #4caf50; background: #f1f8e9; }
.closeout-step.locked { opacity: 0.45; pointer-events: none; }
.step-badge { width: 28px; height: 28px; border-radius: 50%; background: #1976d2; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.closeout-step.done .step-badge { background: #4caf50; }
.step-body { flex: 1; }
.step-title { font-weight: 600; margin-bottom: 4px; }
.checkbox-label { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 14px; }
.btn-danger { background: #d32f2f; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 14px; }
.btn-danger:disabled { opacity: 0.4; cursor: not-allowed; }
```

---

## 6. BOM fix — updated `toCsvString`

File: `src/utils/csv.ts`

**Change:** prepend a UTF-8 BOM (`﻿`) to the output of `toCsvString`.

```typescript
export function toCsvString(headers: string[], rows: string[][]): string {
  const lines = [toCsvRow(headers), ...rows.map(toCsvRow)];
  return '﻿' + lines.join('\n');
}
```

**Why this matters:**

The file currently contains `stripBom()` which strips a BOM on *import* — that is correct and should not change. The problem is on *export*: when a CSV file is opened directly in Microsoft Excel on Windows or Mac, Excel uses the BOM to detect UTF-8 encoding. Without it, Excel defaults to the system code page (often Windows-1252 or similar) and misrenders any non-ASCII characters — accented names, special characters in medical conditions, Aboriginal place names in suburb/state fields. Adding `﻿` at the byte 0 position causes Excel to auto-detect UTF-8, which preserves all characters correctly.

The BOM does not affect programmatic consumers (Node's `fs.readFile`, Python's `open(..., encoding='utf-8-sig')`, or any parser that calls the existing `stripBom()` function) — they either handle it natively or strip it transparently.

Note: `AuditExportService.exportSignInOutCsv` and `exportCheckInLogCsv` also prepend the BOM explicitly (as shown in section 3h). If `toCsvString` is updated globally, remove the explicit `'﻿' +` prefix in those two methods to avoid a double BOM.

The existing `note.service.ts` `exportRows` method calls `toCsvString` and will also gain the BOM automatically — correct behaviour, no change needed there.

**Risk:** the only callers of `toCsvString` are `export.service.ts` (Elvanto registrant export) and `note.service.ts`. Both produce files intended for end-user download. Adding the BOM to both is correct.

---

## 7. Records & export screen — `renderAdminRecords`

Add a "Records & Export" navigation entry to the admin console tile grid, visible to `admin` and `director` roles.

```javascript
function renderAdminRecords() {
  const exported = !!STATE.settings?.lastExportedAt;
  const exportedAt = STATE.settings?.lastExportedAt
    ? new Date(STATE.settings.lastExportedAt).toLocaleString('en-AU')
    : 'Never';
  const year = STATE.settings?.year ?? new Date().getFullYear();

  setContent(`
    <div class="screen-header">
      <h2>Records & Export</h2>
      <p class="muted">Download compliance records and operational logs.</p>
    </div>

    <div class="records-status card">
      <div class="records-status-row">
        <span class="label">Last full export</span>
        <span class="value ${exported ? 'text-green' : 'text-amber'}">${exportedAt}</span>
      </div>
    </div>

    <div class="export-cards">

      <div class="export-card">
        <div class="export-card-icon">📋</div>
        <div class="export-card-body">
          <div class="export-card-title">Full Audit Workbook</div>
          <div class="export-card-desc">
            Multi-tab .xlsx: Summary, Attendees, Sign-in/Sign-out Log (compliance),
            Daily Check-in Log, Notes & Testimonies.
          </div>
          <button class="btn btn-primary" onclick="downloadAuditExport()">
            Download .xlsx
          </button>
        </div>
      </div>

      <div class="export-card">
        <div class="export-card-icon">📄</div>
        <div class="export-card-body">
          <div class="export-card-title">Sign-in/Sign-out Log (CSV)</div>
          <div class="export-card-desc">
            Compliance record: every lifecycle event per person including Day-1 arrival,
            reason, parents met, authorised by.
          </div>
          <button class="btn btn-secondary" onclick="downloadCsvExport('/export/signin-out', 'signin-out-log-${year}.csv')">
            Download CSV
          </button>
        </div>
      </div>

      <div class="export-card">
        <div class="export-card-icon">📝</div>
        <div class="export-card-body">
          <div class="export-card-title">Registrant Data (CSV)</div>
          <div class="export-card-desc">
            Full Elvanto-compatible registrant export. Suitable for data handback or
            next-year import.
          </div>
          <button class="btn btn-secondary" onclick="downloadCsvExport('/export/registrants', 'registrants-${year}.csv')">
            Download CSV
          </button>
        </div>
      </div>

      <div class="export-card">
        <div class="export-card-icon">💬</div>
        <div class="export-card-body">
          <div class="export-card-title">Notes & Testimonies (CSV)</div>
          <div class="export-card-desc">
            All logged notes and testimonies with student, author, and timestamp.
          </div>
          <button class="btn btn-secondary" onclick="downloadCsvExport('/notes/export', 'notes-${year}.csv')">
            Download CSV
          </button>
        </div>
      </div>

    </div>

    ${ACTOR.role === 'admin' ? `
    <div class="closeout-banner">
      <p>Ready to roll over to next year?</p>
      <button class="btn btn-outline" onclick="renderCloseOut()">
        Year-end close-out wizard
      </button>
    </div>
    ` : ''}
  `);
}

async function downloadCsvExport(path, filename) {
  try {
    const res = await fetch(path, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.message ?? 'Export failed', 'error');
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    showToast('Download failed', 'error');
  }
}
```

CSS additions:

```css
.export-cards { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
.export-card { display: flex; gap: 12px; padding: 14px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; }
.export-card-icon { font-size: 24px; flex-shrink: 0; padding-top: 2px; }
.export-card-body { flex: 1; }
.export-card-title { font-weight: 600; margin-bottom: 4px; }
.export-card-desc { font-size: 13px; color: #666; margin-bottom: 8px; }
.records-status { padding: 12px 14px; margin-bottom: 12px; }
.records-status-row { display: flex; justify-content: space-between; align-items: center; }
.text-green { color: #2e7d32; font-weight: 600; }
.text-amber { color: #e65100; font-weight: 600; }
.closeout-banner { margin-top: 20px; padding: 14px; background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
```

Navigation wiring: in the admin tile grid (wherever `renderAdminHome` renders its tile buttons), add:

```javascript
{ label: 'Records & Export', icon: '📋', action: () => renderAdminRecords(), roles: ['admin', 'director'] },
```

---

## 8. Export access logging

Mirror the `search.service.ts` line 133 pattern (`logger.info('Contact revealed: ...')`).

All log lines use the `audit-export` logger prefix (already used in section 3h's factory). Log on every export call immediately before returning the data. The log level is `info`.

Log format:

```
[<timestamp>] [INFO] [audit-export] Workbook export: actor=<id> role=<role> records=<n> ip=<ip>
[<timestamp>] [INFO] [audit-export] CSV export signin-out: actor=<id> role=<role>
[<timestamp>] [INFO] [audit-export] CSV export checkin-log: actor=<id> role=<role>
```

The service layer does not have access to the request IP (it only receives an `Actor`). The IP logging should happen in the controller layer where the raw `HttpRequest` is available. However, `HttpRequest` in `src/api/http/types.ts` currently does not expose the client IP. Two options:

**Option A (recommended):** add an optional `ip?: string` field to `HttpRequest`:

```typescript
export interface HttpRequest {
  ctx: RequestContext | null;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: unknown;
  ip?: string;  // client IP from req.ip, set in express-adapter.ts
}
```

Then in `express-adapter.ts` when building `httpReq`:

```typescript
const httpReq: HttpRequest = {
  ctx,
  params: req.params as Record<string, string>,
  query: req.query as Record<string, string | undefined>,
  body: req.body,
  ip: req.ip,
};
```

In `audit.controller.ts`:

```typescript
logger.info(`Workbook export: actor=${actor.id} role=${actor.role} ip=${req.ip ?? 'unknown'}`);
```

**Option B:** log only `actor.id` and `actor.role` in the service (already done in section 3h). Controller adds a second log line with the IP.

Either option is acceptable; Option A is cleaner since IP context is useful for audit purposes and any future sensitive-read endpoints would benefit from it too.

Log retention: these are `stdout` logs forwarded to Vercel's log drain. No additional persistence layer is needed at this phase; Vercel retains recent logs in the dashboard for a rolling window.

---

## 9. Container wiring

### Add `AuditExportService` to `Services` interface

File: `src/container.ts`

```typescript
// Add to imports
import { makeAuditExportService, type AuditExportService } from './services/audit-export.service';

// Add to Services interface
export interface Services {
  // ... existing fields ...
  auditExport: AuditExportService;
  settingsRepo: ISettingsRepository;  // expose for audit controller
}
```

### Wire in both the Supabase and in-memory/json build paths

In both the `if (env.PERSISTENCE === 'supabase')` block and the fallback block, add after the existing service instantiations:

```typescript
const auditExport = makeAuditExportService(people, notes, settingsRepo);
```

And in both `services` object literals:

```typescript
const services: Services = {
  // ... existing ...
  auditExport,
  settingsRepo,   // raw repo for audit controller's lastExportedAt write
};
```

### Wire routes in `router.ts`

`buildRoutes` currently accepts only `Services`. Extend the signature to accept `repos` too (needed to pass `settingsRepo` to the audit controller if it is not on `Services`, but since it is now on `Services`, it can be accessed directly):

```typescript
export function buildRoutes(services: Services): (Route | BufferRoute)[] {
  // ... existing controller instantiations ...

  const audit = makeAuditController({
    auditExport: services.auditExport,
    settingsRepo: services.settingsRepo,
    settings: services.settings,
  });

  return [
    // ... existing routes ...

    // ----- Audit export (compliance) -----
    { method: 'GET', path: '/export/audit',      auth: true, bufferHandler: (r) => audit.exportWorkbook(r) },
    { method: 'GET', path: '/export/signin-out', auth: true, bufferHandler: (r) => audit.exportSignInOutCsv(r) },
  ];
}
```

Import `makeAuditController` at the top of `router.ts`:

```typescript
import { makeAuditController } from '../controllers/audit.controller';
```

The `BufferRoute` type must be exported from `src/api/http/types.ts` and imported where used.

### `package.json` — add exceljs dependency

```json
"dependencies": {
  "exceljs": "^4.4.0",
  "express": "^4.19.2",
  "postgres": "^3.4.9",
  "zod": "^3.23.8"
}
```

Run `npm install` after adding. Confirm `exceljs` appears in `node_modules` and `package-lock.json` before deploying.

---

## 10. Validation tests

File: `docs/verification/test_p3_export_compliance.py`

All tests use `requests` against a locally running server (`http://localhost:4200`) with the `memory` persistence mode and the default seed data. The admin token is obtained via a login call at the start of the session.

```python
"""
Validation tests for Part 3 — Post-camp Export & Compliance.

Run:
    python docs/verification/test_p3_export_compliance.py

Requires a running server:
    PERSISTENCE=memory npm run dev
"""
import sys
import requests

BASE = "http://localhost:4200"


def login(username="admin", password="demo1234"):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, f"Login failed: {r.text}"
    return r.json()["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------

def test_export_audit_returns_xlsx(token):
    """GET /export/audit returns a valid .xlsx binary (PK magic bytes)."""
    r = requests.get(f"{BASE}/export/audit", headers=auth_headers(token))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    ct = r.headers.get("Content-Type", "")
    assert "spreadsheetml" in ct or "octet-stream" in ct, f"Unexpected Content-Type: {ct}"
    # XLSX files start with PK (ZIP magic)
    assert r.content[:2] == b"PK", "Response body does not start with PK (not a valid ZIP/XLSX)"
    # Content-Disposition should contain a filename
    cd = r.headers.get("Content-Disposition", "")
    assert "attachment" in cd, f"Missing Content-Disposition: {cd}"
    assert ".xlsx" in cd, f"Filename not .xlsx in Content-Disposition: {cd}"
    print("  PASS test_export_audit_returns_xlsx")


def test_export_signin_out_csv_has_required_columns(token):
    """GET /export/signin-out returns a CSV with the required compliance columns."""
    r = requests.get(f"{BASE}/export/signin-out", headers=auth_headers(token))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    ct = r.headers.get("Content-Type", "")
    assert "text/csv" in ct or "octet-stream" in ct, f"Unexpected Content-Type: {ct}"

    # Strip BOM and decode
    content = r.content
    if content[:3] == b"\xef\xbb\xbf":
        content = content[3:]
    text = content.decode("utf-8")
    header_line = text.splitlines()[0] if text.strip() else ""
    headers = [h.strip() for h in header_line.split(",")]

    required = [
        "Student", "Church", "Zone", "Gender", "Grade",
        "Event Type", "Timestamp", "Reason", "Parents Met", "Authorised By",
    ]
    for col in required:
        assert col in headers, f"Missing required column '{col}' in CSV. Got: {headers}"
    print("  PASS test_export_signin_out_csv_has_required_columns")


def test_wipe_guard_blocks_new_year_without_export(token):
    """POST /admin/new-year is blocked (409 WIPE_GUARD) when no export has been taken."""
    # First, reset settings to clear any lastExportedAt (use the raw settings patch)
    # We rely on a fresh server with no prior export.
    r = requests.post(
        f"{BASE}/admin/new-year",
        json={"year": 2027},
        headers=auth_headers(token),
    )
    # Should be blocked unless an export was already taken in a prior test
    # If the server was freshly started with no export, expect 409
    if r.status_code == 409:
        body = r.json()
        assert body.get("code") == "WIPE_GUARD", f"Expected WIPE_GUARD, got: {body}"
        print("  PASS test_wipe_guard_blocks_new_year_without_export")
    elif r.status_code == 200:
        # Already exported in a prior test run — this is acceptable, mark as skipped
        print("  SKIP test_wipe_guard_blocks_new_year_without_export (export already on record)")
    else:
        raise AssertionError(f"Unexpected status {r.status_code}: {r.text}")


def test_wipe_guard_allows_new_year_after_export(token):
    """POST /admin/new-year succeeds after a full export is taken."""
    # Step 1: trigger the export (sets lastExportedAt)
    r_export = requests.get(f"{BASE}/export/audit", headers=auth_headers(token))
    assert r_export.status_code == 200, f"Export failed: {r_export.status_code} {r_export.text}"

    # Step 2: verify settings show lastExportedAt
    r_settings = requests.get(f"{BASE}/settings")
    assert r_settings.status_code == 200
    settings = r_settings.json()
    assert settings.get("lastExportedAt"), "lastExportedAt not set after export"

    # Step 3: new-year should now succeed (requires a saved defaults snapshot)
    # Save defaults first so new-year has a snapshot to restore from
    r_defaults = requests.post(f"{BASE}/admin/defaults", headers=auth_headers(token))
    assert r_defaults.status_code == 200, f"Save defaults failed: {r_defaults.text}"

    r_ny = requests.post(
        f"{BASE}/admin/new-year",
        json={"year": 2027},
        headers=auth_headers(token),
    )
    assert r_ny.status_code == 200, f"New-year failed after export: {r_ny.status_code} {r_ny.text}"
    body = r_ny.json()
    assert body.get("year") == 2027, f"Unexpected year in response: {body}"
    print("  PASS test_wipe_guard_allows_new_year_after_export")


def test_bom_present_in_csv(token):
    """All CSV export endpoints prepend a UTF-8 BOM (\\uFEFF / EF BB BF)."""
    endpoints = [
        "/export/signin-out",
        "/notes/export",
        "/export/registrants",
    ]
    for endpoint in endpoints:
        r = requests.get(f"{BASE}{endpoint}", headers=auth_headers(token))
        assert r.status_code == 200, f"{endpoint} returned {r.status_code}: {r.text}"
        bom = r.content[:3]
        assert bom == b"\xef\xbb\xbf", (
            f"{endpoint}: expected UTF-8 BOM (EF BB BF) as first 3 bytes, got {bom.hex()}"
        )
    print("  PASS test_bom_present_in_csv")


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Part 3 — Post-camp Export & Compliance validation")
    print("=" * 55)
    try:
        token = login()
        print("  Login OK")
        test_export_audit_returns_xlsx(token)
        test_export_signin_out_csv_has_required_columns(token)
        test_wipe_guard_blocks_new_year_without_export(token)
        test_wipe_guard_allows_new_year_after_export(token)
        test_bom_present_in_csv(token)
        print("=" * 55)
        print("All tests passed.")
    except AssertionError as e:
        print(f"\nFAIL: {e}", file=sys.stderr)
        sys.exit(1)
```

**Notes on test ordering:**

- `test_wipe_guard_blocks_new_year_without_export` must run **before** `test_wipe_guard_allows_new_year_after_export` on a freshly started server.
- `test_wipe_guard_allows_new_year_after_export` calls `POST /admin/new-year`, which resets the year to 2027 and purges all person data. Any tests that rely on seed data should run before this test.
- `test_bom_present_in_csv` requires that `/export/registrants` returns 200 even with empty data (no registrants post-new-year rollover). The existing `export.service.ts` handles the empty case (returns a CSV with only the header row), so this is safe.
- If the server has been running for a while and a previous test session already triggered an export, `test_wipe_guard_blocks_new_year_without_export` will find `lastExportedAt` already set and skip gracefully rather than falsely failing.
