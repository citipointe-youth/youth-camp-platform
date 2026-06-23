# Implementation Plan — Youth Camp Platform Upgrades

> Root: `/home/tlestrange/Projects/AI Exploration/Project 2 - App Updates/my-youth-camp-master`
> Covering specs: P0 Presence Model, P1 Check-in UX, P2 Admin Laptop, P3 Export & Compliance, P4 First-aid Role
>
> **Revision notes (2026-06-23):** Reviewed against actual codebase. Corrections applied:
> - `checkInsDue` dashboard fix is **mandatory**, not optional — `isCamper()` includes `departed` persons
> - `checkin.service.ts` filter replacement must retain the `canAccessPerson` guard
> - `CamperDto` widening: `consentMedical` mapping pattern made explicit
> - Sprint 2 RBAC: `canAccessChurch`, `canAccessPerson`, and `canSendNotification` all have `firstAid` gaps — each called out explicitly
> - Sprint 4 now has a **mandatory** migration `006_add_last_temp_passwords.sql` (settings table uses individual columns, not JSONB)
> - Sprint 5 migration renumbered to `007_add_last_exported_at.sql`; rollback instructions added
> - Migration rollback instructions added for both new migrations
> - `exceljs` usage corrected from `require('exceljs')` to ESM import (compiler transforms to CJS)
> - Wipe guard: full grep of affected test/call sites added to Sprint 5
> - Sprint 6 corrected: not fully independently deployable (Passwords tab depends on Sprint 4 `lastTempPasswords`)
> - `force: true` policy resolved: use a confirmation string, not a bare boolean
> - Settings Supabase table name is `settings` (not `camp_settings`)
> - `departed` lifecycle documented: no current write path; `atCamp === false` filter handles it correctly

---

## 0. Pre-flight checklist

Before any sprint branch is cut, verify the baseline is clean:

1. `npm install && npm run typecheck && npm run test` — must show 186 passing tests, zero type errors.
2. `npm install exceljs@^4.4.0 --save` — confirm it lands in `dependencies` (not `devDependencies`). ExcelJS ships its own CJS build and type declarations; no `@types/exceljs` needed.
3. Check Vercel bundle size after installing exceljs: run `du -sh node_modules/exceljs`. The 50 MB Vercel serverless limit applies to the traced output bundle, not the full `node_modules`. ExcelJS traces at ~1.5 MB; **confirm with a local `vercel build --debug` dry-run before cutting Sprint 5.** This is a blocking gate, not an advisory check.
4. Create feature branch `upgrade/2026` from the current `master` HEAD.
5. Grep the codebase for every role switch/case and if-chain before writing a line of code:
   ```
   grep -rn "firstAid\|church.*zoneLeader\|role ===\|role !==\|switch.*role\|ACTOR\.role" \
     src/ public/index.html
   ```
   Record every file that contains role logic. This list is the authoritative checklist for the P4 exhaustiveness pass (Sprint 2). Pay special attention to `canAccessChurch` and `canAccessPerson` — these are `switch` statements with `default: return false` and are **not** caught by the TypeScript exhaustiveness check on `ROLE_PERMISSIONS`.
6. Confirm `.gitignore` still has `/data/` (leading slash). An unanchored `data/` would drop `src/data/seed.ts` from git.
7. Confirm `tsconfig.json` still emits `module: CommonJS, moduleResolution: Node`. Do not change these.
8. **`departed` lifecycle audit:** Run `grep -rn "'departed'\|\"departed\"\|lifecycle.*depart\|depart.*lifecycle" src/ public/index.html`. At the time this plan was written, `departed` is in `AT_CAMP_LIFECYCLES` (so `isCamper()` returns true for it) but no service or controller writes `lifecycle = 'departed'`. It is defined for future use. Confirm this is still the case before Sprint 1 — if a `depart` write path has been added since, the roster filter spec below must be revisited.

---

## 1. Dependency map

```
P0 (presence fix)
 ├── blocks P1  (optimistic queue relies on stable atCamp; "Still need" count uses checkInsDue)
 ├── blocks P3  (signOutHistory/atCamp semantics must be correct before compliance export is built)
 └── blocks P4  (Medical Watch uses atCamp===true; casualty card presence section reads atCamp)

CamperDto widening  (P4 spec § 3 — add otherMedications, medicareNumber, parentRelation, gender, consentMedical)
 ├── shared by P1  (RosterEntry DTO extension also needs gender; do CamperDto ONCE here)
 └── shared by P4  (casualty card primary consumer)
 NOTE: do CamperDto widening in Sprint 2; P1 RosterEntry is a separate DTO (person.dto.ts toRosterEntry)
       that can land in Sprint 3 without waiting for CamperDto.

Responsive CSS breakpoint (P2 § 2)
 ├── enables P1 oversight pulse to look correct on 980px+ screens (Sprint 6)
 └── enables P3 records screen to use two-column layout on admin laptop (Sprint 5)

Export/compliance (P3)
 └── close-out guided handoff (P3 § 5b) wraps new-year R9 temp passwords (P2 § 7)
     — lastTempPasswords written by newYear, consumed by export workbook Passwords tab

Wipe guard (P3 § 5a)
 └── requires lastExportedAt on CampSettings (P3 § 2a) and migration 007

Migration sequencing
 └── 006_add_last_temp_passwords.sql  →  Sprint 4 (must apply before deploying newYear changes)
 └── 007_add_last_exported_at.sql     →  Sprint 5 (must apply before deploying wipe guard)
```

### Sprint sequencing enforced by the dependency map

| Sprint | What it unlocks |
|--------|----------------|
| S1 P0 | All other sprints can branch off |
| S2 First-aid | CamperDto widening available for S3 |
| S3 Check-in UX | Roster DTO enriched; optimistic queue safe |
| S4 Admin laptop | Responsive shell ready for S5/S6; migration 006 applied |
| S5 Export | wipe guard + xlsx workbook; close-out wraps R9 from S4; migration 007 applied |
| S6 Polish | All foundation in place; Passwords tab requires S4 `lastTempPasswords` live in prod |

---

## 2. Six sprints — each independently deployable to Supabase/Vercel

### Sprint 1 — Foundation (P0 presence fix)

**Goal:** fix the critical presence-model bug so daily check-out no longer sets `atCamp = false`. All subsequent sprints depend on this being merged and deployed first.

**Root cause (confirmed from code):**

`withCheckIn` in `person-lifecycle.ts` calls `applyCheckIn(person, entry.type)`. When `entry.type === 'out'`, `applyCheckIn` returns `{ lifecycle: 'checked_out', atCamp: false }`. This is correct behaviour for an *attendance* sign-out (a genuine camp departure), but `withCheckIn` is used for *daily session* check-ins — a routine evening check-out should never change presence state. The fix is to make `withCheckIn` append the `CheckInEntry` only and never call `applyCheckIn`.

**Important: `isCamper()` includes `departed`**

`AT_CAMP_LIFECYCLES` = `['arrived', 'checked_out', 'departed']`. `isCamper()` returns true for all three. `departed` is defined in the enum and entity but currently has no write path in any service. `atCamp` is the reliable runtime indicator of who is physically present. The dashboard and roster fixes below both use `atCamp === true` as the filter — this correctly handles `departed` (who will have `atCamp: false`) regardless of whether a write path is added in future.

**Backend changes:**

- `src/services/person-lifecycle.ts` — rewrite `withCheckIn` to append `CheckInEntry` only. Remove the `applyCheckIn` call; do not touch `lifecycle` or `atCamp`. (`applyCheckIn`, `applySignOut`, `applySignIn`, and `withSignEvent` are unchanged — they remain the correct path for attendance sign-out/in.)

  New implementation:
  ```ts
  export function withCheckIn(person: Person, entry: CheckInEntry, now: string): Person {
    return {
      ...person,
      checkInHistory: [...person.checkInHistory, entry],
      updatedAt: now,
    };
  }
  ```

- `src/services/checkin.service.ts` — change line 81 roster filter. Current:
  ```ts
  const scoped = allPeople.filter((p) => isCamper(p) && canAccessPerson(actor, p));
  ```
  Replace with:
  ```ts
  const scoped = allPeople.filter((p) => p.atCamp && canAccessPerson(actor, p));
  ```
  The `canAccessPerson` guard **must be retained** — removing it would expose cross-church data. Remove the now-unused `isCamper` import from this file only if `isCamper` is not used elsewhere in the file.

- `src/services/person.service.ts` — add guard in `checkIn`: throw `BadRequestError('Cannot check in a person who is not currently at camp')` if `!person.atCamp`. Remove stale "D2 promotion" comment if present.

- `src/services/dashboard.service.ts` — the `checkInsDue` computation at lines 167–173 currently iterates `allCampers`, which is `isCamper(p) && canAccessPerson(actor, p)`. Because `isCamper` includes `departed` persons (who have `atCamp: false`), this count is inflated. **This fix is mandatory, not optional.** Add:

  ```ts
  const atCampNow = allCampers.filter((p) => p.atCamp);
  ```

  Then replace `allCampers.filter(...)` in the `checkInsDue` lambda with `atCampNow.filter(...)`. `totalAtCamp` on line 139 (`allCampers.filter((p) => p.atCamp).length`) is already correct and needs no change.

- `src/utils/csv.ts` — prepend UTF-8 BOM (`﻿`) in `toCsvString` so existing CSV exports open correctly in Excel. Do this in Sprint 1 to avoid a double-BOM risk when `AuditExportService` is built in Sprint 5. The Sprint 5 audit service CSV methods must **not** add a second BOM prefix.

**SPA changes:**

- `public/index.html` `doCheck` — move `RENDER.checkin()` outside the try/catch so the roster always refreshes after both success and error. This ensures a 400 (person no longer at camp) triggers a roster refresh that removes the stale row.

**Tests:**

- `src/services/person-lifecycle.test.ts` — replace the existing `describe('withCheckIn')` block entirely with the new block from P0 spec §6. Add the new `describe('withSignEvent')` block from the same spec. The existing tests for `withCheckIn` WILL fail before this update — update them first, then run the suite.
- `src/services/checkin.service.test.ts` — add a test confirming that a person with `atCamp: false` (e.g. lifecycle `departed`) is excluded from the session roster.
- Run `npm run typecheck && npm run test` to confirm passing count.

**Migrations:**

- No schema change needed for P0 (atCamp and lifecycle are already modelled correctly on the Person entity).

**Validation scripts:**

- Add `docs/verification/test_p0_presence.py` with the three Python validation functions from P0 spec §7: `test_daily_checkout_does_not_remove_from_headcount`, `test_departed_camper_not_on_roster`, `test_checkin_blocked_for_non_atcamp`.

---

### Sprint 2 — First-aid role

**Goal:** introduce the `firstAid` role end-to-end: enum, RBAC, CamperDto widening, new service method, two new routes, SPA tab set, casualty card, Medical Watch list, and access logging.

**Backend changes:**

- `src/core/types/enums.ts` — add `'firstAid'` to `USER_ROLES` tuple (line 11). After this change, `npm run typecheck` will immediately error on the missing key in `ROLE_PERMISSIONS` — this is intentional and is the next step.

- `src/services/access-control.ts` — four changes required; all must be made together:

  1. **`ROLE_PERMISSIONS`** — add `firstAid` entry: permissions `camper:read`, `camper:read:sensitive`, `checkin:write`. This is caught by the `Record<UserRole, Set<Action>>` exhaustiveness check at compile time.

  2. **`canAccessPerson`** — this function uses a `switch` with `default: return false`. It is **not** covered by the TypeScript exhaustiveness check. Add `case 'firstAid': return true;` explicitly. Without this, a firstAid user cannot look up any camper.

  3. **`canAccessChurch`** — same issue: `switch` with `default: return false`. Add `case 'firstAid': return true;` alongside `admin`/`director`. Without this, the `GET /accounts/churches` call (used by the firstAid search screen) returns 403.

  4. **`canSendNotification`** — this function has explicit `admin || director` checks and a `zoneLeader` check. A firstAid actor correctly returns `false` for all notification scopes via the existing default paths. No change required here. **Document this as intentional** with a comment so it is not treated as a bug in future.

- `src/api/dto/person.dto.ts` — widen `CamperDto` interface: add `otherMedications`, `medicareNumber`, `parentRelation`, `consentMedical`, `gender` fields. Update `toCamperDto` factory function.

  **Consent mapping pattern** — match the existing `toRegistrantDto` pattern exactly:
  ```ts
  consentMedical: p.consents.medical?.granted ?? false,
  ```
  Do not do `p.consentMedical` (that field does not exist on `Person`). Consents are stored in `p.consents: Record<ConsentType, { granted: boolean; timestamp: ... }>`.

  All new fields should map to `null` (not `undefined`) for absent values, consistent with the rest of `toCamperDto`.

- `src/services/person.service.ts` — add `listMedicalWatch(actor)` method to `PersonService` interface and `makePersonService` factory. Filter: `isCamper(p) && p.atCamp && canAccessPerson(actor, p)` with at least one medical flag set (`medicalConditions.length > 0 || otherMedications != null`).

- Controller (`src/api/controllers/person.controller.ts` or equivalent camper controller) — add `getMedicalWatch` handler (maps result through `toCamperDto`) and `revealMedicare` handler (asserts `camper:read:sensitive`, logs, returns 204).

- `src/api/http/router.ts` — register two new routes. `GET /campers/medical` must be declared **before** `GET /campers/:id` to prevent the parameterised route matching the literal `"medical"` segment. `POST /campers/:id/reveal-medicare` for the audit-trail endpoint.

- Medical access logging in the `getCamper` controller handler: log `medical_access` for `firstAid` role or when the person has `otherMedications` or `medicareNumber` populated.

**SPA changes:**

- `public/index.html` — `USER_ROLES` / `leaderRoles` constants and `roleOpts` string in `renderAdminAccounts`: add `'firstAid'` to `leaderRoles` array; add `<option value="firstAid">First aid</option>` to `roleOpts`.
- `buildTabs` function — add `if (ACTOR.role === 'firstAid')` branch returning the three-tab set: Home, Search, Schedule.
- `RENDER.home` — add branch at top of at-camp path dispatching `renderHomeFirstAid()` for `firstAid` role.
- Add functions: `renderHomeFirstAid`, `faHomeSearch`, `renderSearchFirstAid`, `runFaSearch`, `loadMedicalWatch`, `openCasualtyCard`, `revealMedicare`, `revealLeaderPhone`.
- `RENDER.search` — add dispatch: `if (ACTOR.role === 'firstAid') { await renderSearchFirstAid(); return; }` at top.

**Tests:**

- Add `docs/verification/test_p4_firstaid.py` with the six validation functions from P4 spec §10.
- Add `firstaid` seed account to `src/data/seed.ts` (username: `firstaid`, password: `demo1234`, role: `firstAid`) so validation tests have a stable fixture.
- Run `npm run typecheck` — must pass (exhaustiveness of `ROLE_PERMISSIONS` now confirmed by the compiler).

**Sprint 2 deployment note — SPA/backend ordering:**

Sprint 3 SPA changes depend on the enriched `RosterEntry` DTO existing in the backend. The Sprint 2 backend (`CamperDto`) and Sprint 3 backend (`RosterEntry`) touch different interfaces in the same `person.dto.ts` file but can be developed in parallel on separate branches. However: **do not deploy the Sprint 3 SPA changes until the Sprint 3 backend DTO change is merged and live.** If the SPA ships ahead of the backend, the check-in screen will silently receive `undefined` for `gender`, `grade`, and `medicalFlag`.

---

### Sprint 3 — Check-in UX

**Goal:** optimistic tap + offline queue, two-pile roster, whole-row taps, undo toast, confirm-before-check-out, quick-note shortcut, urgent notice interstitial, "My day" home, global search icon, tel: links.

**Backend changes:**

- `src/api/dto/person.dto.ts` — add `gender`, `grade`, `medicalFlag` to `RosterEntry` interface and `toRosterEntry` factory. (Small single-file change; deployable alone; unblocked from Sprint 2.)
- No new endpoints, no new npm packages, no schema changes.

**SPA changes (all in `public/index.html`):**

- Remove the `Promise.all([..., api('/campers')])` two-fetch pattern from `renderCheckin`. Replace with single `api('/checkin/sessions/'+SEL_SESSION+'/status')` fetch. Derive `gender`, `grade`, `medicalFlag` from the enriched `RosterEntry` DTO directly.
- Add module-level state: `CHECKIN_QUEUE`, `_draining`, `_onlineHandlerAdded`, `_undoTimer`, `_undoCamperId`, `_undoType`, `_lastRoster`.
- Add functions: `_queueEntry`, `drainQueue`, `_optimisticState`, `_updateSyncDots`, `_markSynced`, `_performCheck`, `_showUndoToast`, `undoCheck`, `confirmCheckOut`.
- Rewrite `doCheck` to use the optimistic path.
- Replace the flat `list.map(...)` roster render with the two-pile layout (due/done sections, `rowHtml` helper, collapsible `<details>` for the done section, completion banner when dueShown===0).
- Add `notePrompt` and `submitNote` functions (currently referenced but undefined).
- Add `renderOversightPulse` (director/zoneLeader/admin only), `showZoneDrilldown`, `renderMyDay` (church role), `renderHomeExtras` dispatcher.
- Add `checkUrgentNotices` + `_ackUrgent` functions. Wire call at end of `renderHomeAtCamp`.
- Add global search icon button in `.bar` and hide/show in `updateModeUI`.
- Add `telLink` helper. Apply to all phone number display locations in `renderCamper`, `renderSearch`, search contact reveal cards, and the first-day sign-in leader list.
- CSS additions: `.sync-dot` states (pending/syncing/synced with pulse animation), `@keyframes pulse`, `bar7` progress bar (if not already present).

**Tests:**

- `src/services/checkin.service.test.ts` — add a test that `getSessionStatus` returns `gender`, `grade`, `medicalFlag` in each `RosterEntry`.
- Add `docs/verification/test_p1_checkin_ux.py` with the two validation functions from P1 spec §10.

---

### Sprint 4 — Admin laptop interface

**Goal:** responsive CSS breakpoint, side-nav, two-column forms, sticky save bar, dryRun import with preview, phantom-church guard, bulk church import, date pickers, timezone dropdown, guided setup wizard, new-year R9 temp passwords.

**Backend changes:**

- `src/utils/temp-password.ts` — new file. `generateTempPassword()` using `node:crypto` `randomBytes`.

- `src/services/import.service.ts` — add `dryRun` field to `ImportOptionsSchema` and `ImportResult`. Guard `saveMany` call: skip when `dryRun: true`. Fix `resolveChurch`: in dry-run mode emit a warning and return a sentinel ID instead of writing to `churchRepo`.

- `src/services/church-import.service.ts` — new file. `makeChurchImportService(userRepo, churchRepo)` implementing `importChurchesCsv` (dry-run-aware, idempotent on username+code, hashes passwords via `hashPassword`, writes both `Church` and `User` records).

- `src/api/controllers/church-import.controller.ts` — new file. Single `run` method delegating to `churchImport.importChurchesCsv`.

- `src/container.ts` — wire `churchImport: makeChurchImportService(repos.users, repos.churches)` in both the Supabase and in-memory build paths.

- `src/api/http/router.ts` — add `POST /import/churches` route pointing to `churchImportCtrl.run`.

- `src/services/admin.service.ts` — import `generateTempPassword` and `hashPassword`. Widen `newYear` return type to include `tempPasswords`. After restoring accounts from snapshot, iterate each non-admin restored user, generate a temp password, hash and save it, accumulate in `tempPasswords`. Persist `tempPasswords` to `CampSettings.lastTempPasswords` via `settingsRepo.saveSingleton`.

- `src/core/entities/settings.ts` — add `lastTempPasswords?: Array<{ username: string; tempPassword: string }> | null` field.

- `src/repositories/supabase/supabase.settings.ts` — add `last_temp_passwords` to:
  - `toSettings` mapper: `lastTempPasswords: (r['last_temp_passwords'] as Array<...> | null) ?? null`
  - `settingsCols` function: `last_temp_passwords: s.lastTempPasswords ?? null`
  - `UPDATE_COLS` array: add `'last_temp_passwords'`

**SPA changes (`public/index.html`):**

- CSS block — add the `@media(min-width:980px)` wide-layout block (strictly additive; nothing before the media query is modified). Also add `.wide-nav { display:none; }` outside the media query so the element is invisible on phone.
- JS — add `_initWideNav`, `_renderWideNav`, monkey-patch the `paint` wrapper to call `_renderWideNav()` after every screen render.
- Import flow — replace `adminUpload()` with the 3-step flow: dry-run preview call, `_renderImportPreview`, `_confirmImport`, `_showImportStep`.
- Add `RENDER.adminChurchImport`, `churchImportUpload`, `_renderChurchImportPreview`, `_confirmChurchImport`.
- Replace `RENDER.adminSettings` and `saveSettings` with date-picker-based versions. Add helpers: `_datesInRange`, `_tzSelect`, `_getSelectedTz`, `_updateDaysPreview`, `_daysNudgeHtml`.
- Add `WIZARD_STEPS` config, `RENDER.adminWizard`, `_goWizardStep`, `_wizardChecklistHtml`. Update `RENDER.admin` to render the setup checklist and link to the wizard and to the new `adminChurchImport` screen.
- Update `adminNewYear()` to display temp passwords from the response.
- Add Ctrl+S keyboard shortcut listener in `_initWideNav`.

**Migrations — Sprint 4 (mandatory):**

The Supabase `settings` table uses individual columns (not JSONB). The new `lastTempPasswords` field requires a database migration before the Sprint 4 backend can persist to Supabase.

- `supabase/migrations/006_add_last_temp_passwords.sql`:
  ```sql
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_temp_passwords jsonb;
  ```
  **Rollback:** `ALTER TABLE settings DROP COLUMN IF EXISTS last_temp_passwords;`

  Apply via `supabase db push` or directly via `psql` before deploying Sprint 4 to production.

**Tests:**

- Add `docs/verification/test_p2_admin.py` with the four validation functions from P2 spec §8.
- Run `npm run typecheck` — the widened `newYear` return type and new service interfaces must pass.

---

### Sprint 5 — Export & compliance

**Goal:** multi-tab xlsx workbook, sign-in/out compliance CSV, daily check-in log CSV, wipe guard on new-year/reset, Records & Export screen, close-out guided handoff, export access logging.

**Package install:**

- `npm install exceljs@^4.4.0 --save` (if not done at pre-flight — do it here at latest).

**Backend changes:**

- `src/core/entities/settings.ts` — add `lastExportedAt?: string | null`.

- `src/core/errors/app-error.ts` — add `WipeGuardError` (409 / `WIPE_GUARD`).

- `src/services/admin.service.ts` — add `assertExportedOrForce` helper. Apply wipe guard in both `reset` and `newYear`. Accept `opts?: { force?: boolean; confirmWipe?: string }` on both methods.

  **`force: true` policy (resolved):** A bare `force: true` boolean is too easy to trigger accidentally via an API call or script. Require a confirmation string:
  ```ts
  if (opts?.force && opts.confirmWipe === 'I understand this cannot be undone') {
    // bypass guard
  }
  ```
  The SPA close-out flow's 3-step UI already provides the confirmation context. The backend string check prevents accidental bypass by automated scripts that pass `force: true` without genuine intent.

- `src/api/controllers/admin.controller.ts` — forward `force` and `confirmWipe` from request body in `reset` and `newYear` handlers.

- **Wipe guard and existing tests — mandatory pre-Sprint 5 sweep:**

  Before writing any Sprint 5 code, run:
  ```
  grep -rn "admin/new-year\|admin/reset\|\.newYear\|\.reset\b" src/ docs/
  ```
  Every call site found (including vitest test setup/teardown and Python validation scripts) that calls `newYear` or `reset` must be updated to pass `force: true, confirmWipe: 'I understand this cannot be undone'` in the body, or must perform an export first. The `admin.characterisation.test.ts` file is a known affected file.

- `src/services/audit-export.service.ts` — new file. `makeAuditExportService(personRepo, noteRepo, settingsRepo)`. Implements `exportMasterWorkbook`, `exportSignInOutCsv`, `exportCheckInLogCsv`.

  **ExcelJS import pattern** — use ESM import syntax; the CJS tsconfig transforms it correctly:
  ```ts
  import ExcelJS from 'exceljs';
  ```
  Do **not** use `require('exceljs')` — under strict TypeScript this returns `any` and loses type safety.

  **BOM guard** — `exportSignInOutCsv` and `exportCheckInLogCsv` must call `toCsvString` (which already adds the BOM from Sprint 1). Do **not** prepend an additional `'﻿'` prefix in these methods.

  Workbook tab order: Summary → Attendees → Sign-in/Sign-out Log → Daily Check-in Log → Notes & Testimonies. (The Passwords tab from Sprint 4's `lastTempPasswords` is added in Sprint 6.)

- `src/api/http/types.ts` — add `BufferRoute` interface and optional `ip?: string` on `HttpRequest`.

- `src/api/http/express-adapter.ts` — handle `BufferRoute` entries (check `'bufferHandler' in route`, set `Content-Type`/`Content-Disposition`, call `res.send(buffer)`). Also set `httpReq.ip = req.ip` for audit logging. Test locally: `curl -o test.xlsx http://localhost:4200/export/audit -H "Authorization: Bearer ..."` and confirm first two bytes are `PK` (ZIP magic number).

- `src/api/controllers/audit.controller.ts` — new file. `makeAuditController`. `exportWorkbook` writes `lastExportedAt` to settings on success and logs `actor`/`role`/`ip`. `exportSignInOutCsv` likewise.

- `src/container.ts` — add `auditExport: makeAuditExportService(...)` and expose `settingsRepo` on `Services` interface for the audit controller.

- `src/api/http/router.ts` — add `BufferRoute` entries: `GET /export/audit` and `GET /export/signin-out`. Import `makeAuditController`.

**SPA changes (`public/index.html`):**

- Add `renderAdminRecords` function and its CSS (`.export-cards`, `.export-card`, `.records-status`, `.closeout-banner`, `.text-green`, `.text-amber`).
- Add `renderCloseOut`, `onCloseOutConfirmChange`, `downloadAuditExport`, `doNewYear` functions and the close-out CSS (`.closeout-steps`, `.closeout-step`, `.step-badge`, `.step-body`, `.checkbox-label`, `.btn-danger`).
- `doNewYear` must send `{ force: true, confirmWipe: 'I understand this cannot be undone' }` only after the user has completed all three close-out steps.
- Add `downloadCsvExport` helper (used for CSV fallback exports).
- Wire "Records & Export" tile into `RENDER.admin` (visible for `admin` and `director`).

**Migrations — Sprint 5 (mandatory):**

- `supabase/migrations/007_add_last_exported_at.sql`:
  ```sql
  ALTER TABLE settings ADD COLUMN IF NOT EXISTS last_exported_at timestamptz;
  ```
  **Rollback:** `ALTER TABLE settings DROP COLUMN IF EXISTS last_exported_at;`

  Apply before deploying Sprint 5 to production.

- Update `src/repositories/supabase/supabase.settings.ts`:
  - `toSettings`: `lastExportedAt: (r['last_exported_at'] as Date | null)?.toISOString() ?? null`
  - `settingsCols`: `last_exported_at: s.lastExportedAt ?? null`
  - `UPDATE_COLS`: add `'last_exported_at'`

**Tests:**

- Add `docs/verification/test_p3_export_compliance.py` with the five validation functions from P3 spec §10.
- Ensure `npm run typecheck` passes with the new `BufferRoute` type.

---

### Sprint 6 — Polish

**Goal:** oversight pulse board, guided setup wizard completeness, Passwords tab in xlsx, global search icon final wiring, tel: link audit pass, full responsive side-nav for admin on wide.

**Note: Sprint 6 is not fully independently deployable.** The Passwords tab in the xlsx workbook reads `settings.lastTempPasswords`, which is written by the Sprint 4 `newYear` path. Sprint 6 can be deployed to Vercel before Sprint 4 only if the Passwords tab code is omitted — but the recommended approach is to deploy Sprint 6 after Sprint 4 and Sprint 5 are both live.

**Items:**

- `renderOversightPulse` and `showZoneDrilldown` (from Sprint 3) — final QA on wide-screen rendering; ensure zone bars are tap targets on both phone and desktop.
- Guided setup wizard (`RENDER.adminWizard`, `_wizardChecklistHtml`) — verify all five `WIZARD_STEPS.check()` functions produce the correct done/pending state against seed data.
- Passwords tab in xlsx workbook — `audit-export.service.ts`: add the `Temp Passwords` sheet sourced from `settings.lastTempPasswords` (the field written by Sprint 4's `newYear`). Clear `lastTempPasswords` from settings after the export is confirmed (add to `exportMasterWorkbook`).
- Global search icon — verify `id="barSearch"` appears across all roles in at-camp mode; verify it is hidden in pre-camp mode.
- Tel: link audit pass — grep `public/index.html` for all phone-number display patterns; verify `telLink()` is applied to every one.
- Admin side-nav on wide — verify `_renderWideNav` highlights the correct `.wide-nav-item.on` after every screen transition including nested admin screens (`adminSettings`, `adminAccounts`, `adminAccom`, `adminSchedEdit`, `adminData`, `adminChurchImport`).
- Run full 375px (phone) and 1440px (desktop) visual QA pass: both layouts must be fully functional with no broken overflow or hidden elements.

---

## 3. Per-file change summary

| File | Change type | Sprint | Notes |
|------|-------------|--------|-------|
| `src/services/person-lifecycle.ts` | Modify | S1 | Rewrite `withCheckIn`; strip lifecycle/atCamp mutation |
| `src/services/checkin.service.ts` | Modify | S1 | Filter on `p.atCamp && canAccessPerson(actor, p)`; retain the access guard; remove unused `isCamper` import |
| `src/services/person.service.ts` | Modify | S1 + S2 | S1: add atCamp guard in `checkIn`. S2: add `listMedicalWatch` |
| `src/services/dashboard.service.ts` | Modify | S1 | Add `atCampNow`; use it in `checkInsDue` (mandatory — `isCamper` includes `departed`) |
| `src/utils/csv.ts` | Modify | S1 | Prepend UTF-8 BOM in `toCsvString` |
| `src/services/person-lifecycle.test.ts` | Modify | S1 | Replace `withCheckIn` tests; add `withSignEvent` tests |
| `docs/verification/test_p0_presence.py` | New | S1 | Three Python validation functions |
| `src/core/types/enums.ts` | Modify | S2 | Add `'firstAid'` to `USER_ROLES` |
| `src/services/access-control.ts` | Modify | S2 | `firstAid` in `ROLE_PERMISSIONS`; `case 'firstAid': return true` in `canAccessPerson`; `case 'firstAid': return true` in `canAccessChurch`; comment on `canSendNotification` |
| `src/api/dto/person.dto.ts` | Modify | S2 + S3 | S2: widen `CamperDto` + `toCamperDto` (use consent mapping pattern). S3: widen `RosterEntry` + `toRosterEntry` |
| `src/services/person.service.ts` | Modify | S2 | Add `listMedicalWatch` |
| `src/api/controllers/person.controller.ts` | Modify | S2 | Add `getMedicalWatch`, `revealMedicare` handlers; add medical access log in `getCamper` |
| `src/api/http/router.ts` | Modify | S2 + S4 + S5 | S2: two new camper routes (medical before :id). S4: church import route. S5: two buffer routes |
| `src/data/seed.ts` | Modify | S2 | Add `firstaid` seed account |
| `docs/verification/test_p4_firstaid.py` | New | S2 | Six P4 validation functions |
| `src/utils/temp-password.ts` | New | S4 | `generateTempPassword()` using `node:crypto` |
| `src/services/import.service.ts` | Modify | S4 | Add `dryRun` flag; guard `saveMany`; fix `resolveChurch` phantom-church |
| `src/services/church-import.service.ts` | New | S4 | Bulk church CSV import service |
| `src/api/controllers/church-import.controller.ts` | New | S4 | Single `run` handler |
| `src/container.ts` | Modify | S4 + S5 | S4: wire `churchImport`. S5: wire `auditExport`, expose `settingsRepo` |
| `src/services/admin.service.ts` | Modify | S4 + S5 | S4: widen `newYear` return type + temp passwords + persist `lastTempPasswords`. S5: wipe guard on `reset` and `newYear` with confirmation string |
| `src/api/controllers/admin.controller.ts` | Modify | S5 | Forward `force` and `confirmWipe` from request body |
| `src/core/entities/settings.ts` | Modify | S4 + S5 | S4: `lastTempPasswords`. S5: `lastExportedAt` |
| `src/repositories/supabase/supabase.settings.ts` | Modify | S4 + S5 | S4: map `last_temp_passwords` in toSettings/settingsCols/UPDATE_COLS. S5: same for `last_exported_at` |
| `src/core/errors/app-error.ts` | Modify | S5 | Add `WipeGuardError` (409 WIPE_GUARD) |
| `src/services/audit-export.service.ts` | New | S5 | Full workbook builder + CSV export methods; use `import ExcelJS from 'exceljs'` |
| `src/api/http/types.ts` | Modify | S5 | Add `BufferRoute`; add `ip?` on `HttpRequest` |
| `src/api/http/express-adapter.ts` | Modify | S5 | Handle `BufferRoute`; set `httpReq.ip` |
| `src/api/controllers/audit.controller.ts` | New | S5 | Export workbook + CSV handlers; writes `lastExportedAt`; logs IP |
| `supabase/migrations/006_add_last_temp_passwords.sql` | New | S4 | Add `last_temp_passwords jsonb` to `settings` table |
| `supabase/migrations/007_add_last_exported_at.sql` | New | S5 | Add `last_exported_at timestamptz` to `settings` table |
| `docs/verification/test_p2_admin.py` | New | S4 | Four P2 validation functions |
| `docs/verification/test_p1_checkin_ux.py` | New | S3 | Two P1 validation functions |
| `docs/verification/test_p3_export_compliance.py` | New | S5 | Five P3 validation functions |
| `public/index.html` | Modify | S1 + S2 + S3 + S4 + S5 + S6 | The single SPA file. Each sprint adds or replaces sections. See per-sprint SPA breakdown above. |
| `package.json` | Modify | S5 | Add `exceljs` to `dependencies` |

---

## 4. Supabase migrations list

| File | Sprint | Purpose | Rollback |
|------|--------|---------|---------|
| `supabase/migrations/006_add_last_temp_passwords.sql` | S4 | Add `last_temp_passwords jsonb` to `settings` singleton | `ALTER TABLE settings DROP COLUMN IF EXISTS last_temp_passwords;` |
| `supabase/migrations/007_add_last_exported_at.sql` | S5 | Add `last_exported_at timestamptz` to `settings` singleton | `ALTER TABLE settings DROP COLUMN IF EXISTS last_exported_at;` |

No other migrations are required. The P0 fix, CamperDto widening, and firstAid role all operate at the service/DTO layer — the underlying `people` table schema is unchanged.

> **Settings table name:** The Supabase table is `settings` (not `camp_settings`). Confirmed in `supabase.settings.ts` line 58: `select * from settings where id = 'settings'`. All migration SQL uses `settings`.

> **Verification:** after applying each migration, run `SELECT column_name FROM information_schema.columns WHERE table_name = 'settings';` in Supabase SQL editor to confirm the new column is present.

---

## 5. Deployment checklist per sprint

### Sprint 1 — Foundation

**Local test before merge:**
- `npm run typecheck` — zero errors
- `npm run test` — all tests pass (update count reflects new/replaced person-lifecycle tests)
- Start server with `PERSISTENCE=memory npm run dev`, run `python docs/verification/test_p0_presence.py` against `http://localhost:4200`
- Manually tap "Check out" on a session roster; confirm the camper stays visible and `totalAtCamp` on the dashboard is unchanged
- Manually trigger attendance sign-out; confirm the camper disappears from the session roster

**Env vars to check on Vercel:**
- No new vars. `SESSION_SECRET`, `DATABASE_URL`, `PERSISTENCE=supabase` must remain set.

**Verify on Vercel after deploy:**
- POST a daily check-out and confirm the at-camp count in the dashboard does not drop
- POST attendance sign-out and confirm the camper disappears from the session roster

---

### Sprint 2 — First-aid role

**Local test before merge:**
- `npm run typecheck` — must pass; the `Record<UserRole, Set<Action>>` type in `access-control.ts` enforces exhaustiveness on `ROLE_PERMISSIONS`, but does **not** cover `canAccessPerson` or `canAccessChurch` — verify those switch cases manually
- `npm run test` — all tests pass
- Create a `firstAid` account in the admin console, log in as `firstaid`, confirm: (a) only three tabs visible, (b) Medical Watch loads, (c) search returns cross-church results, (d) casualty card opens, (e) POST /notes returns 403
- Run `python docs/verification/test_p4_firstaid.py`

**Env vars:** no new vars.

**Verify on Vercel:**
- Create a `firstaid` account in the admin console on production
- Log in as `firstaid`, search for a camper with medical conditions, open the casualty card, verify medical section renders first and Medicare number is masked

---

### Sprint 3 — Check-in UX

**Local test before merge:**
- `npm run typecheck && npm run test`
- Run `python docs/verification/test_p1_checkin_ux.py`
- Manual QA on a 375px viewport: tap a row, confirm optimistic flip, confirm undo toast appears, confirm the row moves to the Done section; kill the network (DevTools → Offline), tap another row, restore network, confirm queued write drains
- Confirm no double fetch (`/campers` should NOT appear in the Network tab when the check-in screen loads)
- Confirm quick-note modal opens from the roster row `＋ note` button
- On a 980px+ viewport, verify oversight pulse renders for director and is absent for church role

**Env vars:** no new vars.

**Verify on Vercel:**
- `gender` and `grade` appear on the roster without an extra `/campers` fetch (check Network panel)
- Optimistic tap with intermittent camp Wi-Fi conditions: verify sync dot transitions

---

### Sprint 4 — Admin laptop

**Pre-deploy (Supabase — blocking):**
- Apply `supabase/migrations/006_add_last_temp_passwords.sql` via `supabase db push` or `psql` before pushing to Vercel
- Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'settings';` includes `last_temp_passwords`

**Local test before merge:**
- `npm run typecheck && npm run test`
- Run `python docs/verification/test_p2_admin.py`
- On 980px+: verify wide side-nav renders, tiles are 3-col, form is two-column, Ctrl+S triggers save
- Import dry-run: upload a CSV, confirm preview shows counts without persisting; upload a CSV with a misspelled church, confirm warning appears and no phantom church is created
- Bulk church import: run a dry run, confirm nothing created; run live, confirm churches and accounts created; re-run, confirm idempotency (skipped=2, created=0)
- Trigger `POST /admin/new-year` via the admin console; confirm temp passwords appear in the modal

**Env vars:** no new vars.

**Verify on Vercel:**
- Test the import dryRun flag against the production Supabase DB (use a throwaway CSV with 3 rows)
- Verify temp passwords are generated and returned on `newYear`

---

### Sprint 5 — Export & compliance

**Pre-deploy (Supabase — blocking):**
- Apply `supabase/migrations/007_add_last_exported_at.sql` before pushing to Vercel
- Verify: `last_exported_at` column present in `settings` table

**Local test before merge:**
- `npm install` (confirms exceljs in `package-lock.json`)
- `npm run typecheck && npm run test`
- `GET /export/audit` → download, open in Excel, confirm: five tabs present, Summary labels bold, Sign-in/Sign-out Log has all 10 columns including `Parents Met` and `Authorised By`, timestamps are in camp-local time (not UTC)
- Verify first two bytes of audit.xlsx are `PK` (ZIP magic): `curl -o test.xlsx ... && xxd test.xlsx | head -1`
- `GET /export/signin-out` → CSV opens in Excel without garbled characters (BOM present)
- `POST /admin/new-year` without prior export → expect 409 WIPE_GUARD response
- `POST /admin/new-year` with `{ "force": true }` only → expect 400 (confirmWipe string missing)
- `POST /admin/new-year` with `{ "force": true, "confirmWipe": "I understand this cannot be undone" }` → expect 200
- After a normal export, `POST /admin/new-year` without force → expect 200
- Run `python docs/verification/test_p3_export_compliance.py`

**Env vars:** no new vars. Confirm `PERSISTENCE=supabase` path has migration 007 applied before deploy.

**Verify on Vercel:**
- Download the full audit workbook from the Records & Export screen
- Confirm `lastExportedAt` is set in settings after the download
- Confirm `POST /admin/new-year` without force is blocked until the export is confirmed

---

### Sprint 6 — Polish

**Prerequisite:** Sprint 4 and Sprint 5 must be live in production before deploying Sprint 6 if the Passwords tab is included. The Passwords tab reads `settings.lastTempPasswords` (Sprint 4) and the clear-after-export logic touches `exportMasterWorkbook` (Sprint 5).

**Local test before merge:**
- `npm run typecheck && npm run test`
- Visual QA on 375px and 1440px:
  - Phone: tabs, bar, all screens — confirm no regression from wide-layout CSS
  - Desktop: side-nav highlights correct item on every screen, two-column forms render, tiles are 3-col
- Confirm Passwords tab appears in xlsx workbook after a `newYear` call
- Confirm `lastTempPasswords` is cleared from settings after export confirms
- Audit tel: links: every phone number displayed in the SPA must be wrapped in `telLink()`

**Verify on Vercel:** full regression smoke test using the validation harness for all five specs.

---

## 6. Regression risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| P0 lifecycle change — existing `withCheckIn` tests assert the old (wrong) promotion behaviour | Tests WILL fail before the test update | Update `person-lifecycle.test.ts` as the very first step in Sprint 1, before changing production code. Run `npm run test` to confirm the old tests fail; then fix the code and confirm they pass with the new assertions. |
| `isCamper()` includes `departed` — the `checkInsDue` dashboard fix is mandatory | Without `atCampNow`, departed persons inflate the checkInsDue count | Add `atCampNow = allCampers.filter(p => p.atCamp)` in Sprint 1 dashboard fix. Also run the `departed` lifecycle audit in pre-flight step 8. |
| `checkin.service.ts` filter change — `canAccessPerson` guard must be retained | Removing `canAccessPerson` would expose cross-church roster data | Write the full replacement: `p.atCamp && canAccessPerson(actor, p)`. Never remove the access guard. |
| CamperDto widening — `consentMedical` uses wrong mapping | `p.consentMedical` does not exist on `Person`; `p.consents.medical?.granted` is the correct path | Follow the `toRegistrantDto` pattern exactly: `consentMedical: p.consents.medical?.granted ?? false`. |
| `firstAid` role — `canAccessPerson` and `canAccessChurch` are `switch` statements with `default: return false`; not covered by TypeScript exhaustiveness | firstAid users get silent 403/404 on camper and church lookups | Both switch cases must be added in Sprint 2. Run the pre-flight role grep and treat every file found as a mandatory review target. The TypeScript `Record<UserRole, ...>` exhaustiveness check covers `ROLE_PERMISSIONS` only. |
| exceljs `require()` pattern loses type safety | Runtime type errors in export code not caught by tsc | Use `import ExcelJS from 'exceljs'` — the CJS tsconfig transforms it correctly. |
| Double BOM in CSV exports | First two characters of CSV are garbage in Excel | BOM added once in `toCsvString` (Sprint 1). `AuditExportService` CSV methods must not add a second prefix. |
| Wipe guard breaks existing tests that call `newYear`/`reset` | CI and test teardowns throw 409 | Run grep of all call sites before Sprint 5. Every test must add `force: true, confirmWipe: 'I understand this cannot be undone'` or be updated to export first. |
| `POST /admin/new-year` force bypass — bare boolean `true` too easy to trigger accidentally | Production data wiped without genuine intent | Require `confirmWipe: 'I understand this cannot be undone'` string alongside `force: true`. Both must be present. |
| `GET /campers/medical` route declared after `GET /campers/:id` | Express matches `/campers/medical` as `{ id: 'medical' }` | Declare the literal route BEFORE the parameterised route in `router.ts`. |
| exceljs bundle size on Vercel | Exceeds 50 MB serverless limit | ExcelJS traces to ~1.5 MB. Confirm with `vercel build --debug` locally before S5 deploy (blocking pre-flight gate). |
| Responsive CSS — `@media(min-width:980px)` block inadvertently overrides base rules | Phone layout broken | The media query is strictly additive. Verify on a 375px viewport in Chrome DevTools immediately after adding the CSS block. |
| `BufferRoute` in the express adapter — wrong implementation sends binary data as JSON | Export downloads corrupted | Check first two bytes of downloaded file are `PK`. Test with `curl`. |
| Sprint 4 migration (`006`) not applied before Vercel deploy | `lastTempPasswords` writes fail silently or throw | Apply migration 006 before deploying. Run column verification query post-apply. |
| Sprint 5 migration (`007`) not applied before Vercel deploy | `lastExportedAt` writes fail; wipe guard cannot reset | Apply migration 007 before deploying. Same verification query. |

---

## 7. Resolved decisions summary

The following decisions are locked and do not require further design discussion:

| Decision | Resolution |
|----------|------------|
| xlsx library | `exceljs@^4.4.0` — CommonJS-compatible, Vercel serverless-safe, ships own type declarations. Listed in `dependencies`. Import via `import ExcelJS from 'exceljs'` (compiler transforms to CJS require). |
| Temp passwords | Generated server-side via `node:crypto` `randomBytes` in `generateTempPassword()` (9-char mixed, no ambiguous chars). Hashed before storage. Returned in `newYear` response and stored in `CampSettings.lastTempPasswords` for inclusion in the close-out xlsx. Cleared from settings after export. |
| Scale expectations | 20+ churches, 400+ campers. No virtual scroll required. Optimistic check-in queue prevents full re-render per tap. Export is a single full-table scan — acceptable for 400 rows. |
| Zone names | 4 hardcoded zones (Yellow, Blue, Green, Red) in `ZONE_NAMES`. No change. |
| `firstAid` as a new role | Added to `USER_ROLES` enum. `ROLE_PERMISSIONS` entry: `camper:read`, `camper:read:sensitive`, `checkin:write`. Cannot write person records, notes, or admin:manage. **At-camp only** — no `registrant:read` permission; pre-camp screens and `/registrants` are inaccessible. Camp-wide scope (`canAccessPerson` and `canAccessChurch` return `true`). Created by admin only. Cannot send notifications (intentional — `canSendNotification` returns false via existing default paths). |
| Responsive layout approach | Single SPA file. Purely additive `@media(min-width:980px)` block. Phone layout is not touched. Wide-nav element is `display:none` outside the media query. |
| Compliance framing | Sign-in/sign-out log (`signOutHistory`) is the compliance record. Daily check-in log (`checkInHistory`) is operational data only. |
| Audit workbook access | `GET /export/audit` (full xlsx workbook including Passwords tab) is accessible to both `admin` and `director` roles. The director can download the full workbook including temp passwords. The `Records & Export` tile is visible to both roles. |
| Bulk church CSV import conflict | If a church name already exists in the DB with a different `code` or `selfRegisterSlug`, skip the row and emit a warning in the dry-run preview. Do not overwrite. Operator resolves manually. Idempotency is on username+code match. |
| Guided setup wizard | 5 steps: Settings → Churches → Accounts → Accommodation → Schedule. Devotionals are configured separately outside the wizard and do not block camp operation. |
| CamperDto unification | `toCamperDto` called unconditionally for all roles. Widened fields present for all callers of `GET /campers/:id`. Selective hiding by role deferred to future policy review. |
| `atCamp` as single source of truth for on-site presence | Exclusively written by `withSignEvent`. `withCheckIn` appends to `checkInHistory` only. All roster filters, Medical Watch, and casualty card presence sections read `p.atCamp`. |
| `departed` lifecycle | In `AT_CAMP_LIFECYCLES` (so `isCamper()` returns true) but currently has no write path in any service. `atCamp === false` is the correct roster filter — `departed` persons are correctly excluded regardless of `isCamper()`. No change required; documented as intentional. |
| `force` wipe guard override | Requires both `force: true` AND `confirmWipe: 'I understand this cannot be undone'` in the request body. Bare boolean alone returns 400. SPA only sends both after completing all 3 close-out steps. |
| Settings Supabase table name | Table is `settings` (not `camp_settings`). New columns `last_temp_passwords` (migration 006) and `last_exported_at` (migration 007) are added to the `settings` table. |

---

## 8. Testing strategy

### Unit tests (vitest)

Run `npm run test` after every sprint before merging to `master`. The test suite must stay green at every merge point.

| Sprint | Test file | Required change |
|--------|-----------|----------------|
| S1 | `src/services/person-lifecycle.test.ts` | Replace `withCheckIn` block; add `withSignEvent` cases |
| S1 | `src/services/checkin.service.test.ts` | Add test: roster filter excludes `atCamp:false` campers (including `departed`) |
| S2 | `src/services/access-control.test.ts` | Add `firstAid` permission checks; add `canAccessPerson` and `canAccessChurch` tests for `firstAid` returning `true` |
| S2 | `src/services/person.service.test.ts` | Add `listMedicalWatch` tests: returns only atCamp+flagged campers |
| S3 | `src/services/checkin.service.test.ts` | Add test: `RosterEntry` includes `gender`, `grade`, `medicalFlag` |
| S4 | `src/services/import.service.test.ts` | Add dry-run tests: no person records created; `dryRun:true` in result |
| S5 | `src/services/admin.service.test.ts` | Add wipe-guard tests: `newYear` throws 409 without prior export; passes with `force:true` + `confirmWipe`; bare `force:true` alone returns 400 |

### Type checking

`npm run typecheck` (tsc --noEmit) must pass at every sprint merge. The `Record<UserRole, Set<Action>>` in `access-control.ts` provides compile-time exhaustiveness for `ROLE_PERMISSIONS` — **but not for `canAccessPerson`, `canAccessChurch`, or `canSendNotification`**, which use `switch` statements. Manual review of those functions is required in Sprint 2.

### Post-deploy integration tests (Python/requests)

| Script | Sprint | Key invariants |
|--------|--------|---------------|
| `docs/verification/test_p0_presence.py` | S1 | Daily checkout does not decrease `totalAtCamp`; departed camper absent from roster; 400 returned for non-atCamp check-in |
| `docs/verification/test_p1_checkin_ux.py` | S3 | `RosterEntry` has `gender`/`grade`/`medicalFlag`; check-in persists and shows on reload |
| `docs/verification/test_p2_admin.py` | S4 | `dryRun:true` does not persist; bulk church import is idempotent; settings date range accepted |
| `docs/verification/test_p3_export_compliance.py` | S5 | xlsx has PK magic bytes; sign-out CSV has all 10 compliance columns; BOM present on all CSV exports; wipe guard blocks `newYear` without prior export; bare `force:true` rejected |
| `docs/verification/test_p4_firstaid.py` | S2 | firstAid sees all churches; cannot POST /notes; cannot GET /accounts/users; CamperDto includes medical fields; Medical Watch returns only atCamp+flagged; can attendance sign-out; church role cannot GET /campers/medical |

### Manual QA matrix (before each Vercel deploy)

| Check | Viewport |
|-------|----------|
| All existing screens render without JS errors | 375px |
| Check-in roster loads with single fetch (no `/campers` in Network) | 375px |
| Optimistic tap flips state immediately | 375px |
| Wide side-nav renders and highlights current screen | 1440px |
| Phone bottom tabs remain functional | 375px |
| Import dry-run preview shows before any writes | 375px + 1440px |
| Export workbook opens in Excel with correct sheet names | desktop |

---

## 9. Estimated effort

| Sprint | Description | Estimate |
|--------|-------------|----------|
| Sprint 1 | P0 presence fix + BOM + dashboard fix + tests | 1 developer-day |
| Sprint 2 | firstAid role: enum, RBAC (3 functions), DTO, service, routes, SPA tab set, casualty card, Medical Watch, seed | 2 developer-days |
| Sprint 3 | Check-in UX: optimistic queue, two-pile roster, quick-note, urgent notice, My day, search icon, tel: links | 2 developer-days |
| Sprint 4 | Admin laptop: responsive CSS, side-nav, dryRun import, bulk church import, date pickers, wizard, temp passwords, migration 006 | 2 developer-days |
| Sprint 5 | Export & compliance: exceljs workbook, wipe guard + confirmation string, Records screen, close-out handoff, migration 007, BufferRoute | 2 developer-days |
| Sprint 6 | Polish: oversight pulse QA, wizard QA, Passwords tab, tel: audit, side-nav completeness, visual QA pass | 2 developer-days |
| **Total** | | **~11 developer-days** |

Sprint 2 and Sprint 3 backend changes can be developed in parallel on separate branches after Sprint 1 merges (they touch different interfaces in `person.dto.ts`). Merge Sprint 2 first to resolve any conflicts, then merge Sprint 3. **Do not deploy Sprint 3 SPA changes before Sprint 3 backend DTO is live.** Sprints 4, 5, and 6 are strictly sequential due to the `newYear`/`lastTempPasswords`/`lastExportedAt`/Passwords-tab dependency chain.
