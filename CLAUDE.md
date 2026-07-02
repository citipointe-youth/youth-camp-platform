# CLAUDE.md — Youth Camp Platform

> **Scope:** the real **camp** app — TS/Express backend (`src/`) + `public/` SPA. The offline demos live in `../youth app demo/CLAUDE.md` (that folder is the Vercel deploy source for the **demo** at `yc-camp-demo`). **This repo auto-deploys the real app to https://my-youth-camp.vercel.app on push to `master`.** Project map: `../CLAUDE.md`. Sibling app: `../youth-allocation-platform/CLAUDE.md`. Change workflow: `../CHANGE-PROMPTS.md`.

Guidance for Claude Code when working in this package. Read this before editing.

## What this is

A **combined** youth camp management platform that merges two previously separate apps:

- **Hub** (pre-camp): registrant management, accommodation allocation, blue card & payment tracking, registration codes, FAQ
- **Portal** (at-camp): daily check-in (twice daily), student notes, zone notifications, schedule, devotionals, contact search, CSV import

An admin can switch the entire app between modes via `POST /admin/mode`. Other logged-in sessions pick up the mode change automatically on next home-tab navigation (no logout required) — `RENDER.home` re-fetches `/settings` and rebuilds tabs if `campMode` changed.

The app is **platform-agnostic**: persistence is in-memory (optionally snapshotted to JSON files), with a Supabase backend deployed to production (`PERSISTENCE=supabase`). Swapping the backend touches only `src/container.ts` + new repository implementations.

## ✅ DEPLOYED — live on Supabase (2026-06-22)

**Production: https://my-youth-camp.vercel.app** (`PERSISTENCE=supabase`). The port from
in-memory to a real Supabase backend is done and serving traffic.

| | |
|---|---|
| **GitHub** | `citipointe-youth/my-youth-camp` — **auto-deploys from `master`** |
| **Vercel** | team `citipointe-youth`, project `my-youth-camp` (serverless via `api/index.ts`) |
| **Supabase** | ref `nwfafrgojqkxylbppywo` (Sydney); all 16 tables applied; reached via `DATABASE_URL` (transaction pooler) |
| **Login** | `admin` (username, not email); password set in the DB post-deploy |

Trackers: **`CHANGELOG.txt`** (phase-by-phase + KNOWN RISKS), `docs/PROGRAM-LOG.md` (initiative log),
`docs/PROGRAM-SUMMARY.md`, `docs/CODE-QUALITY-LOG.md`, `docs/archive/` (historical).

### ⚠️ Two deploy-only gotchas — DON'T regress these (neither is caught by `tsc`/`vitest`)
1. **`tsconfig` must emit CommonJS** (`module: CommonJS`, `moduleResolution: Node`). Switching
   back to `ESNext`/`Bundler` makes `@vercel/node` crash on load with *"Cannot use import
   statement outside a module"* (it runs the traced output as CJS). Mirrors the CMS config.
2. **`.gitignore` must keep the `/data/` rule anchored** (leading slash). An unanchored
   `data/` also matches `src/data/`, which silently drops `src/data/seed.ts` from git — CLI
   deploys still work but the git auto-deploy fails with *"Cannot find module './data/seed'"*.

### Status of the bigger roadmap
- **Gate 0 passes** — `npm run typecheck` clean, **261 tests pass**.
- **Supabase repo layer is complete and wired** (`PERSISTENCE==='supabase'` branch in `container.ts`); migrations applied; all repos verified round-tripping in prod (R11 closed).
- **Phase 1 (Person unification) is COMPLETE.** The unified `Person` entity/repo/service is the live path. `/registrants` and `/campers` are lifecycle-filtered DTO views over `PersonService` — no separate Registrant/Camper services exist. The Supabase layer targets the `people` table. `docs/STEP4-SWITCHOVER.md` has been archived.
- **Fixed defects** (now compiler-confirmed): app-won't-start, accommodation availability (B1), reset/new-year (A3/A4), timezone (B3), CSV import perf + BOM (C1), remind scoping (C2), stateless auth + security headers + login rate-limit.

### Audit fixes applied (2026-06-23)
A deep audit across three areas was completed and all bugs addressed. Key changes:

**Permissions & RBAC:**
- `attendance:write` is now a separate permission from `checkin:write`. `firstAid` gets `attendance:write` (sign-in/out only); all other roles get both. `PersonService.signEvent` asserts `attendance:write`; `checkIn` still asserts `checkin:write`. firstAid is now blocked from daily session check-ins at the API level, not just the UI.

**Mode switching:**
- `RENDER.home` re-fetches `/settings` on every home-tab navigation and silently updates `CAMP_MODE` + rebuilds tabs if the admin switched mode on another device. No logout required.

**SPA bug fixes:**
- **BUG-04**: `chevron` and `clock` added to `ICONS` — firstAid rows, wizard, and schedule tab no longer show blank SVGs.
- **BUG-05**: `TAB_OF.schedule` corrected from `'home'` to `'schedule'` — firstAid Schedule tab now highlights correctly.
- **BUG-06**: Dead `api('/campers')` call removed from `renderOversightPulse` — no more double fetch on every at-camp home load.
- **BUG-07**: Leader phone numbers in search results now use `telLink()` — tappable on mobile.
- **BUG-03**: `revealMedicare` no longer re-fetches `/campers/:id`; uses `_currentCasualtyCard` set by `openCasualtyCard` — audit POST still fires.
- **BUG-09**: Director gets a wide-nav sidebar (`Home, Check-in, Search, Notes, Import, Records & Export`) instead of a blank nav. Records & Export tile already shown for director on the admin console.
- **BUG-16**: `doNewYear()` year is now `SETTINGS.year + 1` (not `new Date().getFullYear() + 1`).

**Wipe guard (BUG-01, BUG-02, BUG-19):**
- `adminNewYear()` (Admin → Data path) now redirects to the guided close-out flow instead of calling the backend without `force`/`confirmWipe`. The "Purge & start new year" button is replaced with a link to Records & Export.
- `adminReset()` now requires typing the confirmation string AND sends `force:true` + `confirmWipe` to the backend. 409 responses show a modal pointing to Records & Export.
- Admin → Data no longer has two competing new-year paths (BUG-19 resolved).

**Backend:**
- **BUG-08**: Audit controller reads settings *after* the service call so `lastExportedAt` stamp never races with `lastTempPasswords` clearing.
- Import service preserves existing `elvantoMeta` on update if the CSV row has no `dateSubmitted`.

**New tests:**
- `access-control.test.ts`: 6 firstAid permission + `canAccessPerson`/`canAccessChurch` cases (BUG-11).
- `import.service.test.ts`: 3 dry-run cases — no-persist, phantom-church, `dryRun:true` in result (BUG-10).
- `person.service.test.ts`: 4 `listMedicalWatch` cases — atCamp filter, departed excluded, church scoping, firstAid access (BUG-12).
- `admin.characterisation.test.ts`: `BadRequestError` import added; `force:true` alone throws `BadRequestError` for `newYear` (BUG-13).

## Improvement Initiative — Phases 1–7 deployed (2026-06-28)

A 7-phase improvement program (CMS engineering-maturity patterns onto this app's identity) was
completed and deployed to production on 2026-06-28. See `docs/PROGRAM-LOG.md`,
`docs/PROGRAM-SUMMARY.md`, `docs/CODE-QUALITY-LOG.md`, and the dated `CHANGELOG.txt` section.
Contract changes that supersede notes below:
- **Responsive system:** `:root` now has a fluid **type scale** (`--t-display`…`--t-micro`) and the
  `html` root font scales 16→17→18px at 768/1280. Continuous breakpoints (540/768/900/1280) sit
  before the 980px sidebar block; the content column widens 460→820px below 980. Use the `--t-*`
  tokens (and `--pad`, gender `--male/--female`, tint `--violet-d/--lav` etc.) — don't hardcode.
- **Icons:** SVG-only (no emoji). `ICONS` registry + `ic()` and new size helpers
  `icSm/icLg/icXl(n,cls)` + `emptyState(icon,msg)`. Adding a glyph = add to `ICONS`.
- **Navigation:** **single source** `navModel(role,mode)` → `{tabs,extras}`. `buildTabs` (bottom)
  and `_renderWideNav` (sidebar, via `navSidebar`) both derive from it — change nav in ONE place.
  Church/zoneLeader now have a populated desktop sidebar; admin at-camp sidebar = Home, Check In,
  Search, Notices, Accommodation Allocations, Admin Settings.
- **Budget:** REBUILT. Costs come from per-registrant `registrationCost` (NOT
  `CampSettings.tentPrice/classroomPrice`, which are now deprecated/unused — removed from the
  Settings UI, columns left in DB). Pure logic: `src/services/budget.ts` (`computeBudget`/
  `labelForAmount`/`budgetToCsv`). Categories = distinct cost per (church, camper|leader); null
  cost = "Cost not recorded" ($0, flagged, never dropped); grand total reconciles to the sum of all
  line totals. SPA `RENDER.budget`/`drawBudget` mirror it (collapsible church rows + client CSV).
- **Check-in sessions (AC-1):** `buildSessions` now makes the **first** camp day **PM-only**, the
  **last** day **AM-only**, interior days AM+PM (1-day camp = PM-only).
- **Accommodation (PC-10):** a church×gender classroom pool **>50** splits into `7-9`/`10-12`
  sub-pools (keys `${churchId}|${gender}|${bracket}`); leaders halved across brackets;
  `AllocationOccupant` gained `grade`. Single-gender/auto-fill/cascade unchanged. Tent City headings
  show total student/leader tents (PC-11).
- **Removed concepts:** "unpaid" is gone from the home DTO/UI (PC-3); FAQ/Help is pre-camp only
  (PC-7). `paymentStatus` field + reminders feature remain.
- **Service worker:** `sw.js` is now `camp-v7` (stepped v3→v4 P1 →v5 P4 →v6 P5 →v7 P6); `API_RE` includes `/export` (was missing).

### Phase 4 (first-aid login UX) — deployed 2026-06-28
- **firstAid nav** = **Search · Records · Schedule** (`navModel('firstAid')`). Search is the landing
  (no `home` tab — `gotoTab` redirects home→search for firstAid). **Medical Watch removed** (no Watch
  tab, no `/campers/medical` on the first-aid path).
- **First-aid records** = `StudentNote{category:'firstaid'}` (no migration). Body is 4 labelled lines
  `Problem:`/`Treatment:`/`First-aider:`/`Brought by:`. Written via `POST /notes` (category-scoped),
  read via **`GET /notes/firstaid`** (only firstaid category, `canAccessPerson`-scoped).
- **RBAC:** new `note:write:firstaid` (firstAid+director+admin) and `note:read:firstaid`
  (firstAid+zoneLeader+director+admin+**church**, the last own-church only). `note.service.add`
  asserts the firstaid capability **only** when `category==='firstaid'`; first-aiders can write/read
  ONLY first-aid records, never general notes/testimonies. **church can READ own-church first-aid
  records but not WRITE them** and has no general `note:read`.
- **Student Info** (renamed from "Casualty Card", `openStudentInfo`) leads with the student's
  **ministry leader** contacts (primary+secondary, via the existing `GET /search/contacts/:id`
  masked-contact path + audited reveal — no new permission); parent is the bottom fallback. Medical
  alert + consent are tone-softened; allergy-type dietary items are merged into the alert.
- **Admin Notes** (`RENDER.notes`/`drawNotes`): a **"First-aid"** Record-filter option + amber badge +
  Problem/Treatment body render; the notes CSV export already carries them (category column).
- **Tokens:** added `--ink-2` (darker secondary text) + softened `--alert-*`/`--consent-*` palette;
  all first-aid hardcoded hex tokenised (C1/C3 for these screens).

## UI/bugfix batch — deployed 2026-06-30

A small fix batch (admin-requested) shipped on 2026-06-30:
- **Account login locks (NEW).** `CampSettings` gained `churchLoginLocked` + `zoneLeaderLoginLocked`
  (both default `false`; migration `014`). Two **manual** toggles in admin **Settings**
  (`RENDER.adminSettings`/`saveSettings`, `.tgl` switch). When on, accounts of that role are
  blocked **at login only** — `auth.service.login` checks the lock *after* the password (so a
  locked account can't be probed) and throws `UnauthorizedError`. **Existing signed sessions keep
  working until their 12h TTL** (no per-request enforcement — stateless tokens carry the actor).
  admin/director/firstAid are never affected. `makeAuthService(users, settingsRepo?)` — the
  settings repo is optional (login lock is a no-op when absent, e.g. in unit tests). There is **no**
  automatic date-based trigger (deliberately dropped — the app is serverless with no scheduler).
- **Devotional editor:** the per-day **Save** button moved to the tile's **top-right**, inline with
  the day header (`RENDER.adminDevos`, `.rowsb` header row).
- **Tooltips (`helpTip`):** budget "Total registration fees" tip **removed**; long tips shortened;
  `_clampTip()` (called from `_toggleTip` on tap + a delegated `mouseover`) nudges the bubble so it
  never runs off either screen edge. Added brief at-camp tips to **first-day sign-in, daily
  check-in, My Youth, student search, testimonies**.
- **Accommodation allocations page** (`drawAccom`): heading **"Classroom rooms" → "Classrooms"**;
  **"Not in a classroom allocation" → "Classrooms (Pending Allocation)"**; the pending-allocation
  table now pads **every** column (not just the first) so it doesn't crowd on a phone, count
  right-aligned. (The separate Accommodation **setup** screen `RENDER.adminAccom` still says
  "Classroom rooms" — the rename was scoped to the allocations page only.)

## UI/UX fix batch — deployed 2026-07-01

Admin-requested batch (pre-camp). **SPA-only** (`public/index.html`) — no backend/schema change,
no migration. Verified: SPA `node --check` OK, `npm run typecheck` clean, `npm run test` = 270 pass.
- **Schedule-edit overlap (phone):** `_schedRow` grid is now `96px minmax(0,1fr) auto` (row **and**
  its header) + a `.sched-row input{min-width:0}` rule. Native `<input type="time">` keeps
  `min-width:auto` and was overflowing the fixed 92px Time track into the Activity field on narrow
  screens — the `minmax(0,1fr)` + `min-width:0` lets both inputs shrink to their tracks.
- **Setup wizard (`WIZARD_STEPS`) expanded + reordered** into a logical setup flow:
  Camp settings → Churches → Accounts → **Accommodation rooms** → **Accommodation allocation** →
  Schedule → **Devotionals** → **FAQ** → **Ministry contacts**. The four new steps (`accomAlloc`
  →`accom`, `devos`→`adminDevos`, `faq`→`adminFaq`, `contacts`→`adminContacts`) auto-detect "done"
  like the originals: allocation = any room in `/accommodation/allocations` has an occupant;
  devotionals = any `checkInDays` day has verse/reflection/prayer; FAQ = ≥1 `/faq` entry; contacts =
  any church has ≥1 named leader. ("Accommodation" → "Accommodation rooms" to distinguish it from
  the new allocation step.) Each step also carries a `tip` rendered as a `helpTip('…')` bubble beside
  its label (Bug 3 — a short tooltip per wizard item).
- **Global top loading bar (`#nprog`, NEW):** a thin accent bar under the top edge, driven from
  `_doFetch` via reference-counted `_npStart`/`_npDone` (creeps to 90%, snaps to 100% on completion,
  fades). Addresses the "screen sits still 1–1.5s after a button push" complaint (genuine serverless
  + Supabase round-trip latency; stale-while-revalidate revisits showed no loading hint). **Only real
  network requests drive it** — cached GETs bypass `_doFetch`, so instant navigations don't flash the
  bar. `#nprog` is the first child of `.app` (absolute `top:0`); tune colour/height in that one CSS rule.
- **Latency quick-win:** `_prefetch` now also warms `/accounts/churches` + `/accounts/users` for
  admin/director on login (the Accounts, Ministry-contacts and Wizard screens then open from cache).

## Feature batch — deployed 2026-07-02

Admin-requested batch (SPA + backend + **migration 016**, applied to prod):
- **Account Info (Accounts screen):** "Rename" + "Change username" are consolidated into one
  **Account Info** modal per tile (edit icon; key = password, trash = delete — the separate @
  username action is gone, `editUsername`/`saveUsername` deleted). Leadership modal = name +
  username + zone (zoneLeader) + status; church modal = church name + login username + zone +
  **accommodation override**.
- **Accommodation override (NEW):** `Church.accommodationOverride: 'tent'|'classroom'|null`
  (`churches.accommodation_override`, migration `016`). At **CSV import**, every **student** of a
  church with an override is forced to that kind (create + update paths, `churchOverrideById` map
  in `import.service`); leaders never overridden; a warning row is emitted when a CSV value is
  actually changed. Churches that deliberately split ticket types leave it unset. Set via Account
  Info; `UpdateChurchSchema.accommodationOverride`.
- **At-camp admin console:** Setup Wizard tile is **pre-camp only**; at-camp shows **"Individual
  Student Data Edit"** (`RENDER.adminStudents`, admin only): all students (merged
  `/registrants`+`/campers`), church/gender/grade filters + name search, row-tap edit of core
  fields (name, church, gender, grade, accommodation, medical, dietary) via
  `PATCH /registrants/:id`, and manual **Add student** (`POST /registrants`) created as
  `registered`/not-at-camp (signs in via First-day arrivals). Backend: registrant PATCH accepts
  `churchId/churchName/zone`; create accepts `medical`/`dietary`; **`CamperDto` gained
  `accommodationKind`**; SPA `_invalidate('/registrants')` now also clears `/campers`+`/checkin`.
- **Tooltips:** church auto-creation + override explained on the "Add a church" card and the
  wizard Churches step.

## UI/UX fix batch — deployed 2026-07-02 (at-camp bug list)

Admin-requested batch (at-camp, from "Admin Mode: at camp"). **SPA-only** (`public/index.html`) —
no backend/schema change, no migration. Verified: SPA `node --check` OK, `npm run typecheck`
clean, `npm run test` = 275 pass.
- **Daily check-in tile decluttered:** `rowHtml` (in `RENDER.checkin`) dropped the initials avatar,
  the "med" medical-flag badge, and the always-visible grey sync dot (per-row sync state is now a
  silent no-op — the existing top-of-list `ci-sync` banner is the only sync-status UI). The
  check-in button is now a primary solid pill labelled "Check in"/"Check out" (ghost once already
  checked in), sized larger than the ghost "Add note" button beside it.
- **`.pill` badges no longer wrap on phone:** ("View ›" on the Data/Budget/Accommodation nav cards
  was breaking onto two lines when squeezed by a long sibling in the same `.rowsb`) — `.pill` CSS
  gained `white-space:nowrap;flex-shrink:0`.
- **Phone-number display normalized (`fmtPhone`, NEW):** AU mobiles now always render as
  `0411 928 301` regardless of source formatting, including CSV imports that lost the leading 0 to
  spreadsheet numeric coercion upstream (a 9-digit `4xxxxxxxx` is re-prefixed with `0`). Applied
  everywhere a phone number is *displayed* (Data tab, `telLink`, first-aid leader/parent contacts,
  student search reveal, Student Info/camper detail) — editable phone `<input>` fields (ministry
  contacts editor) are untouched so admins can still type freely. Masked contact numbers
  (`0411****01`) pass through unchanged.
- **Data tab (`RENDER.data`) is sortable:** clicking a column header cycles
  unsorted→ascending→descending→unsorted (`dataSort`); unsorted is the **default import order**
  (`_dataCache` sorted by `createdAt` ascending client-side, since `/registrants` itself returns
  alphabetical order) rather than whatever order the last sort left it in.

## Multi-source CSV import (Form / Ticket List / Invoice) — deployed 2026-07-02

Elvanto now exports three separate CSVs instead of one manually-merged file. Full design at
`docs/superpowers/specs/2026-07-02-multi-source-import-design.md`. **Column headers were
corrected against a real sample** (`Sample Data New/` sibling folder, 2026-07-02) after initial
implementation — real Ticket List headers are `Event Occurrence information` (not `Event
Occurrence`) and `Invoice Payment Status` (not `Payment Status`); real Invoice/Billing Contacts
headers are plain `First Name`/`Last Name` (not `Billing First Name`), `Fees Paid` (not `Fees`),
`Total Tax` (not `Tax`). Ticket List also has a `Ticket Status` column not anticipated at design
time — a ticket whose status isn't `Active` (case-insensitive) is now skipped with a warning
rather than treated as confirmed accommodation truth (e.g. a cancelled/refunded ticket). All of
this is covered by `src/services/multi-source-import.integration.test.ts`, which runs the actual
three real sample files end-to-end through all three importers in sequence and asserts the final
state — including that the Invoice file's billing contact is often a **parent**, not the
registrant (e.g. an invoice billed to "Jacqueline Hales" covering attendee "Gizelle Hales"),
which is exactly why invoice-number matching is tier 1 and billing-name matching is only a
fallback. The multi-alias `field(row, ...)` pattern made all of these corrections low-risk,
additive changes — no matching/merge logic needed to change.

- **Three backend services, one shared core.** `src/services/import.service.ts` (existing, Form —
  `POST /import/csv`, unchanged behaviour except the blank-clobber fix below) stays the
  authoritative full-roster import (church-scoped matching, **still deletes anyone absent from the
  file**). Two new sibling services, mirroring the existing `church-import.service.ts` pattern:
  `src/services/ticket-import.service.ts` (`POST /import/tickets`) and
  `src/services/invoice-import.service.ts` (`POST /import/invoices`) — **neither ever deletes**.
  All three share `src/services/person-matching.ts` (NEW): `findPersonMatch` (cross-church name
  index, exact-then-bounded-Levenshtein-≤2 fuzzy fallback, only auto-matches a single unambiguous
  candidate) and `mergeOwnedFields` (a field only overwrites if the incoming value is non-blank —
  the same primitive that fixed the Form-import bug below).
- **Field ownership, enforced structurally (not by convention):** Form owns grade/gender/medical/
  dietary. Ticket List owns `accommodationKind` (+ NEW `accommodationKindConfidence:
  'guessed'|'confirmed'|null` — Ticket List always sets `'confirmed'`, unconditional overwrite,
  unless `Church.accommodationOverride` applies, which still wins and is also `'confirmed'`), NEW
  `ticketNumber`, NEW `invoiceNumber`, `paymentStatus`. Invoice owns `registrationCost` (reused as
  "ticket total"), `discountCode` (reused), NEW `discountAmount`/`amountPaid`/`feesAmount`/
  `taxAmount`, and may **guess** `accommodationKind` (`confidence:'guessed'`, never overwrites a
  `'confirmed'` value) by exact-cents-matching the invoice total against a price→type table built
  **dynamically every run** from already-confirmed Ticket-List people this season (requires ≥3
  confirmed samples at that exact price AND a ≥90% kind-majority before trusting it).
- **No confident match → orphan + flag, never silently discarded (Ticket List/Invoice only).**
  Ticket List creates a new `Person` with NEW `needsReview:true` + `needsReviewReason` (no
  `churchId` — verified this makes it invisible to church/zoneLeader RBAC scoping automatically,
  visible only to admin/director). **Invoice never creates a person** — `Person.churchId` is
  non-nullable and the Invoice export has no church field, so an unmatched invoice goes into the
  response's `unmatchedInvoices[]` for manual reconciliation instead of a fabricated record. An
  invoice matching >1 person (shared invoice number) withholds all `$`/accommodation fields for
  everyone in the group (can't attribute a shared total) but still applies a flat `discountCode`.
- **Form-import blank-clobber bug fixed:** `parseGender`/the update-merge branch previously reset
  a matched person's `gender` to `'other'` (and several other fields to blank) whenever the
  current CSV row's cell was empty — a real, live bug on ordinary Form re-imports, unrelated to
  the new sources. Blank cells now preserve the existing value on update; `'other'` remains the
  create-time default only. `zone` is deliberately still unconditional (it's church-derived, not
  CSV-derived — re-importing is how it stays in sync with the church record).
- **SPA:** one upload screen, a Form/Ticket List/Invoice `.seg` source selector
  (`IMPORT_SOURCES`/`setImportSource`/`_importUploadCardHtml`, same segmented-control pattern as
  the check-in day selector) reusing the existing dry-run→preview→confirm flow, parameterized by
  endpoint. Data tab (`RENDER.data`) gained a `needsReview` filter + column (`reviewCell`/
  `openReviewModal`/`_markReviewed` — PATCHes `needsReview:false`, no merge tool, manual
  reconciliation only) and an `Accommodation` column with an amber "Guessed" pill only on
  `confidence==='guessed'` (no badge for `'confirmed'`/`null`, matching the app's only-badge-the-
  exceptional-state convention).
- **Migration `017_ticket_invoice_import_fields.sql`** — 8 new nullable `people` columns (+
  `needs_review not null default false`); also fixed a **pre-existing, unrelated** bug where
  `PERSON_UPDATE_COLS` (Supabase `on conflict do update set` list) was missing `elvanto_meta`/
  `medicare_number`/`church_unlisted_note`, so those three fields silently never updated on save.

## Commands (run from this folder)

```bash
npm install
npm run dev          # backend + frontend on http://localhost:4200 (tsx watch)
npm run start        # same, no watch
npm run typecheck    # tsc --noEmit (strict)
npm run test         # vitest
```

Default port: **4200**. Set `PORT=xxxx` to override.

> **Verify & deploy convention:** verify changes with `npm run typecheck` + `npm run test` (+ grep/
> reasoning) — **do not start a localhost dev server or drive a browser to test**, and flag CSS/
> layout changes for the user to eyeball on-device. GitHub is linked to Vercel, so a **push to
> `master` is the deploy** — no need to poll Vercel or curl prod to confirm it shipped.

### Persistence modes & env vars

| `PERSISTENCE` | Backend |
|---|---|
| `memory` (default) | In-memory; demo seed runs on startup |
| `json` | In-memory + JSON files in `DATA_DIR` |
| `supabase` | Supabase Postgres (requires `DATABASE_URL`) — **the live production backend** (ref `nwfafrgojqkxylbppywo`; use the transaction-pooler URL on port 6543, not the IPv6-only direct host) |

```
PORT=4200
NODE_ENV=production
PERSISTENCE=supabase           # production; "memory" for local dev with seed data
DATABASE_URL=<supabase-connection-string>
SESSION_SECRET=<32+ random bytes>   # REQUIRED in prod — tokens are forgeable without it (warns on startup)
DATA_DIR=./data                # only for PERSISTENCE=json
CORS_ORIGINS=https://camp.<your-domain>   # lock this; '*' warns in prod
```

Auth is **stateless HMAC sessions** (signed with `SESSION_SECRET`) — no server-side token
store, so logout is client-side and tokens stay valid until their 12h TTL.

## Architecture

```
api (Express) → controllers → services → repositories (interfaces) → core
```

- **`src/core/`** — pure types, entities, enums, Zod schemas, errors. No imports from other layers.
- **`src/repositories/`** — interfaces (DB-swap surface) + in-memory implementations + JSON file persistence.
- **`src/services/`** — all business logic + RBAC. Depend on repo *interfaces* only.
- **`src/api/`** — thin controllers → declarative route table (`http/router.ts`) → Express adapter. Express lives only under `src/api/http/` and `src/api/middleware/`.
- **`src/container.ts`** — composition root. The only file that names concrete repositories.

## Roles

| Role | Scope | Key capabilities |
|------|-------|-----------------|
| `church` | Own church | Registrant read/write, daily check-in, write notes |
| `zoneLeader` | Own zone | All of above (zone-scoped), read notes, send zone notices, read registrants in zone |
| `director` | All | All of above (camp-wide), import, camp-wide notices |
| `admin` | All + back office | Everything + admin:manage (settings, accounts, accommodation, FAQ, schedule, devotionals, mode switch) |
| `firstAid` | All | `camper:read`, `camper:read:sensitive`, `attendance:write` (attendance only, NOT `checkin:write`), **`note:write:firstaid`** + **`note:read:firstaid`** (Phase 4 — first-aid records only, never general notes/testimonies). No admin, no pre-camp data. |

There is always exactly one `admin` account. It cannot be deleted or deactivated.

## Camp mode

`CampSettings.campMode: 'pre-camp' | 'at-camp'`

- Controls which tabs and admin tiles appear in the UI.
- Switched via `POST /admin/mode { campMode }`.
- Admin console is **identical in both modes** — admins can configure at-camp content (devotionals, schedule) while still in pre-camp mode.

## At-camp preview (client-side only)

Users in pre-camp mode can tap **"👁 Preview at-camp view"** on the pre-camp home screen to enter a read-only preview of the at-camp UI. This is **entirely client-side** — no backend change, no mode switch.

- **State:** `PREVIEW_MODE: boolean` (in-memory only, never persisted).
- **Entry:** `enterPreview()` — sets `PREVIEW_MODE=true`, flips `CAMP_MODE` to `'at-camp'` locally, shows amber `#previewBanner` strip, rebuilds tabs, navigates home.
- **Exit:** `exitPreview()` — restores `CAMP_MODE` from `SETTINGS.campMode`, removes banner, rebuilds tabs.
- **Write blocking:** the `api()` function short-circuits any non-GET request while `PREVIEW_MODE` is true — shows a toast and throws. Covers every write in the app without per-screen changes.
- **Logout safety:** `logout()` clears `PREVIEW_MODE=false` before POSTing to `/auth/logout` so the write guard never blocks logout itself.
- All roles can enter preview. Preview uses real live data (campers, schedule, devotionals already imported).

## Daily check-in (twice daily)

**De-linked from the schedule (2026-06-25).** Check-in sessions are now derived purely from
`CampSettings.checkInDays` — **two synthetic sessions per camp day** (Morning 08:00 / Afternoon
13:00), generated in `src/services/checkin-sessions.ts`. The schedule is unrelated to check-in
(it is pure plan communication); `ScheduleItem.isCheckInPoint` and `getCheckInPoints` no longer
exist.

- **(AC-1, 2026-06-29)** the **first** camp day generates a **PM session only** (arrive at lunch),
  the **last** day an **AM session only** (depart at lunch); interior days keep AM+PM; a 1-day camp
  is PM-only.
- Session id = **`${day}~am` / `${day}~pm`** (e.g. `2026-09-28~pm`) — delimiter is `~`, URL-safe (a `#` would be parsed as a URL fragment when the id is put in a request path; SPA also `encodeURIComponent`s it); this is the key in
  `Camper.checkInHistory[].sessionId`.
- `getCurrentSession()` picks today's AM before midday / PM after (camp tz); falls back to the
  most recent past session. Both `checkin.service` and `dashboard.service` use the shared pure
  helper (`buildSessions` / `currentSession`).
- `checkInDays` is auto-generated from start/end dates in the admin Settings screen (each date
  inclusive); setting the start date pre-fills the end date to the 4th day.
- The frontend shows compact session labels (`Mon AM`, `Mon PM`).
- **Optimistic check-in queue** (`CHECKIN_QUEUE`): taps flip local state immediately and drain to the server in order. Retries with exponential backoff on network failure; hard-drops on 4xx. Undo toast gives 4-second reversal window.

## Presence model (P0 — critical invariant)

`atCamp` and `lifecycle` are **orthogonal**:

- `atCamp` — is the person **physically on site right now?** Only written by `withSignEvent` (attendance sign-in/sign-out path).
- `lifecycle` — registration state machine: `registered → arrived → checked_out → departed | cancelled`. Only `withSignEvent` advances this beyond `registered`.
- `withCheckIn` (daily session log) **never** touches `atCamp` or `lifecycle`. It appends to `checkInHistory` only.
- `checkIn()` in `person.service.ts` guards: throws `BadRequestError` for `lifecycle === 'cancelled'` OR `atCamp === false`. Day-1 first-arrival must go through `signEvent` (attendance sign-in), not the daily check-in path.
- The check-in roster in `getSessionStatus` filters on `p.atCamp === true`, not `isCamper(p)` — departed campers (`atCamp:false`) never appear on the daily roster.
- `checkInsDue` on the at-camp dashboard is scoped to `atCampNow` (persons with `atCamp===true`), not all `isCamper()` persons. This prevents departed campers inflating the "still to check in" count.

## Key design rules

- **RBAC in one file**: `src/services/access-control.ts`. Never scatter role checks.
- **Validation inside services**: all external input parsed with Zod inside the service, not the controller.
- **Repos return deep clones**: in-memory base repository clones on every read/write.
- **Accommodation lock**: `CampSettings.accommodationLocked` — server blocks non-admin writes when true.
- **Extensionless imports**: ESM, `moduleResolution: "Bundler"`, no `.js` extensions. Each folder has an `index.ts` barrel.
- **Strict TypeScript**: `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Guard all indexed access.

## Frontend files

| File | Purpose |
|------|---------|
| `public/index.html` | Production SPA — rebuilt 2026-06-10 from the demo. UI redesigned 2026-06-23 (indigo/purple palette, Plus Jakarta Sans). |
| `ui-mocks.html` | Static HTML mock renders of all key screens — shows the redesigned UI and P0–P4 feature updates. Open in a browser. |
| `../youth app demo/camp-platform.html` | Standalone offline demo — all API calls handled by an embedded MockAPI. The **original UI source of truth**. |

## Design system (updated 2026-06-23)

All tokens live in `:root` in `public/index.html`. Do not use hardcoded hex values for these colours anywhere — use the CSS variables.

| Token | Value | Usage |
|---|---|---|
| `--navy` | `#1e1b4b` | App background, header gradient end |
| `--blue` | `#4f46e5` | Primary buttons, active state, links |
| `--blue2` | `#818cf8` | Progress bar fills, secondary highlights |
| `--purple` | `#9333ea` | Tile icons, hero gradient start, pre-camp badge |
| `--violet` | `#7c3aed` | Button gradient start, header gradient start |
| `--teal` | `#06b6d4` | Devotional hero card |
| `--paper` | `#f5f4ff` | App background (light purple tint) |
| `--line` | `#e4e2f5` | Borders |

**Font:** Plus Jakarta Sans (Google Fonts, loaded in `<head>`). System font stack is the fallback.

**Header bar:** `linear-gradient(135deg, var(--violet), var(--navy))`.

**Hero cards:** `radial-gradient(130% 130% at 0% 0%, #9333ea, #1e1b4b 72%)` with two decorative pseudo-element circles.

**Tab bar active state:** pill background `#ede9fe` with `color: var(--blue)`. No underline indicator.

**Buttons:** `linear-gradient(135deg, var(--violet), var(--blue))`. `.btn.ghost` uses `#f1f0ff` background with `#3730a3` text.

## SPA ↔ backend contract (rebuild notes)

The SPA was forked from an earlier demo and had drifted onto the demo's **MockAPI contract**, which differs from the real Express API. When porting a screen from `camp-platform.html`, watch these (the rebuild fixed them all):

- **No envelope.** The backend returns results *bare* (`res.json(result)`); errors are an HTTP error status + `{code,message}`. `api()` returns the bare result and throws on non-2xx. (The demo's MockAPI used `{ok,data}` and `d.actor`; real login returns `{token,user}` and the SPA builds `ACTOR` + a client-side `displayName`.)
- **`/campers` returns a bare array**, not `{items}`. Camper `kind` is `'student'|'leader'`.
- **Check-in status** = `{session, roster:[{camperId,firstName,lastName,church,zone,gender,grade,medicalFlag,checkedIn,lastEntry}], checkedInCount, totalCount}` — roster now includes gender/grade/medicalFlag directly (no second `/campers` fetch needed).
- **Attendance** is `POST /attendance/sign-in|sign-out` with a `camperId` body (not `/campers/:id/sign-*`). Notes for a camper = `GET /notes/camper/:id`. Search reveal = `GET /search/contact/:camperId/:role` (role like `male-primary`).
- **`/home`** DTO differs by mode: pre-camp has `totalCampers/totalLeaders/noBlueCardCount/accommodationSummary[]/perChurchBreakdown[]` (no gender split, no church `code`, no `expected`); the by-ministry M/F table and church code are derived client-side from `/registrants` and `/accounts/churches`.
- **Accommodation (reworked 2026-06-27 to match the prototype):** classroom **rooms** (`/accommodation/classrooms`, name+capacity) + an **allocation map** (`GET/PATCH /accommodation/allocations` = `{roomId:[{key:"churchId|gender", n}]}`) + eligible-group helper (`/accommodation/groups`) + church-facing `/accommodation/church-rooms/:churchId`. Allocatable **groups** = per church×gender (students **and** leaders pooled together) where **≥75% of that church's campers are classroom-kind**; the SPA **auto-fills** a room to capacity (remainder shown as "unallocated"), rooms are **single-gender** (enforced in the service via `validateAllocations` AND the SPA dropdown), and un-allocate cascades freed people into other rooms. **Tents** are not allocated — `tentDistribution` auto-buckets tent-kind campers into **7-person tents, students and leaders separate** (display only). The old `AccommodationBlock` + per-church `reservations` model is **gone** (DB tables dropped in migration `004`). **(SUPERSEDED 2026-06-29 — see "Improvement Initiative" above):** `CampSettings.tentPrice/classroomPrice` are now **deprecated/unused** — removed from the Settings UI; Budget reads per-registrant `registrationCost`, not settings. The eligible-group logic now also **splits a church×gender pool >50 into `7-9`/`10-12` brackets** (PC-10). Pure logic + types: `src/services/accommodation-allocation.ts`. The church "Your accommodation" home tile is shown **only in real at-camp** (`campMode==='at-camp' && !PREVIEW_MODE`).
- **Notes** require a `camperId`; a **testimony** is a note with `category:'testimony'` (so the testimonies screen picks a student). `/notes/recent` has no camper details (joined from `/campers`); `/notes/export` returns a **CSV string** (downloaded directly) with a Category column.
- **Admin paths**: `/accounts/users`, `/accounts/churches`, `/admin/defaults`, `DELETE /admin/notifications`, `/import/csv` (body `{csvData}`, CSV only), `/devotional/:day` (path param). Passwords are **min 8**. Church create needs `churchName`+`zone`+`account*` fields only. (Password edits use `POST /accounts/users/password` `{userId,password}`.)

> **Field removal (2026-06-25):** self-registration was dropped (all registrants arrive via CSV).
> Removed from `Church`: `code`, `selfRegisterSlug`, `expectedCount`, `youthPastorName`,
> `contactEmail` (church name + a **separate** login username are the identity; matching/import is
> by **name**). Removed from `CampSettings`: `checkInLocation`, `checkInFrom`, `registerBaseUrl`.
> Migrations `008`/`009` dropped the columns in prod. The SPA Accounts screen is now one row per
> login (leadership + churches) with rename/username/password/delete icon actions + a legend.

> **SPA perf (2026-06-25):** a 30s client `Cache` wraps GET in `api()` (invalidated on writes via
> `_invalidate`), `_prefetch()` warms common endpoints after login, and `_navTo` is
> stale-while-revalidate (shows the previous render instead of a spinner on revisits). The shell
> (header/tab bar) was already persistent. `sw.js` cache bumped to `camp-v2`.
- **`CamperDto`** includes `dateOfBirth` (added 2026-06-23) — available on all at-camp screens without a separate fetch.

**Backend additions made for the rebuild** (see git history): optional `StudentNote.category` (+ create-schema + enriched CSV export), `DELETE /notifications/:id`, and `contacts` added to `UpdateChurchSchema` (so the ministry-contacts editor can persist). The check-in screen handles an empty session list gracefully (note: `POST /admin/reset` re-seeds without schedule items, so no sessions exist until the schedule is configured).

## Known SPA efficiency rules (do not regress)

- `/registrants` is fetched **once** in `RENDER.home()` before the `isWide` branch — not once per branch.
- `renderOversightPulse()` does **not** fetch `/campers` — roster data (`gender`, `grade`, `medicalFlag`) comes directly from the `/checkin/sessions/:id/status` DTO.
- `renderHomeAtCamp()` fetches `/notifications` once in the initial `Promise.all`. The urgent-notice popup uses `_checkUrgentNoticesFromFeed(feed)` with the pre-fetched feed — never a second `/notifications` call.
- `renderOversightPulse()` is called without `await` from `renderHomeAtCamp()` — the home screen paints immediately and the pulse bars inject asynchronously into `#homePulse`.

## Seed demo accounts (password: `demo1234`)

Logins are **usernames**, not emails (`User.username`; case-insensitive). Real
contact emails live on Person/Church, separate from the login id. The demo
quick-login panel only appears on localhost/dev (gated by `_initDemoLogin()`).

| Username | Role | Church/Zone |
|----------|------|-------------|
| `victory` | church | Victory Church · Yellow |
| `gracepoint` | church | Grace Point Church · Blue |
| `riverbend` | church | Riverbend Community · Black |
| `yellowzone` | zoneLeader | Yellow Zone |
| `director` | director | — |
| `admin` | admin | — |

Passwords are min 6 chars. Admin can create/edit accounts (editable username +
uniqueness), set passwords, and activate/deactivate (`toggleStatus`; the sole admin
can't be deactivated).

## Year-to-year reuse  (reset vs new-year semantics — decided 2026-06-18)

1. Admin sets up churches, accounts, accommodation, FAQ, schedule, devotionals.
2. `POST /admin/defaults` (`saveDefaults`) — snapshots the scaffold (churches, accounts,
   accommodation, FAQ, schedule, **devotionals**) as the baseline. Snapshot strips
   password hashes.
3. After camp: `POST /admin/new-year` (`newYear`) — the **routine rollover**: purges
   people + transient data (registrants/campers/notes/notifications) and **restores**
   the scaffold from the baseline snapshot; keeps the admin account + camp settings
   (bumps year, forces pre-camp). **Requires a saved snapshot.** Restored accounts come
   back password-less (snapshot strips hashes) — operator must set passwords (KNOWN RISK R9).
4. `POST /admin/reset` (`reset`) — **full wipe to bare**: deletes ALL data including the
   scaffold and every non-admin account; keeps only the single admin + camp settings.
   **No** snapshot restore (this fixed defect A4, where reset used to load the snapshot
   then never restore from it).

Both destructive ops use bulk `deleteAll()` (Supabase: `TRUNCATE`), not row-by-row deletes.
