# Youth Camp Platform — Upgrade Review & Specification Summary

_Session date: 2026-06-23. Full spec suite written to `docs/spec/`._

---

## What this session was

A four-part engineering executive board review of the live youth camp platform
(`my-youth-camp.vercel.app`), covering:

1. **On-ground usability** — leaders and directors at camp
2. **Admin setup** — the laptop-based administrator configuring the system
3. **Post-camp compliance export** — duty-of-care record keeping
4. **First-aid access** — a dedicated medical/incident role

The review was grounded in the actual codebase (all services, DTOs, SPA code,
routing). Every finding was verified against real file paths and line numbers
before being included.

The output is a **7-document specification and validation suite** in `docs/spec/`,
covering ~7,900 lines of specifications, implementation code, and test harness.

---

## Critical finding (P0 — must fix first)

**`withCheckIn` in `src/services/person-lifecycle.ts` writes `atCamp = false` on
every daily session check-out.** This is a correctness bug:

- A routine evening check-out silently removes a kid from the at-camp headcount
- A departed camper (who has genuinely left) still appears on tomorrow's session
  roster because the lifecycle states overlap
- The dashboard's `checkInsDue` count and `totalAtCamp` figure are therefore
  both unreliable throughout camp

**Fix:** Split the two responsibilities. `withCheckIn` (daily session) appends
the `CheckInEntry` only — never touches `atCamp` or `lifecycle`. `withSignEvent`
(attendance sign-in/out) remains the sole writer of `atCamp`. Roster and
`checkInsDue` filter on `atCamp === true`. The daily check-in endpoint hard-
blocks anyone not `atCamp` server-side.

**This must ship in Sprint 1. Every other improvement depends on it.**

---

## The six-sprint plan

| Sprint | Area | Key deliverables | Est. effort |
|--------|------|-----------------|-------------|
| **1** | Foundation | P0 presence fix · CamperDto widened · BOM fix · Supabase migration 004 | 1 day |
| **2** | First-aid role | `firstAid` role + RBAC · casualty card · Medical Watch · `/campers/medical` | 2 days |
| **3** | Check-in UX | Optimistic queue · two-pile roster · undo · oversight pulse · "My day" home | 2 days |
| **4** | Admin laptop | Responsive CSS · import dryRun/preview · bulk church import · date pickers | 2 days |
| **5** | Export & compliance | `AuditExportService` · exceljs workbook · wipe guard · close-out flow | 2 days |
| **6** | Polish | Guided setup wizard · R9 temp passwords · side-nav · tel: links | 2 days |

**Total: ~11 developer-days.**

---

## What each spec doc contains

### `docs/spec/01-p0-presence-model.md` (710 lines)
- Exact description of the bug and all affected file/line numbers
- Old vs new code for `withCheckIn`, `getSessionStatus`, `checkIn` guard,
  `checkInsDue`
- Updated vitest test blocks for `person-lifecycle.test.ts`
- Python validation tests: `test_daily_checkout_preserves_atcamp`,
  `test_departed_hidden_from_roster`, `test_checkin_blocked_without_arrival`

### `docs/spec/02-p1-checkin-ux.md` (960 lines)
- Roster DTO enrichment: `gender`, `grade`, `medicalFlag` added to `RosterEntry`
  (removes the per-render `/campers` piggyback fetch)
- Complete optimistic-tap + offline queue: `CHECKIN_QUEUE`, `drainQueue()`,
  `online/offline` event listeners, per-row sync indicator
- Two-pile roster ("Still need N" / collapsible "Done M") + completion banner
- Undo toast (4s) + confirm-before-check-OUT modal
- Quick-note shortcut from each roster row
- Urgent-notice full-screen interstitial for `priority:'urgent'`
- "My day" home card for church/leader role
- Oversight pulse board for director/zoneLeader on wide layout
- Global search icon in top bar + `tel:` links throughout

### `docs/spec/03-p2-admin-laptop.md` (1452 lines)
- Additive `@media(min-width:980px)` CSS — app grows to 1100px, bottom nav
  becomes left side-nav, setup cards go two-column. Phone layout unchanged.
- Import: `dryRun` flag on `POST /import/csv` — preview counts/errors/warnings
  before committing. `updateExisting` exposed (was hardcoded `true`). Phantom-
  church creation surfaces for confirmation instead of auto-creating.
- New `POST /import/churches` — bulk church CSV upload with 3-step preview flow
- Date-range pickers replace hand-typed comma-separated YYYY-MM-DD string;
  timezone becomes an AU-first dropdown
- Guided setup wizard (Settings → Churches → Accounts → Accommodation → Schedule)
  with per-step progress + nudges
- R9 new-year rollover: `generateTempPassword()` (node:crypto), temp passwords
  returned in response and included in the close-out export Passwords tab

### `docs/spec/04-p3-export-compliance.md` (1492 lines)
- **Compliance centrepiece: `signOutHistory` → Sign-in/Sign-out Log sheet.**
  Every `SignOutEvent` (including Day-1 arrival) as a row: Student, Church, Zone,
  Gender, Grade, Event Type, camp-local timestamp, Reason, Parents Met,
  Authorised By (joined from `authorId`). Includes "Registered — Did Not Attend"
  rows for zero-history registrants.
- Daily check-in: one flat operational sheet only (not compliance-grade).
- `AuditExportService` factory: full implementation using `exceljs` — Summary
  tab, Attendees, Sign-in/Sign-out Log, Daily Check-in Log, Notes & Testimonies,
  (Passwords tab when applicable). Server-side `Buffer`, served via
  `GET /export/audit`.
- UTF-8 BOM fix in `toCsvString` (retro-improves all existing exports).
- Wipe guard: `CampSettings.lastExportedAt` field; `newYear()` and `reset()`
  throw `WipeGuardError` if not exported this season. `force: boolean` override.
- "Close out camp" guided handoff (3-step: Download → Confirm saved → Roll over).
- Records & Export admin screen.
- Supabase migration `004_add_last_exported_at.sql`.

### `docs/spec/05-p4-firstaid-role.md` (1008 lines)
- `'firstAid'` added to `USER_ROLES` enum and `ROLE_PERMISSIONS` (camper:read,
  camper:read:sensitive, checkin:write for attendance only — no write permissions).
- `canAccessPerson` and `canAccessChurch` both return `true` for firstAid
  (camp-wide read, like director).
- `CamperDto` widened: `otherMedications`, `medicareNumber`, `parentRelation`
  added (were captured in DB, never surfaced at-camp).
- Dedicated 3-tab SPA set: Search, Schedule, Medical Watch.
- Casualty card: medical section (large/red if conditions), presence (atCamp +
  sign-out/sign-in), parent contact (tap-to-call), leader contacts (masked/reveal).
- Medical Watch list: all `atCamp` campers with any medical flag.
- `GET /campers/medical` route (must be declared before `GET /campers/:id`).
- Medical access logging; Medicare number client-side tap-to-reveal + log.
- Admin can create firstAid accounts; `aRoleChange()` hides church+zone for
  firstAid (camp-wide, no scoping).

### `docs/spec/06-implementation-plan.md` (506 lines)
- Pre-flight checklist (typecheck + test + `npm install exceljs`)
- ASCII dependency map
- Six sprint breakdowns each listing: backend changes, SPA changes, test updates,
  deployment checklist (local + Vercel), env vars to confirm
- Per-file change summary table (every file touched across all sprints)
- Regression risk register and mitigations
- Resolved decisions summary (8 items)
- Testing strategy: vitest per sprint, tsc --noEmit, post-deploy Python harness
- Effort estimates: ~11 developer-days total

### `docs/spec/07-validation-tests.py` (1644 lines / 32 test methods)
- Runnable immediately:
  `CAMP_URL=https://my-youth-camp.vercel.app ADMIN_USER=admin ADMIN_PASS=xxx python3 docs/spec/07-validation-tests.py`
- `BaseTestCase` handles login, API calls, setUp (test church + camper +
  firstAid account), tearDown (handles partial failure)
- 6 `TestCase` classes: `TestPresenceModel`, `TestCheckinUX`, `TestAdminSetup`,
  `TestExportCompliance`, `TestFirstAidRole`, `TestRegressionSafety`

---

## Key architectural decisions made and locked

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Presence source of truth | `atCamp` written by `withSignEvent` only | Eliminates the P0 bug; clean single writer |
| Laptop interface | Responsive same SPA, additive CSS only | One codebase, one deploy, zero regression risk |
| Excel workbook | `exceljs@^4.4.0` server-side | CJS-compatible, Vercel-safe, no temp files |
| New-year passwords (R9) | Generate temp passwords + close-out export | Self-contained; no extra auth plumbing |
| Camp scale | Large (20+ churches, 400+ campers) | Drives roster filtering, export sizing |
| Zones | 4 hardcoded (Yellow/Blue/Green/Red) | No change needed; simpler |
| First-aid | New dedicated `firstAid` role | Clean RBAC separation; read-only on records |
| Compliance record | `signOutHistory` (not daily check-in) | Sign-in/sign-out is the duty-of-care trail |

---

## Two open decisions still to resolve before Sprint 5

1. **Vercel function bundle size** — confirm `exceljs` keeps the Vercel function
   under 50MB compressed. Check locally with `vercel build --debug` before
   deploying Sprint 5.
2. **`force: true` policy** — decide whether the wipe-guard override
   (`POST /admin/new-year?force=true`) should be admin-only or require a
   secondary confirmation code for extra safety.

---

## Where to start

```
docs/spec/README.md          — index and quick-start
docs/spec/06-implementation-plan.md  — open this first; build guide
docs/spec/01-p0-presence-model.md    — Sprint 1, change 1
docs/spec/07-validation-tests.py     — run after every sprint deploy
```
