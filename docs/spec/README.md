# Youth Camp Platform — Upgrade Specifications

## Overview

This spec set was produced after an executive board review of the Youth Camp Management Platform (TypeScript/Express backend + single-file SPA, deployed to Supabase + Vercel). The review identified a critical presence-model defect (daily session check-out was incorrectly writing `atCamp = false`, causing campers to vanish from the live roster), along with four planned capability areas: on-ground check-in UX, admin laptop interface, post-camp compliance export, and a dedicated first-aid role. These six documents and one validation harness define every change needed across all six implementation sprints — from the mandatory P0 bugfix that blocks everything else, through to the polish pass that completes the first-aid, export, and responsive layout features.

---

## Quick-start for the developer

1. **Read `06-implementation-plan.md` first.** It contains the pre-flight checklist, the full dependency map, per-sprint backend and SPA change lists, the deployment checklist, regression risks, and effort estimates.
2. Run the baseline gate before cutting any branch:
   ```bash
   npm install && npm run typecheck && npm run test
   ```
   Must show 186 passing tests, zero type errors.
3. Install the xlsx export dependency (required for Sprint 5; safe to add at pre-flight):
   ```bash
   npm install exceljs@^4.4.0 --save
   ```
4. **Start with Sprint 1 (P0).** Every other sprint depends on the presence-model fix landing on `master` first.
5. After each sprint deploy, run the post-deployment validation tests against the live URL:
   ```bash
   python3 docs/spec/07-validation-tests.py
   ```

---

## Document map

| File | Area | Sprint | Priority | Description |
|------|------|--------|----------|-------------|
| `01-p0-presence-model.md` | Presence model bugfix | Sprint 1 | P0 — CRITICAL | Fixes `withCheckIn` writing `atCamp = false` on daily session check-out; adds `atCamp` guard in `checkIn`; corrects `checkInsDue` count; adds UTF-8 BOM to CSV exports |
| `02-p1-checkin-ux.md` | On-ground UX | Sprint 3 | P1 — High | Optimistic tap + offline queue, two-pile roster (Still need / Done), undo toast, whole-row tap targets, confirm-before-check-out, quick-note shortcut, urgent notice interstitial, "My day" home for church role, global search icon, tel: links |
| `03-p2-admin-laptop.md` | Admin setup + laptop | Sprints 4 + 6 | P2 — Medium | Responsive CSS breakpoint (980px+), side-nav, dryRun import preview, phantom-church guard, bulk church CSV import, date-range settings, timezone picker, guided setup wizard, temp passwords on new-year rollover |
| `04-p3-export-compliance.md` | Post-camp export | Sprint 5 | P3 — Medium | Multi-tab exceljs `.xlsx` workbook (Summary, Attendees, Sign-in/Sign-out Log, Daily Check-in Log, Notes & Testimonies, Passwords), wipe guard on new-year/reset, Records & Export admin screen, close-out guided handoff, export access logging |
| `05-p4-firstaid-role.md` | First-aid role | Sprint 2 | P4 — High | New `firstAid` enum value, RBAC entry, CamperDto widening (otherMedications / medicareNumber / parentRelation), Medical Watch list, casualty card, medical access logging, three-tab SPA set |
| `06-implementation-plan.md` | Implementation plan | All sprints | Reference | Pre-flight checklist, dependency map, six sprint breakdowns (backend + SPA + tests per sprint), per-file change table, migration list, deployment checklists, regression risks, resolved decisions, testing strategy, effort estimates |
| `07-validation-tests.py` | Post-deploy validation | All sprints | Test harness | Unified Python/requests test suite covering P0 presence invariants, P1 check-in UX, P2 admin import, P3 export compliance, and P4 first-aid RBAC — run against any deployed URL |

---

## Key decisions locked

- **`atCamp` is the single source of truth for physical presence.** It is written exclusively by `withSignEvent` (attendance sign-in/out). `withCheckIn` (daily session) appends to `checkInHistory` only and never touches `atCamp` or `lifecycle`.
- **Daily roster filters on `atCamp === true`, not `isCamper()`.** Departed campers are hidden entirely; `isCamper()` is only correct for "has ever arrived" counts.
- **`exceljs@^4.4.0` for all `.xlsx` output.** CommonJS-compatible, Vercel serverless-safe, ships its own type declarations. Required via `require('exceljs')` (not ESM import) because `tsconfig` emits CJS. Listed in `dependencies`, not `devDependencies`.
- **`tsconfig` must stay `module: CommonJS, moduleResolution: Node`.** Switching to ESNext/Bundler crashes `@vercel/node` on load.
- **UTF-8 BOM prepended once in `toCsvString`.** Do not add an additional prefix anywhere in `AuditExportService` — double BOM corrupts the CSV.
- **`GET /campers/medical` must be declared before `GET /campers/:id` in `router.ts`.** Express would otherwise match the literal segment `"medical"` as a parameterised `:id`.
- **Wipe guard (`lastExportedAt`).** Both `reset` and `newYear` refuse to proceed without a prior export unless `force: true` is passed — protects against accidental data loss before records are secured.
- **Responsive layout is strictly additive.** The `@media(min-width:980px)` block does not modify any rule that applies at phone widths. The 460px phone layout is untouched.

---

## Sprint dependency graph

```
Sprint 1 — P0 Presence fix (MUST land on master first)
│
├── Sprint 2 — First-aid role
│     └── CamperDto widening (otherMedications, medicareNumber, parentRelation, gender)
│           └── shared by Sprint 3 (RosterEntry DTO can reuse the same widening pass)
│
├── Sprint 3 — Check-in UX
│     (RosterEntry DTO enrichment; optimistic queue; two-pile roster)
│     NOTE: Sprint 2 and Sprint 3 can run in parallel on separate branches.
│           Merge Sprint 2 first, then Sprint 3.
│
├── Sprint 4 — Admin laptop
│     (responsive CSS; dryRun import; bulk church import; wizard; temp passwords)
│     │
│     └── Sprint 5 — Export & compliance
│           (exceljs workbook; wipe guard; close-out wraps Sprint 4 lastTempPasswords)
│           │
│           └── Sprint 6 — Polish
│                 (oversight pulse QA; wizard QA; Passwords xlsx tab; tel: audit;
│                  side-nav completeness; full visual QA 375px + 1440px)
```

Sprints 4, 5, and 6 are strictly sequential due to the `newYear` → `lastTempPasswords` → `lastExportedAt` dependency chain.

---

## How to run validation tests

```bash
# Against a local seeded server (PERSISTENCE=memory)
CAMP_URL=http://localhost:4200 \
ADMIN_USER=admin \
ADMIN_PASS=<your-local-admin-password> \
python3 docs/spec/07-validation-tests.py

# Against the production Vercel deployment
CAMP_URL=https://my-youth-camp.vercel.app \
ADMIN_USER=admin \
ADMIN_PASS=<prod-admin-password> \
FA_USER=firstaid \
FA_PASS=<firstaid-password> \
CHURCH_USER=victory \
CHURCH_PASS=demo1234 \
python3 docs/spec/07-validation-tests.py
```

The suite creates and destroys its own test data. If setup fails mid-way, teardown still attempts to clean up everything that was created. Per-sprint validation scripts are also placed under `docs/verification/` (see `06-implementation-plan.md` § 8 for the full list).

---

## Files changed — consolidated list

### Core (`src/core/`)

- `src/core/types/enums.ts` — add `'firstAid'` to `USER_ROLES` tuple (Sprint 2)
- `src/core/entities/settings.ts` — add `lastTempPasswords` (Sprint 4); add `lastExportedAt` (Sprint 5)
- `src/core/errors/app-error.ts` — add `WipeGuardError` 409/WIPE_GUARD (Sprint 5)

### Services (`src/services/`)

- `src/services/person-lifecycle.ts` — rewrite `withCheckIn` (Sprint 1)
- `src/services/checkin.service.ts` — filter on `p.atCamp`; remove unused `isCamper` import (Sprint 1)
- `src/services/person.service.ts` — add `atCamp` guard in `checkIn` (Sprint 1); add `listMedicalWatch` (Sprint 2)
- `src/services/dashboard.service.ts` — add `atCampNow`; use it in `checkInsDue` (Sprint 1)
- `src/services/access-control.ts` — add `firstAid` to `ROLE_PERMISSIONS`, `canAccessPerson`, `canAccessChurch` (Sprint 2)
- `src/services/import.service.ts` — add `dryRun` flag; guard `saveMany`; fix phantom-church in `resolveChurch` (Sprint 4)
- `src/services/church-import.service.ts` — new: bulk church CSV import (Sprint 4)
- `src/services/admin.service.ts` — widen `newYear` return + temp passwords (Sprint 4); wipe guard on `reset`/`newYear` (Sprint 5)
- `src/services/audit-export.service.ts` — new: exceljs workbook builder + CSV export methods (Sprint 5)
- `src/utils/csv.ts` — prepend UTF-8 BOM in `toCsvString` (Sprint 1)
- `src/utils/temp-password.ts` — new: `generateTempPassword()` via `node:crypto` (Sprint 4)

### API (`src/api/`)

- `src/api/dto/person.dto.ts` — widen `CamperDto` + `toCamperDto` (Sprint 2); widen `RosterEntry` + `toRosterEntry` (Sprint 3)
- `src/api/controllers/person.controller.ts` — add `getMedicalWatch`, `revealMedicare`; medical access logging in `getCamper` (Sprint 2)
- `src/api/controllers/church-import.controller.ts` — new (Sprint 4)
- `src/api/controllers/admin.controller.ts` — forward `force` flag from request body (Sprint 5)
- `src/api/controllers/audit.controller.ts` — new: workbook + CSV download handlers; writes `lastExportedAt`; logs IP (Sprint 5)
- `src/api/http/router.ts` — two new camper routes (Sprint 2); church import route (Sprint 4); two buffer export routes (Sprint 5)
- `src/api/http/types.ts` — add `BufferRoute`; add `ip?` on `HttpRequest` (Sprint 5)
- `src/api/http/express-adapter.ts` — handle `BufferRoute`; set `httpReq.ip` (Sprint 5)
- `src/container.ts` — wire `churchImport` (Sprint 4); wire `auditExport`, expose `settingsRepo` (Sprint 5)

### SPA (`public/index.html`)

All six sprints touch this single file. Key additions per sprint:
- S1: move `RENDER.checkin()` outside `doCheck` try/catch
- S2: `firstAid` role in `leaderRoles`, `buildTabs`, `RENDER.home`; `renderHomeFirstAid`, `loadMedicalWatch`, `openCasualtyCard`, `revealMedicare`
- S3: optimistic check-in queue (`CHECKIN_QUEUE`, `drainQueue`, `_performCheck`, `_showUndoToast`); two-pile roster; `renderOversightPulse`; `renderMyDay`; `checkUrgentNotices`; `telLink`; global search icon
- S4: `@media(min-width:980px)` wide-layout CSS; `_initWideNav`; dryRun import preview; `RENDER.adminChurchImport`; date-picker settings form; `RENDER.adminWizard`
- S5: `renderAdminRecords`; `renderCloseOut`; `downloadAuditExport`; Records & Export tile in admin console
- S6: polish and QA pass on oversight pulse, wizard, Passwords tab, tel: links, side-nav completeness

### Migrations

- `supabase/migrations/006_add_last_exported_at.sql` — add `last_exported_at timestamptz` to `camp_settings` (Sprint 5)

### Test files

- `src/services/person-lifecycle.test.ts` — replace `withCheckIn` block; add `withSignEvent` cases (Sprint 1)
- `src/services/checkin.service.test.ts` — roster filter + RosterEntry DTO field tests (Sprints 1, 3)
- `src/services/person.service.test.ts` — `listMedicalWatch` tests (Sprint 2)
- `src/services/import.service.test.ts` — dry-run tests (Sprint 4)
- `src/services/admin.service.test.ts` — wipe-guard tests (Sprint 5)
- `src/data/seed.ts` — add `firstaid` seed account (Sprint 2)
- `docs/verification/test_p0_presence.py` — three P0 validation functions (Sprint 1)
- `docs/verification/test_p4_firstaid.py` — six P4 validation functions (Sprint 2)
- `docs/verification/test_p1_checkin_ux.py` — two P1 validation functions (Sprint 3)
- `docs/verification/test_p2_admin.py` — four P2 validation functions (Sprint 4)
- `docs/verification/test_p3_export_compliance.py` — five P3 validation functions (Sprint 5)
- `docs/spec/07-validation-tests.py` — unified post-deploy harness covering all five spec areas
