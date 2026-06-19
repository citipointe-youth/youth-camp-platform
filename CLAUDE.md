# CLAUDE.md — Youth Camp Platform

> **Scope:** the real **camp** app — TS/Express backend (`src/`) + `public/` SPA. The offline demos live in `../youth app demo/CLAUDE.md` (that folder is the Vercel deploy source; `git push` here no longer deploys). Project map: `../CLAUDE.md`. Sibling app: `../youth-allocation-platform/CLAUDE.md`. Change workflow: `../CHANGE-PROMPTS.md`.

Guidance for Claude Code when working in this package. Read this before editing.

## What this is

A **combined** youth camp management platform that merges two previously separate apps:

- **Hub** (pre-camp): registrant management, accommodation allocation, blue card & payment tracking, registration codes, FAQ
- **Portal** (at-camp): daily check-in (twice daily), student notes, zone notifications, schedule, devotionals, contact search, CSV import

An admin can switch the entire app between modes via `POST /admin/mode`. All users see the mode on next login.

The app is **platform-agnostic**: persistence is in-memory (optionally snapshotted to JSON files), with a Supabase backend in progress. Swapping to a real DB touches only `src/container.ts` + new repository implementations.

## ⚠️ Production deployment IN PROGRESS — read this first

This package is mid-way through a port from in-memory to a real **Supabase** backend.
The authoritative trackers are:

- **`CHANGELOG.txt`** — every change made, phase by phase, with a **KNOWN RISKS /
  VERIFY LATER** section (R1–R11) that the next session MUST work through.
- **`docs/DEPLOYMENT-DESIGN.md`** — the design + phased implementation plan + decisions.
- **`docs/REMAINING-WORK.md`** — what's left, sequenced, with open questions for the owner.
- **`docs/verification/`** — Python static/behavioural harness used in place of `tsc`/`vitest`.
- **`docs/archive/`** — superseded pre-deployment plans/specs (historical only).

**Critical context for anyone editing:**
- **All deployment work to date was authored WITHOUT a Node toolchain** (no `tsc`/`vitest`/
  `npm`, no network). It is verified by the Python harness + manual review only — a real
  `npm install && npm run typecheck && npm run test` has **not** been run yet and is the
  required gate before trusting any of it (KNOWN RISK R1).
- **Phase 1 (Person unification) is HALF-DONE BY DESIGN.** The unified `Person` entity,
  repo and service exist and are tested, but **nothing live uses them yet** — the app still
  runs on the separate `Registrant`/`Camper` entities/repos/services. The switchover is the
  deferred "Step 4" (needs the compiler + SPA). Don't assume `Person` is active (R2).
- **`src/repositories/supabase/` is UNVERIFIED SCAFFOLDING** — see its `README.md`. The
  schema migrations (`supabase/migrations/`) are written but not applied; most repos aren't
  written yet (R11).
- **Fixed defects so far** (all harness-verified): app-won't-start, accommodation availability
  (B1), reset/new-year semantics (A3/A4), timezone handling (B3), CSV import perf + BOM (C1),
  remind scoping (C2), stateless auth + security headers + login rate-limit (Phase 4 partial).

## Commands (run from this folder)

```bash
npm install
npm run dev          # backend + frontend on http://localhost:4200 (tsx watch)
npm run start        # same, no watch
npm run typecheck    # tsc --noEmit (strict)
npm run test         # vitest
```

Default port: **4200**. Set `PORT=xxxx` to override.

### Persistence modes & env vars

| `PERSISTENCE` | Backend |
|---|---|
| `memory` (default) | In-memory; demo seed runs on startup |
| `json` | In-memory + JSON files in `DATA_DIR` |
| `supabase` | Supabase Postgres (requires `DATABASE_URL`) — **repo layer is unverified scaffolding, see `src/repositories/supabase/README.md`** |

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

There is always exactly one `admin` account. It cannot be deleted or deactivated.

## Camp mode

`CampSettings.campMode: 'pre-camp' | 'at-camp'`

- Controls which tabs and admin tiles appear in the UI.
- Switched via `POST /admin/mode { campMode }`.
- Admin console is **identical in both modes** — admins can configure at-camp content (devotionals, schedule) while still in pre-camp mode.

## Daily check-in (twice daily)

Sessions are derived from schedule items with `isCheckInPoint: true`. There is no hardcoded AM/PM — admins define as many check-in points per day as needed via the Schedule admin screen.

- Each session has its own ID (the schedule item's ID).
- Check-in state is stored per-session in `Camper.checkInHistory[]`.
- `getCurrentSession()` picks the most recently started check-in point for today.
- The frontend shows compact session labels (`Wed AM`, `Wed PM`) derived from day + startTime.

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
| `public/index.html` | Implementation-ready SPA — **rebuilt 2026-06-10 from the demo, wired to the real Express backend.** Same UI/RENDER layer as `camp-platform.html`; demo-only layers (MockAPI/`_DB`/seed/localStorage/phone affordances) removed; a real `api()` + role-based auth substituted. |
| `../youth app demo/camp-platform.html` | Standalone offline demo — all API calls handled by an embedded MockAPI. The **UI source of truth**; the SPA's screens are ported from here. |

> **Demos moved out of this repo.** All demo HTML (landing `index.html`, `camp-platform.html`, the `allocation-*` demos, `exec-presentation.html`, `suite-briefing.html`, `training.html`, `assets/`) now lives in the sibling **`youth app demo/`** folder, which is the Vercel deploy source for `yc-camp-demo`. Deploy with `vercel deploy --prod --yes` **from `youth app demo/`** (CLI; the `.vercel` link lives there). This repo's Git auto-deploy has been disconnected, so **`git push` no longer deploys**. This repo keeps only the real camp backend (`src/`, `public/`, `docs/`).

The mode badge in the header shows **PRE-CAMP** (amber) or **AT CAMP** (green). In the demo, clicking the badge switches mode for anyone; in the SPA the badge is display-only (mode switches via the admin console). The **Day 1/Day 2** badge in the SPA is client-side only (the backend has no `campDay` field).

## SPA ↔ backend contract (rebuild notes)

The SPA was forked from an earlier demo and had drifted onto the demo's **MockAPI contract**, which differs from the real Express API. When porting a screen from `camp-platform.html`, watch these (the rebuild fixed them all):

- **No envelope.** The backend returns results *bare* (`res.json(result)`); errors are an HTTP error status + `{code,message}`. `api()` returns the bare result and throws on non-2xx. (The demo's MockAPI used `{ok,data}` and `d.actor`; real login returns `{token,user}` and the SPA builds `ACTOR` + a client-side `displayName`.)
- **`/campers` returns a bare array**, not `{items}`. Camper `kind` is `'student'|'leader'`.
- **Check-in status** = `{session, roster:[{camperId,firstName,lastName,church,zone,checkedIn}], checkedInCount, totalCount}` — roster has no gender/grade, so the SPA enriches from `/campers`.
- **Attendance** is `POST /attendance/sign-in|sign-out` with a `camperId` body (not `/campers/:id/sign-*`). Notes for a camper = `GET /notes/camper/:id`. Search reveal = `GET /search/contact/:camperId/:role` (role like `male-primary`).
- **`/home`** DTO differs by mode: pre-camp has `totalCampers/totalLeaders/noBlueCardCount/accommodationSummary[]/perChurchBreakdown[]` (no gender split, no church `code`, no `expected`); the by-ministry M/F table and church code are derived client-side from `/registrants` and `/accounts/churches`.
- **Accommodation** = blocks (`/accommodation/blocks`, with `price`) + per-church reservations (`POST /accommodation/reservations`) + `/accommodation/held/:churchId`. There is **no rooms/allocations model** — the demo's room-by-room placement was reworked to the per-church spot model. **Budget prices come from blocks** (settings has no price fields); there is no fee-tier.
- **Notes** require a `camperId`; a **testimony** is a note with `category:'testimony'` (so the testimonies screen picks a student). `/notes/recent` has no camper details (joined from `/campers`); `/notes/export` returns a **CSV string** (downloaded directly) with a Category column.
- **Admin paths**: `/accounts/users`, `/accounts/churches`, `/admin/defaults`, `DELETE /admin/notifications`, `/import/csv` (body `{csvData}`, CSV only), `/devotional/:day` (path param). Passwords are **min 8**. Church create needs `code`+`selfRegisterSlug`+`account*` fields.

**Backend additions made for the rebuild** (see git history): optional `StudentNote.category` (+ create-schema + enriched CSV export), `DELETE /notifications/:id`, and `contacts` added to `UpdateChurchSchema` (so the ministry-contacts editor can persist). The check-in screen handles an empty session list gracefully (note: `POST /admin/reset` re-seeds without schedule items, so no sessions exist until the schedule is configured).

## Seed demo accounts (password: `demo1234`)

Logins are **usernames**, not emails (`User.username`; case-insensitive). Real
contact emails live on Person/Church, separate from the login id. The demo
quick-login panel only appears on localhost/dev (gated by `_initDemoLogin()`).

| Username | Role | Church/Zone |
|----------|------|-------------|
| `victory` | church | Victory Church · Yellow |
| `gracepoint` | church | Grace Point Church · Blue |
| `riverbend` | church | Riverbend Community · Green |
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
