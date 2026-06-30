# PHASE-3-REVIEW.md — Independent review of Phases 1–2

> **Reviewer:** Phase 3 (fresh, independent senior-engineer pass — a new instance; prior work
> reviewed critically on its merits, not deferentially).
> **Date:** 2026-06-29.
> **Scope:** the code shipped by Phases 1–2 against `CAMP-PLATFORM-IMPROVEMENT-BRIEF.md`
> (§4 categories, §5 Budget, §6 22-bug list) and the REFERENCE app's proven patterns.
> **Method:** reasoning + type-tracking + reading the existing vitest suites + a fan-out
> source sweep + a backtick/brace scan + targeted greps (emoji, route table, key shapes).
> **No toolchain** in the authoring env (`node`/`npm`/`tsc`/`vitest`/`node_modules` all absent —
> confirmed directly), so `tsc --noEmit`/vitest were *not* run — they remain gated in
> `DEPLOY-CHECKLIST.md §0`. Line numbers are accurate at writing but will drift.

> **Note on the prior Phase-3 artefact.** An earlier Phase-3 review + `PROGRAM-LOG` entry already
> existed when this instance started. It was treated as prior work to verify, not accept. Its
> central findings (C-1, H-1, the Budget/SW/nav positives) held up under independent checking and
> are retained below with attribution. Three of its claims did **not** hold and are corrected here:
> (1) "zero emoji/Unicode-symbol characters remain" was **false** — two full-width `＋` survived
> (now fixed); (2) its C-1 fix recommendation named table `room_allocations`, but the table is
> `classroom_allocations`; (3) it asserted `dashboard.service` "matches checkin.service" for the
> current-session calc — it does **not** (new HIGH finding below). The prior pass also fixed
> **nothing**; this pass landed the two clear, low-risk fixes the posture calls for.

---

## Verdict

**Strong, disciplined work — ready to proceed to Phase 4, with one Critical and one High latent
bug to schedule before the Phase-7 deploy.**

The correctness-critical, testable cores (Budget maths, check-in session *generation*, the PC-10
accommodation split *computation*) are well-isolated pure functions with thorough, honest unit
tests — including the headline Budget grand-total reconciliation invariant, which I verified reads
correctly. The single-source navigation model, the service-worker `API_RE` coverage (all 19 route
prefixes + `health`), and the two deploy gotchas (CommonJS tsconfig; anchored `/data/`) are all
genuinely correct. 21 of the 22 bugs are fully and correctly fixed.

Two latent defects must not slip:
- **C-1 (Critical):** PC-10 split allocations cannot be persisted — the 3-part group key's bracket
  is stripped on save, so split-pool allocations vanish on reload. Backend-only; the SPA round-trips
  the full key correctly. Needs migration `013` + an entity/repo/service change + a round-trip test.
- **H-2 (High, NEW — missed by the prior review):** `dashboard.service.ts` and
  `checkin.service.ts` disagree on which session is "current" in the 12:00–13:00 window, so the
  at-camp dashboard shows the wrong session and a wrong `checkInsDue` for an hour each day.

Both are reported (not fixed) because each is design-level and unverifiable without the toolchain.
Two clear low-risk issues **were fixed** in place this phase (the emoji-sweep miss and the FAQ-edit
re-render parity bug).

---

## Critical

### C-1 — PC-10 split allocations are not persisted (bracket stripped on save) — **REPORTED (owner; Phase 5)**

**Where:** `src/services/accommodation.service.ts:127` (`setAllocations`), `:67` (`rowsToMap`);
`src/core/entities/accommodation.ts:15` (`RoomAllocation` — no `bracket` field); both repos
(`src/repositories/in-memory/in-memory.repositories.ts`,
`src/repositories/supabase/supabase.allocation.ts`); table **`classroom_allocations`**
(migration `004_accommodation_rework.sql:18`).

**What's wrong:** PC-10 makes a church×gender classroom pool **>50** split into two sub-pools whose
group keys are **3-part** — `${churchId}|${gender}|${bracket}` (e.g. `c1|male|7-9`). This is correct
in `accommodation-allocation.ts` (`groupsForGender`, `:101–102`), the SPA mirror computes and sends
the full 3-part key (`accomGroups`/`addAlloc`, `index.html:1538/1545` — PATCHes the whole map
untouched), and `validateAllocations` accepts it (gender read from key index 1, `:125`). But
persistence throws the bracket away:

```ts
// setAllocations, line 127
const [churchId, gender] = e.key.split('|') as [string, AllocationGender];
await allocationRepo.save({ id: newId('alloc'), roomId, churchId, gender, n: e.n });
```

`'c1|male|7-9'.split('|')` is `['c1','male','7-9']`; the destructure keeps the first two only, and
`RoomAllocation` has **no bracket column** (`grep -rn bracket src/core src/repositories` → none). On
reload, `rowsToMap` (`:67`) rebuilds the 2-part key `c1|male`, which matches **no** live group key
(the live groups are `c1|male|7-9` / `c1|male|10-12`). Downstream in the admin Accommodation screen
(`drawAccom`, `index.html:1570`): `entries.filter(e=>gByKey[e.key])` drops the rows, so the
allocation **silently disappears** from every room, and because `allocByKey` is keyed by the stale
`c1|male`, the bracket groups also render as **fully unallocated**. Net: for any church large enough
to trigger the split, allocations cannot be saved at all.

**Why it slipped through:** `accommodation.characterisation.test.ts:197` ("map round-trips") uses
only `{ key: 'c1|male', n: 3 }` — a non-split 2-part key — so the destructure is lossless there. The
split is tested only at the *pure-function* layer (`accommodation-allocation.test.ts`), never through
`setAllocations`→`getAllocations`. (This test gap is H-1.)

**Recommended fix (needs migration `013`):**
1. Migration `013` (next free number after `012`): `alter table classroom_allocations add column if
   not exists bracket text;` (idempotent). **Table is `classroom_allocations`, not
   `room_allocations`.**
2. Add `bracket?: GradeBracket | null` to `RoomAllocation`; map it in `supabase.allocation.ts`
   (`toAlloc`, `cols`, and the `UPDATE_COLS` list).
3. `setAllocations`: parse all parts — `const [churchId, gender, bracket] = e.key.split('|')` — and
   save `bracket ?? null`. `rowsToMap`: rebuild the key as
   `` r.bracket ? `${r.churchId}|${r.gender}|${r.bracket}` : `${r.churchId}|${r.gender}` ``.
4. Add a characterisation test: a >50 single-gender classroom church, allocate a `…|7-9` group to a
   room, `getAllocations`, assert the 3-part key survives and `validateAllocations` still accepts it
   (this closes H-1).

**Do not fold the bracket into `churchId`/`gender`** — it would break `getChurchRooms` (filters on
`r.churchId === churchId`, `:143`) and the `gender` type. (`getChurchRooms` itself is unaffected by
the bug today — it surfaces name/gender/count only.)

---

## High

### H-1 — Test gap: no integration test for the split through the persistence boundary — **REPORTED (fix with C-1)**

**Where:** `src/services/accommodation.characterisation.test.ts`.

The split is tested only at the pure layer. The `setAllocations`/`getAllocations` round-trip — the
exact path that drops the bracket (C-1) — has no test with a 3-part key. This is the coverage gap
that let C-1 ship. Fix as part of C-1; ideally assert that *every* key shape `computeGroups` can
emit survives a save/load cycle.

### H-2 — `dashboard` and `checkin` services disagree on the "current session" (12:00–13:00 window) — **REPORTED (NEW; missed by prior review)**

**Where:** `src/services/dashboard.service.ts:131` vs `src/services/checkin.service.ts:50–53` +
`src/services/checkin-sessions.ts:62–77` (`currentSession`, `PM_FROM = '12:00'`).

**What's wrong:** `checkin.service.getCurrentSession()` delegates to the shared pure helper
`currentSession(days, date, time)`, which switches AM→PM at `PM_FROM = '12:00'`
(`checkin-sessions.ts:71`, `wantPm = nowTime >= PM_FROM`). But `dashboard.service` reimplements the
calc inline:

```ts
// dashboard.service.ts:131
const currentSession = [...todaySessions].reverse().find((s) => s.startTime <= nowTime) ?? null;
```

The PM session's `startTime` is **`13:00`** (`CHECKIN_PERIODS`, `checkin-sessions.ts:20`). So for any
`nowTime` in **`[12:00, 13:00)`** the two paths disagree:

| now    | `checkin.getCurrentSession()` | `dashboard.currentSession` |
|--------|-------------------------------|----------------------------|
| 12:30  | **PM** (`12:30 >= 12:00`)     | **AM** (`13:00 > 12:30`, only AM's `08:00 <= 12:30`) |

The dashboard's `checkInsDue` (`:151–157`) is computed against *its* `currentSession`, so for that
hour the at-camp home screen counts "still to check in" against the AM roster while a leader tapping
into Check-in lands on the PM session. The comment on `:129–130` even claims this "matches
checkin.service" — it does not — and `CLAUDE.md` ("Daily check-in") states *both* services use the
shared helper. The dashboard tests (`dashboard.service.test.ts`) pin only `10:00` and `15:00`, so the
divergent window is never exercised.

**Recommended fix:** replace the bespoke line with the shared helper:
`const currentSession = pickCurrentSession(settings.checkInDays ?? [], todayStr, nowTime);`
(import `currentSession as pickCurrentSession` from `./checkin-sessions`, mirroring
`checkin.service.ts:10`), and derive `nextSession` from the session list as today. Add a `12:30`
dashboard test asserting `currentSession?.id === PM`.

**Left for owner (not fixed here):** it changes a documented runtime behaviour — note the bespoke
version also returns `null` *before* the AM session starts (a deliberate "no session yet" state) and
derives `nextSession` independently, whereas the shared helper always resolves to *some* session.
Reconciling those semantics + re-running the dashboard suite needs the toolchain. Recommend Phase 5
(correctness pass) alongside C-1, or Phase 7.

---

## Medium *(visual — eyeball on device; unchanged from prior review, re-confirmed)*

### M-1 — `.iconbtn` has conflicting size declarations; other touch controls < 44px (E2 partial)
`public/index.html:150` (`min-width:44px;min-height:44px`) vs `:168` (`width:32px;height:32px`).
Two equal-specificity rules fight; the `min-*` clamps win, so the hit area is ~44×44 (E2 technically
met for `.iconbtn`) but the declarations are contradictory. Separately `.tab` (`:85`), `.sign-out`
(`:79`), `.seg button` (`:197`) compute < 44px tall. Consolidate `.iconbtn` to one rule; audit the
others for the 44px primary-touch minimum.

### M-2 — No real 11px legibility floor; `--t-micro` ≈ 9.3px on phone (A1)
`:root` `--t-micro:.58rem` = 9.3px @16px root (REFERENCE uses an 11px floor). Used on `.tab .tb`,
`.mode-badge`, `.hero .k`, tile badges. Raise to ≈`.7rem` or set the smallest tokens in absolute px.

### M-3 — ~23 hardcoded hex literals duplicate `:root` tokens (C3 not fully met)
Worst offender `#ede9fe` (= `--chip`/`--tint-2`) ×10 as a solid background (`.tab.on` L87, `.seg`
L196, `.wide-nav-item:hover` L317, …). Replace solid-fill duplicates with their tokens; gradient
stops are defensible.

---

## Low

### L-1 — Spacing/shadow/colour tokens defined but never used (C5 mostly unmet) — **REPORTED**
`--s1…--s7`, `--r-sm/--r/--r-lg`, `--shadow`, `--shadow-sm` (`:root` ~L27–28) have 0 references —
all padding/gap/radius/shadow is ad-hoc px. Dead colour tokens too: `--amber`, `--green`, `--ok`,
`--tint-2` (`--ok` duplicates `--green`). Either adopt the scale in a follow-up or delete the dead
tokens. Left unfixed: deleting is churn a future C5 pass may want to *adopt* instead, and the build
can't be run to confirm zero fallout. Owner's call.

### L-2 — Editing an existing FAQ didn't re-render the list — **FIXED THIS PHASE**
`saveFaqPre`/`saveFaqAt` (`index.html` ~L2152/2165) toasted "Saved" but, unlike add/delete (which
call `_rFaq`/`_rFaqEdit`), didn't repaint, so an edited question only appeared after a manual
refresh. **Fix:** added `await _rFaq()` / `await _rFaqEdit()` after each save. No focus-disruption
risk — post-Save focus is on the (repainted-away) Save button, identical to the existing
add/delete handlers. (The prior review left this open citing a focus concern; that concern doesn't
apply to a button click, so it was safe to land.)

### L-3 — `.statband` only wraps, no explicit column reflow (A4 minor) — **REPORTED**
`.statband` (`:249`) is `flex` + `flex-wrap:wrap`; it wraps but doesn't step column count like the
true grids. Acceptable; noted.

### L-4 — Reduced-motion freezes the loading spinner — **NOTE (acceptable)**
The `prefers-reduced-motion` block (`:155`) sets `animation-iteration-count:1!important` globally,
which also stops the `spin` loader. Visually fine; known intentional divergence from the REFERENCE.

---

## Fixed this phase (low-risk, in place — per the "fix safe issues" posture)

All in `public/index.html` (CSS/HTML-template only; no `.ts` touched; backticks still even = 560):

1. **C1 emoji-sweep miss (was a false "zero emoji" claim):** two user-facing full-width `＋`
   (U+FF0B) remained.
   - Daily check-in "add note" button (~L1194): `＋` → `${icSm('plus')}` + `aria-label="Add note"`
     (the `plus` glyph already existed in `ICONS`; this call site was simply missed — now matches
     the icon-only-button convention).
   - Accommodation "+ Add ministry…" `<select>` option (~L1575): an SVG can't render inside an
     `<option>`, so `＋` → ASCII `+`.
   - `grep` now confirms **zero** U+FF0B and zero emoji/pictograph/full-width symbols; the only
     remaining non-ASCII are the intentional typographic `– — … · › × ↗` the owner kept.
2. **L-2 FAQ-edit re-render** (above).

---

## What I verified as genuinely correct (positive findings — checked directly, not taken on trust)

- **Budget rebuild (Cat H / §5):** `src/services/budget.ts` groups by **`registrationCost`** (the
  §5.1 root cause fixed — no longer `registrationType`/accommodation kind), keeps `null` cost as a
  flagged "Cost not recorded" category (never dropped), groups per-church with separate
  campers/leaders, derives labels dataset-relatively (no hardcoded 180/90/0), and the grand total
  reconciles to the sum of every line total. The SPA mirror (`drawBudget`) is faithful. **PC-4**
  (prices out of Settings) and **PC-3** (no "unpaid", confirmed gone from the DTO `dashboard.service`
  and SPA) both done.
- **Check-in session *generation* (AC-1 / J2):** `buildSessions` (`checkin-sessions.ts:44`) yields
  first-day PM-only, last-day AM-only, interior AM+PM, 1-day PM-only; tested (1/2/3/5-day +
  order-independence + empty). *(The current-session **resolution** has the H-2 divergence above —
  generation is correct.)*
- **Accommodation split *computation* (PC-10):** `computeGroups`/`groupsForGender` split only the
  gender >50, halve leaders (odd → 7-9), ride ungraded youth with 7-9, preserve totals, keep
  single-gender validation. Boundary (50 vs 51), odd leaders, one-over-one-under, all-leaders,
  ungraded — all tested. (Persistence is C-1.)
- **Service worker (K1/K2):** all **19** top-level route prefixes in `src/api/http/router.ts`
  (`auth`…`setup`) are present in `API_RE`, plus `health`; cache bumped to `camp-v4`; the
  `controllerchange`→reload listener exists. Verified the route table by grep against `API_RE`.
- **Navigation (D1–D4):** `navModel` is the single source feeding both `buildTabs` and the sidebar;
  church/zoneLeader sidebars are populated; admin at-camp sidebar is exactly the 6 required items in
  order (`navSidebar` special-case); `TAB_OF` covers every `RENDER.*`.
- **FAQ (PC-5/6/7):** the recursion is gone (`_rFaq`/`_rFaqEdit` call `RENDER.adminFaq*`, not
  themselves — the historic `await await _rFaq()` self-call is documented as fixed at ~L2099); the
  admin list shows edit+delete; FAQ is pre-camp only.
- **Deploy gotchas:** `tsconfig` is `CommonJS`/`Node`; `.gitignore` keeps the **anchored** `/data/`
  rule. Both intact.
- **Structure:** `index.html` `<script>`-body backticks balanced (560, even) after my edits.

---

## Handoff → Phase 4 (first-aid login UX)

Phase 4 builds the first-aid login/UX from `docs/PHASE-4-FIRST-AID-DESIGN.md` (design only so far;
reuses `StudentNote.category='firstaid'` → no migration for the feature itself). It's unrelated to
the bugs below, so Phase 4 doesn't fix them — but if it touches `supabase/migrations/`, keep C-1's
migration at `013`.

**Actionable queue (severity order):**
1. **C-1 (Critical, hard pre-Phase-7 gate) + H-1 (test):** migration `013` on
   **`classroom_allocations`** + `RoomAllocation.bracket` + repo mappings + `setAllocations`/
   `rowsToMap` parse-all-parts + the 3-part round-trip test. Best landed in **Phase 5** (the
   accommodation/correctness pass).
2. **H-2 (High):** make `dashboard.service` use the shared `pickCurrentSession` helper (reconciling
   the no-session-before-AM + `nextSession` semantics) + a 12:30 test. Phase 5 or Phase 7.
3. **Visual (eyeball on device):** M-1 (44px), M-2 (11px floor), M-3 (token discipline), L-3.
4. **Cleanup, low priority:** L-1 (adopt-or-delete dead tokens).

Anchor files unchanged. Nothing pushed/deployed; deployment remains a single event after Phase 7.
