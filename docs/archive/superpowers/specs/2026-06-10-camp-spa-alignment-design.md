# Camp SPA → Camp Demo alignment — design

**Date:** 2026-06-10
**Status:** Draft for review
**Implementer:** the user (not Claude). This spec + its plan are written to be **token-cheap to execute** — every task names the exact demo function(s) to read and the exact SPA insertion anchor, so a session reads ~30 lines, never whole files.

## Problem

`youth app demo/camp-platform.html` (1,749 lines, the canonical/deployed demo) has features the real SPA `Camp Platform/public/index.html` (1,174 lines, the implementation-ready reference) lacks or renders in an older form. The SPA has drifted. Unlike the allocation app, the camp SPA is **not** deployed, so this is about making the reference implementation match the demo for a future real deployment/handoff.

## What's already there (so we don't rebuild it)

The camp SPA is **not a blank slate**. It already has the core plumbing and many screens:
- **Infra:** `api()` (real fetch, line 220), a `RENDER` map + `go()`/`gotoTab()`/`paint()` router (282–289), `buildTabs()` (296), `CAMP_MODE` + `switchMode()` (888), modals/toasts.
- **Screens/flows present:** home (pre + at-camp), My Youth/people, daily check-in, sign-out/in, first-day, search, notes (prompt/review/export), notifications (send), admin console (accounts, churches, accommodation **blocks** CRUD, schedule, devotionals, FAQ, settings, reset/new-year/import).

The **backend is comprehensive** (`Camp Platform/src/`): registrants (+breakdown/chase/remind), accommodation blocks/reservations/held, campers, check-in sessions, attendance sign-out/in, notes (+recent/forCamper/export), notifications, schedule, devotional, FAQ, accounts (users + churches), settings, admin mode/defaults/new-year, import. **So alignment is almost entirely frontend porting against existing endpoints — not backend building.**

## Gap inventory (the actual work)

| # | Feature area | SPA today | Demo anchor (`camp-platform.html`) | Endpoint(s) | Size |
|---|---|---|---|---|---|
| 1 | **Budget & costings** (director/admin) | absent | `RENDER.budget` 1052, `drawBudget` 1063, `budgetAmount` 1062 | `GET /registrants`, `GET /settings` | M |
| 2 | **Accommodation allocation UI** (classroom rooms allocate by ministry/gender + Tent City auto-distribute) | blocks CRUD only | `RENDER.accom` 1083, `drawAccom` 1111, `tentDist` 1110, `addAlloc`/`removeAlloc` 1096/1105, `accomChurches` 1090 | `GET /registrants`, `GET/POST /accommodation/*` | **L** |
| 3 | **Notices** (own tab, home latest-3, dismiss, scheduled, delete) | `sendNotif` only | `RENDER.notifs` 1036, `noticeCard` 807, `dismissNotice` 822, `deleteNotice` 1049 | `GET /notifications(/latest)`, `POST`, `DELETE /notifications/:id` | M |
| 4 | **Pre-camp My Youth / by-ministry** (filters, student/leader splits, accommodation display) | partial (`renderPeople`) | `RENDER.people` 834, `drawPeople` 872, `accDisplay` 881 | `GET /registrants(/breakdown)` | M |
| 5 | **Testimonies** (Day 2+) | absent | `RENDER.testimonies` 1408, `submitTestimony` 1414 | `POST /notes {category:'testimony'}` | M *(see backend note)* |
| 6 | **At-camp My Youth** (signed-out, late arrivals, filters) | partial | `RENDER.myyouth` 1258 | `GET /campers`, attendance | M |
| 7 | **Notes / records list** (filters Record/Ministry/Zone, CSV **Category** column, categorised auto-notes) | export only | `RENDER.notes` 1416, `drawNotes` 1428 | `GET /notes/recent`, `GET /notes/export` | M *(see backend note)* |
| 8 | **Your Accommodation** church home tile (at-camp) | absent | within `renderHomeAtCamp` 771 | `GET /accommodation/held/:churchId` | S |
| 9 | **Home parity** (stat band, role cards incl. budget/accom cards, latest-3 notices) both modes | older | `RENDER.home` 721, `renderHomeAtCamp` 771 | `GET /home`, `/notifications/latest` | M |
| 10 | **Tab × role × mode matrix + mode badge + Day-1/2 switch** | partial | `buildTabs` 700, `switchDay` 664, `TAB_OF` 669 | `POST /admin/mode`, `PATCH /settings` (campDay) | M |

~10 feature areas, two large (accommodation allocation, and the cross-cutting home/tab parity). The SPA will grow toward ~2,000+ lines.

## Decisions (assumed — mirror the allocation alignment; tell me to change any)

1. **Full behavioural parity, phased** (pre-camp → at-camp → cross-cutting → docs). Each phase is independently usable; you can stop after any phase.
2. **Reuse the existing backend.** No new endpoints. Where a field is missing, **approximate with what's available** (same stance as the allocation alignment). Two specific gaps are flagged below — each has an "approximate" default and an optional "small backend add".
3. **Structural/behavioural fidelity, not pixel-identical.** Match the demo's information architecture + behaviour, adapted to the SPA's existing CSS/components and real API. The demo is the source of truth.
4. **Token-lean execution** is a first-class requirement: per-task named anchors, reuse the endpoint cheat-sheet, `node --check` instead of re-reading, never read whole files.

## Backend touch points (the only likely `src/` changes — both conditional)

- **Note category (gap #5/#7):** the demo posts `/notes {cat:'testimony'}` and the notes list filters by Record type (testimony / sign-out·in / student note) with a CSV **Category** column. **Confirm `StudentNote` has a category/kind field** (one grep). If present → pure frontend. If absent → small, bounded backend add: optional `category` on the entity + create-schema + CSV export column + the auto-note creators tag their category. (The Project-4 feature map says categories already exist, so this is likely already supported.)
- **Registrant fee tier (gap #1):** the demo's `budgetAmount` uses `feeTier` (full / half / sponsored). **Default = approximate**: compute budget from `accommodationKind` × camp price (tent/classroom, from settings) without half/sponsored tiers — no backend change. Optional: add `feeTier` to the registrant entity if you want full fidelity.

If a backend change is taken, it carries `npx tsc --noEmit && npm run test` (run from `Camp Platform/`).

## Architecture (how a port slots in)

The SPA is a single inline `<script>`: `api()` → `RENDER[id]` screen functions registered on a `RENDER` map → `go()/gotoTab()` router → `paint(id, html, title, sub)` to render → `buildTabs()` for the bottom tabs → `CAMP_MODE` (`pre-camp`/`at-camp`) gates everything. **A port = add/replace a `RENDER.<id>` function (+ helpers), wire it to the real endpoint, and surface it (a home card via `go('<id>')` for director/admin budget/accom, or a tab in `buildTabs`).** No build step; verify with `node --check` on the extracted `<script>`.

## Risks

- **Volume, not unknowns** — ~10 areas; the risk is breadth. Phasing + per-task anchors contain it.
- **Accommodation allocation (gap #2) is the one genuinely complex port** (partial placement, multi-ministry rooms, gender split, tent auto-distribution). Budget the most time there; it may warrant its own sub-steps.
- **Demo uses MockAPI field names** (e.g. `r.feeTier`, `cat`) that may differ from the real API — each task says "map to real fields," and the two known mismatches are called out above.
- **CRLF:** commit with `git -c core.autocrlf=true`.

## Verification

- Per task: `node --check` the SPA `<script>`; manual smoke via `npm run dev` (`Camp Platform/`, http://localhost:4200) for the ported screen across the relevant role(s)+mode.
- If any backend change: `npx tsc --noEmit && npm run test`.
- End: full role×mode smoke (church / zoneLeader / director / admin × pre-camp / at-camp).
