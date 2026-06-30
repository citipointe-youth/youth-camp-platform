# PROGRAM-LOG.md — Youth Camp Platform Improvement Program (cross-phase ledger)

> The program's continuity ledger across its 7 phases. Each phase appends a dated entry:
> what changed (by category + bug ID), every design decision/pivot, files touched, what's still
> open, and an explicit handoff note to the next phase. Anchor files for rebuilding context:
> TARGET `CLAUDE.md`, `debug.md`, the working-root brief, `docs/IMPROVEMENT-PLAN.md`,
> `docs/IMPROVEMENT-DESIGN.md`.

---

## Phase 1 — Engineering-maturity pass (2026-06-29)

**Goal (this phase):** port CMS's *engineering* maturity (fluid type, continuous breakpoints,
fluid grids, SVG-only icons, complete perf/SW model) onto the camp app's existing visual identity
and SPA structure; full Budget rebuild; 22 owner bug fixes. No reskin, no `setApp` rewrite.

### What changed (by category + bug ID)
- **A (responsive):** A1 fluid type scale (11 `:root` tokens + root font 16→17→18 @768/1280;
  72 literals tokenised), A2/A3 continuous breakpoints 540/768/900/1280 + fluid container
  (460→820px below the 980 sidebar), A4 fluid `.tiles`, A7/PC-12 wrapping room tiles.
- **C (visual):** C1 all emoji→SVG (13 new glyphs + `icSm/icLg/icXl` + `emptyState`),
  C2 icon-key audit (no blanks), C3 tint/gender hex tokenised.
- **D (nav):** D3 `navModel` single source → `buildTabs` + `_renderWideNav`; D1/CH-1 church &
  zoneLeader sidebar; D2/AC-5 admin at-camp 6-item sidebar; D4 highlight; D5 scroll preserve.
- **H/§5 (Budget):** full rebuild — pure `src/services/budget.ts` + tests; SPA mirror; PC-4 prices
  out of Settings.
- **J (data):** AC-1 check-in first/last-day sessions (+tests); PC-10 >50 grade-bracket split
  (+tests) & PC-11 tent totals; PC-3 removed "unpaid".
- **Phase-0 bugs:** PC-9 (&amp; titles), PC-5 (re-loader recursion), AC-6 (consents line),
  AC-7 (filter swap), AC-8 (signed-out filter), AC-2/3/4 (first-day), CH-2 (testimony dropdown),
  PC-2 (Save Defaults rename), PC-1 (data reorder), PC-6/PC-7 (FAQ admin/at-camp gating).
- **E/G/K/L:** focus rings, 44px targets, ARIA, reduced-motion; **K1 fixed the live `API_RE`
  gotcha (`/export` missing)**, cache bump v3→v4; press states.

### Design decisions / pivots
1. **No git repo in the authoring env** → "commit at phase boundary" reinterpreted as: persist the
   plan, keep the tree clean, leave commits to the operator. Nothing pushed/deployed.
2. **No Node toolchain** (`npm`/`tsc`/`vitest` absent) → verified by reasoning + type-tracking +
   a **string/comment/template-aware brace scanner** + grep. Tests are written to run on a real
   machine; DEPLOY-CHECKLIST §0 gates them.
3. **Migrations already at `012`, not `010`** (brief snapshot was stale). Expected & delivered:
   **zero migrations**. Next free number is `013` if ever needed.
4. **Glyph scope** (owner-confirmed): convert emoji + pictographs + affordance arrows + status ✓;
   keep pure typographic `· – — …` and in-sentence arrows.
5. **Type-scale rationalisation is intentional, not byte-identical:** 33 accreted font sizes
   collapsed to 11 tokens with ≤~0.7px deltas. Flagged for on-device eyeball.
6. **`#fff` deliberately NOT folded into `--card`** ("card surface" vs "any white" differ).
7. **Budget groups by DTO `kind`** (`camper`/`leader`); youth→camper mapping lives in the DTO.
8. **1-day camp → PM-only** check-in (arrival-day semantics).
9. **SPA accom mirror now includes leaders in the pool** — corrects a pre-existing SPA/backend
   discrepancy while implementing PC-10.
10. **Execution order pivot:** did Phase 4 (Budget) and Phase 5 (accommodation) right after Phase 2
    rather than strictly after Phase 3, to land the correctness-critical, testable rebuilds while
    context was fresh. Phase 3 (perf polish) was largely already present in the codebase and the
    remainder is additive — see "Open".

### Files touched
- `public/index.html` — the bulk (CSS tokens/breakpoints/icons; navModel; Budget rebuild; accom
  split mirror + tent totals + room tiles; first-day AC-2/3/4; notes AC-7/8; FAQ gating; data
  reorder; a11y CSS; emoji sweep).
- `public/sw.js` — `API_RE` += `export`; cache `camp-v3`→`camp-v4`.
- `src/services/budget.ts` (NEW) + `src/services/budget.test.ts` (NEW).
- `src/services/checkin-sessions.ts` (AC-1) + `src/services/checkin-sessions.test.ts` (NEW).
- `src/services/accommodation-allocation.ts` (PC-10 split) + extended `accommodation-allocation.test.ts`.
- `src/services/accommodation.service.ts` (occupant `grade`).
- `src/services/dashboard.service.ts` (PC-3).
- Test fixtures: `checkin.service.test.ts`, `dashboard.service.test.ts` (3-day camps for AC-1).
- Docs: `docs/IMPROVEMENT-DESIGN.md`, `docs/IMPROVEMENT-PLAN.md`, `docs/CODE-QUALITY-LOG.md`,
  `docs/DEPLOY-CHECKLIST.md`, this file; `CHANGELOG.txt`; (CLAUDE.md/debug.md updated in Phase 1
  close-out). Working-root `ui-mocks.html` (Phase-1 showcase + Budget states).

### Still open (carried forward)
- **Perf polish (B-phase):** B1 full per-role prefetch matrix, B2 broader optimistic writes (only
  check-in is optimistic today), B3 skeleton loaders, B4 loading-indicator audit + action→indicator
  table (incl. PC-8 import), B5/B6 fine-tuning. The cache/SWR/prefetch *skeleton* and the home
  paint-before-pulse already exist; the rest is additive UX, not correctness.
- **A5/A6/A8 finalisation:** per-screen audit table + dense-table tuning + safe-area eyeball — the
  global foundations make every screen scale; the explicit table + spot-fixes are a quick follow-up.
- **I1/I2 deeper refactor:** broad shared-render-helper extraction beyond `emptyState`/`navModel`/
  budget helpers (behaviour-preserving, low risk).
- **Verification on real toolchain:** typecheck + vitest must be run on a machine (DEPLOY-CHECKLIST §0).

### Handoff note → Phase 2 (UI showcase)
Phase 2 builds a richer UI showcase of this work. Start from:
- `ui-mocks.html` (working root) — already has a **"Phase 1 — Engineering maturity"** section
  (type scale, breakpoints, the 13 new icons, token palette) and a **Budget** section
  (collapsed + expanded church rows). Extend these rather than starting blank.
- The real SPA `public/index.html` is the source of truth for current visuals; the mock should
  mirror it. Key showcaseable wins: fluid scaling (resize demo), the SVG icon set, the rebuilt
  Budget (grand-total card + collapsible CAMPERS/LEADERS rows), the populated desktop sidebars per
  role×mode, the accommodation split groups + tent totals, gender-coloured first-day bubbles.
- Design tokens to use in the showcase live in `:root` of `public/index.html` (palette + `--t-*`
  type scale + `--male/--female` etc.). Do NOT hardcode hex.
- Open items above (esp. the B-phase perf polish) are good candidates to *visualise* (skeleton
  states, optimistic flips) even before they're fully implemented — flag them as "planned" if so.
- Nothing is pushed/deployed; deployment is a single event after Phase 7. Don't deploy in Phase 2.

---

## Phase 2 — UI showcase + owner-feedback pass (2026-06-29)

**Goal (this phase):** build a rich owner-facing UI showcase of the Phase-1 work with a strong
emphasis on dynamic/responsive resizing; present it; then implement the owner's agreed refinements
into the real app. Stop for feedback before coding; no deploy.

### What I showcased (working-root `ui-mocks.html`)
- **Live responsive demo** — a width-slider drives an `<iframe>` whose CSS is a faithful copy of the
  real Phase-1 `:root` tokens + media queries (540/768/900/980/1280). Because media queries key off
  the iframe's own width, dragging the slider triggers the **real** reflow (root-font 16→17→18,
  container widening, tile 2→3→4, the 980px sidebar switch). A readout reports the active breakpoint.
- **Side-by-side comparator** — the same screen (Dashboard · Registration list · Wizard/form ·
  Budget) at true 360/768/1280px, scaled to fit, so reflow is directly comparable across A5 screens.
- **Faithfulness fixes** to the older static mock so it matches what Phase 1 actually shipped:
  converted the admin wide-layout emoji (🏠✓🔍…) and stray `△⌂🚨⚕☎◆✎✓✕＋↗⚠▾③④⑤` to registry SVGs;
  removed the **"3 unpaid" pill** (PC-3) and the **at-camp FAQ tile** (PC-7). Only the intentional
  "was 👁" before/after labels in the C1 icon card retain emoji (they document the replacement).

### Owner feedback & how it was handled
1. **Stats snapshot stays at the top** of My Youth (not a side rail) — done; the snapshot sits
   outside the `.wide-cards` grid so it stays full-width.
2. **Phone header white** to match the web header — **implemented in the real app.**
3. **First-aid notes** (problem+treatment on a student → roll into admin/zoneLeader Notes as a new
   filter) — **design draft only**, pushed to **PHASE 4 — First-aid login**.
4. **First-aid nav/home** (home = search; nav item 2 = first-aid records history) — **design draft
   only**, pushed to **PHASE 4**.

### Implemented this phase (real app — `public/index.html`, CSS + template strings only)
- **White header at every width** — base `.bar` flipped from the violet→navy gradient to white +
  dark text + hairline border; `role-badge`/`sign-out`/back-button restyled for white; mode/day
  badges keep coloured fills. (CQ-011.)
- **A6 wide layout (owner-approved)** — new `.wide-cards` utility: 1 col <980, 2 col ≥980, 3 col
  ≥1280; applied to the My Youth roster (`#plist`) and Budget collapsed church rows; expanded Budget
  church spans full width. Wired the dead `.two-col` into the Settings form. (CQ-012.)
- All new rules live in the ≥980/≥1280 blocks → **phone/tablet byte-for-byte unchanged**.

### Drafted, NOT built (PHASE 4)
- `docs/PHASE-4-FIRST-AID-DESIGN.md` (full spec) + four labelled "design draft" phone frames in
  `ui-mocks.html`. Reuses `StudentNote.category='firstaid'` → **no migration**. **Zero** first-aid
  feature code written; live first-aid behaviour is unchanged this round.

### Verification
- **No `.ts` files changed** this phase (CSS + HTML template strings + new markdown only) → `tsc
  --noEmit` and vitest are unaffected; the real-toolchain run remains gated in DEPLOY-CHECKLIST §0.
- Structural: `index.html` backticks even, `<style>`/`<script>` balanced; `ui-mocks.html` 893/893
  divs, balanced scripts/styles, JS brace/paren balanced.
- **B6 efficiency invariant intact** — `RENDER.people` still fetches `/registrants` exactly once.
- Deploy gotchas untouched — `tsconfig` still `CommonJS`/`Node`; `.gitignore` `/data/` still anchored.
- Nothing pushed/deployed.

### Files touched
- `public/index.html` — `.bar` (white header) + badges; `≥980/≥1280` media blocks (`.wide-cards`);
  `RENDER.people` (`#plist` class); `drawBudget` (church-row wrapper); `RENDER.adminSettings` (two-col).
- `docs/PHASE-4-FIRST-AID-DESIGN.md` (NEW), `docs/CODE-QUALITY-LOG.md` (CQ-011/012), `CHANGELOG.txt`,
  this file. Working-root `ui-mocks.html` (live demo + comparator + faithfulness fixes + PHASE 4 mocks).

### Still open (carried forward)
- Same B-phase perf polish + A5/A8 finalisation as Phase 1's "Open" list (A6 dense-list gap is now
  **resolved**). PHASE 4 first-aid is fully specced but unbuilt. Real-toolchain typecheck/vitest run.

### Handoff note → Phase 3 (independent review of Phase 1 + 2 code)
- Phase 3 reviews the **code** of Phases 1 & 2. Phase 2's real-app delta is small and CSS-only:
  the white `.bar` + the `.wide-cards`/`.two-col` layout rules (≥980px) + three render-fn class
  additions (`#plist`, `drawBudget` wrapper, settings form). No logic/data/RBAC/fetch changes —
  so review focus is **visual/responsive correctness on-device** and confirming the byte-for-byte
  phone/tablet claim, not behaviour.
- The first-aid work is **design only** — review `docs/PHASE-4-FIRST-AID-DESIGN.md` for soundness
  (esp. the body-encoding-vs-columns and RBAC open questions in §3/§4/§7), but there is **no
  first-aid feature code to review** this phase.
- Anchor files unchanged: TARGET `CLAUDE.md`, `docs/IMPROVEMENT-DESIGN.md`/`-PLAN.md`, this log.
- Nothing pushed/deployed; deployment remains a single event after Phase 7.

---

## Phase 3 — Independent code review of Phases 1 + 2 (2026-06-29)

**Goal (this phase):** review the Phase 1 + 2 code on its merits (correctness/bugs, coding
efficiency, implementation quality), fix clear low-risk issues in place, and report the rest for
the owner. Deliverable: `docs/PHASE-3-REVIEW.md` (severity-ranked).

### Findings summary
- **Verdict: strong work, ready for Phase 4 — with ONE Critical latent bug to fix before the
  Phase-7 deploy.** 21/22 bugs fully correct; Budget/check-in/nav/SW/deploy-gotchas all verified
  genuinely correct (not just claimed).
- **Critical (C-1):** the PC-10 grade-bracket split is correct in *computation + validation* but
  its allocations **cannot be persisted** — `setAllocations` (`accommodation.service.ts:127`)
  destructures only `[churchId, gender]` from the 3-part split key (`churchId|gender|bracket`) and
  `RoomAllocation` has no bracket column, so split-pool allocations silently vanish on reload and
  never decrement availability. Masked because the round-trip characterisation test uses only
  non-split 2-part keys. **Needs migration `013` + entity/repo/service change + a round-trip test.**
- **High (H-1):** the test gap that hid C-1 — no integration test through `setAllocations`→
  `getAllocations` with a 3-part key. Fix as part of C-1.
- **Medium:** M-1 conflicting `.iconbtn` size rules + sub-44px `.tab`/`.sign-out`/`.seg` (E2
  partial); M-2 no real 11px type floor (`--t-micro`≈9.3px on phone); M-3 ~23 hardcoded hex
  duplicating `:root` tokens (worst `#ede9fe`×10).
- **Low:** L-1 spacing/shadow tokens (`--s1..7`, `--r*`, `--shadow*`) + colour tokens
  (`--amber/--green/--ok/--tint-2`) defined-but-unused; L-2 FAQ edit doesn't re-render (minor);
  L-3 `.statband` wraps but doesn't step columns; L-4 reduced-motion freezes the spinner (noted,
  acceptable).

### What I fixed vs left open
- **Fixed: nothing.** Rationale (recorded in the review): the only Critical requires a schema
  migration (design-level → owner decision per the posture), and with **no toolchain in this env**
  (`tsc`/vitest can't be run) I could not verify any edit, so I judged precise reporting safer than
  landing unverifiable changes. The Medium items are visual and the brief defers layout
  verification to on-device eyeballing; L-1 is churn a future C5 pass may want to *adopt* rather
  than delete; L-2 is arguably not a bug (re-rendering mid-edit would disrupt focus).
- **Left open:** all findings above, queued in the review's Handoff. **C-1 + H-1 are PINNED to
  Phase 5** — to be fixed there alongside the accepted recommendations from the six-hat review
  (C-1 is an accommodation-domain bug needing migration `013` + tests, so it fits the Phase 5
  accommodation/correctness pass; remains a hard pre-Phase-7-deploy gate). M-1/2/3 + L-3 in a
  visual pass; L-1/L-2 cleanup.

### Files touched
- `docs/PHASE-3-REVIEW.md` (NEW — the deliverable). This log entry. No source/test/CSS changes.

### Verification
- By reasoning + type-tracking + reading the existing vitest suites (budget / checkin-sessions /
  accommodation-allocation / accommodation.characterisation) + a brace/backtick scan
  (`index.html` script body backticks even = 560). `tsc --noEmit`/vitest NOT run (toolchain absent)
  — remains gated in `DEPLOY-CHECKLIST.md §0`. Deploy gotchas re-confirmed: `tsconfig` CommonJS/Node;
  `.gitignore` `/data/` anchored. Nothing pushed/deployed.

### Handoff note → Phase 4 (first-aid login UX)
- Phase 4 builds the first-aid login/UX from `docs/PHASE-4-FIRST-AID-DESIGN.md` (design only so
  far; reuses `StudentNote.category='firstaid'` → no migration for the feature itself).
- **C-1 is owned by Phase 5** (pinned — fix it there with the accepted six-hat-review
  recommendations, via migration `013`). It's unrelated to first-aid, so Phase 4 doesn't fix it —
  but it's a hard pre-Phase-7-deploy gate, so don't let it slip. If Phase 4 touches
  `supabase/migrations/`, coordinate numbering so C-1's migration stays `013`.
- The pure cores (budget/checkin/accom-compute) are solid and well-tested — safe to build on.
  Anchor files unchanged. Nothing pushed/deployed; deployment remains a single event after Phase 7.

---

## Phase 3 — Independent code review (re-run by a fresh instance, 2026-06-29)

**Context:** a Phase-3 review + log entry already existed when this instance started. Per the brief,
the prior work was reviewed **critically, not deferentially** — its findings re-verified from source,
its claims checked, and the "fix safe issues, report the rest" posture (which the prior pass had not
acted on — it fixed nothing) applied. Toolchain genuinely absent (`node`/`npm`/`node_modules` all
missing — confirmed directly), so the conservative no-`tsc`/no-vitest constraint was real; but that
does **not** justify fixing nothing, so the clear low-risk items were landed by reasoning + reading
the existing suites.

### Findings summary
- **Verdict unchanged at the headline level:** strong work, ready for Phase 4, with **C-1
  (Critical)** still the hard pre-Phase-7-deploy gate. 21/22 bugs genuinely fixed; Budget/check-in
  generation/nav/SW/deploy-gotchas independently re-verified correct.
- **C-1 (Critical) confirmed** from source (`accommodation.service.ts:127`/`:67`, no `bracket`
  column) — and the SPA confirmed to send the full 3-part key, so the loss is **backend-only**.
  Corrected the prior review's fix recipe: the table is **`classroom_allocations`**, not
  `room_allocations`. Still owned by Phase 5 (migration `013` + repo/entity/service + round-trip
  test H-1).
- **H-2 (High) — NEW, missed by the prior review:** `dashboard.service.ts:131` reimplements the
  "current session" calc (`startTime<=now`, PM at 13:00) instead of the shared
  `currentSession`/`PM_FROM=12:00` helper that `checkin.service` uses, so they disagree in the
  12:00–13:00 window — wrong session + wrong `checkInsDue` on the at-camp dashboard for an hour
  daily. Contradicts `CLAUDE.md` (which says both use the shared helper) and the inline comment.
  Untested (dashboard tests pin only 10:00/15:00). Reported, not fixed (changes documented
  semantics + nextSession derivation; unverifiable without vitest). → Phase 5 or 7.
- **Corrected a false positive:** the prior "zero emoji/Unicode-symbol characters remain" claim was
  wrong — two user-facing full-width `＋` (U+FF0B) survived the sweep.

### What I fixed vs left open
- **Fixed (2 low-risk, in `public/index.html`, CSS/HTML-template only):**
  1. **C1 emoji miss:** `＋`→`${icSm('plus')}`+aria-label on the check-in add-note button (~L1194);
     `＋`→ASCII `+` in the accommodation "Add ministry…" `<option>` (~L1575, SVG can't live in an
     option). grep now shows zero emoji/full-width symbols.
  2. **L-2 FAQ-edit re-render:** added `await _rFaq()`/`_rFaqEdit()` after `saveFaqPre`/`saveFaqAt`
     so an edited FAQ shows without a manual refresh — parity with the existing add/delete handlers
     (the prior review's focus-disruption rationale doesn't apply to a button click).
- **Left open:** C-1+H-1 (Phase 5), H-2 (Phase 5/7), M-1/2/3 + L-1/L-3 (visual/cleanup).

### Verification
- Reasoning + a fan-out source sweep + reading the budget/checkin/accommodation vitest suites +
  targeted greps (emoji/U+FF0B, route table vs `API_RE`, key shapes) + a backtick scan
  (`index.html` `<script>` backticks even = 560 after my 4 edits — unchanged, no template structure
  altered). `tsc --noEmit`/vitest NOT run (toolchain absent) — gated in `DEPLOY-CHECKLIST.md §0`.
  Deploy gotchas re-confirmed: CommonJS/Node tsconfig; anchored `/data/`. Nothing pushed/deployed.

### Files touched
- `docs/PHASE-3-REVIEW.md` (rewritten as this instance's deliverable), `CHANGELOG.txt` (Phase-3
  section), this log. `public/index.html` (4 edits: 2 × emoji fix, 2 × FAQ-save reloader). No
  `.ts`/CSS-rule/migration changes.

### Handoff note → Phase 4 (first-aid login UX)
- Unchanged from the prior Phase-3 handoff: Phase 4 builds first-aid from
  `docs/PHASE-4-FIRST-AID-DESIGN.md` (no migration for the feature). **C-1 stays pinned to Phase 5**
  (migration `013` on `classroom_allocations`); if Phase 4 touches `supabase/migrations/`, keep that
  number free. **New:** flag **H-2** for the same correctness pass (swap the dashboard's bespoke
  current-session calc for the shared helper + a 12:30 test). Pure cores remain safe to build on.
  Nothing pushed/deployed.

---

## Phase 4 — First-aid login UX (2026-06-29)

**Goal (this phase):** an executive UX review of the first-aid login, then — on owner approval —
build the agreed experience into the real app. Make it genuinely effective for a first-aider on
shift: find a student's details fast, and make a quick log of any action taken. Strip the noise.

### Review + owner feedback (two rounds)
Deliverables: `docs/PHASE-4-FIRSTAID-UX.md` (review: persona, keep/cut/add audit, screens/fields,
RBAC, rationale) + working-root `ui-mocks-firstaid.html` (phone frames + a wide station view).
Presented and STOPPED for feedback before any code. Round-1 questions → Records campwide; incident
fields = 2 text + First-aider(req) + Brought-by(opt); church can read; keep Schedule. **Round-2
(refinements, took precedence):** (1) **drop Medical Watch entirely** + drop the handover framing →
nav = **Search · Records · Schedule** (3 tabs); (2) rename "Casualty Card" → **"Student Info"**;
(3) **darken** light-grey text; (4) **soften** the red alert / green consent; (5) **leader contacts
are the focus** (top), **parent is the bottom fallback**. Plus mock polish: clear/bordered leader
call buttons, number-only (no "Call NAME"), show the secondary number (no "tap to reveal"),
stack the two people-fields on phone.

### Implemented into the real app
**Backend (RBAC + records):**
- `access-control.ts`: new `note:write:firstaid` (firstAid+director+admin) + `note:read:firstaid`
  (firstAid+zoneLeader+director+admin+**church**). firstAid keeps NO general `note:write`/`note:read`.
- `note.service.ts`: `add()` is now **category-scoped** — asserts `note:write:firstaid` iff
  `category==='firstaid'` (else `note:write`); a first-aid record requires a camperId. New
  `recentFirstAid()` returns ONLY firstaid-category notes, scoped by `canAccessPerson`.
- New routes: `GET /notes/firstaid` (records) and `GET /search/contacts/:camperId` (exposes the
  pre-existing `search.service.resolveContacts` for the leader-contact card — reuses
  `camper:read:sensitive`, no new permission). Controllers updated.
- **No migration** — reuses `StudentNote.category`. Migration `013` stays reserved for Phase 5 (C-1).

**SPA (`public/index.html`):**
- `navModel('firstAid')` → Search · Records · Schedule; `gotoTab` redirects home→search for firstAid;
  `RENDER.home` self-redirects. Medical Watch + `/campers/medical` removed from the first-aid path.
- Replaced casualty-card functions with `renderSearchFirstAid`/`openStudentInfo`/`openFirstAidLog`/
  `saveFirstAidLog`/`RENDER.records`/`drawFaRecords`/`_faParse`/`faRevealLeader`/`_loadStudentRecent`.
  New `records` section + `TAB_OF` entry.
- Student Info re-ranked (alert→consent→**leader contacts**→Medicare→dietary→Log→recent→parent),
  allergy-type dietary merged into the alert, tone softened, leader buttons clear/number-only,
  secondary number shown, parent at the bottom.
- Action-log form (Problem/Treatment/First-aider req/Brought-by opt) → `POST /notes{category:'firstaid'}`
  with a 4-line body; people-fields stack on phone, row at ≥540px.
- `drawNotes`: "First-aid" Record filter + amber badge + Problem/Treatment render; CSV export already
  carries it.
- Tokens: added `--ink-2` + softened `--alert-*`/`--consent-*`; all first-aid hardcoded hex tokenised
  (C1/C3 for these screens). `sw.js` cache `camp-v4`→`camp-v5`.

**Tests:** NEW `note.service.test.ts` (firstAid can write only firstaid / not general; firstaid record
needs a camper; church can't write; recentFirstAid returns only firstaid + scoping: firstAid all,
admin all, church own-church-only, zoneLeader zone). Extended `access-control.test.ts` (firstAid +
church first-aid capability matrix).

### Verification
- **A real parser was available after all:** Node v24 bundled under the Playwright driver. The SPA
  `<script>` passes **`node --check`** (clean); backend TS parse-checked via `node
  --experimental-strip-types --check` (clean). This caught + fixed a **stray `}`** that crept into
  `drawNotes` during the First-aid-filter edit (the `box.innerHTML=…:emptyState(…)` statement now ends
  `;` and the function closes correctly). Backtick parity even (590).
- Full `npm run typecheck` + `vitest` still NOT run (no project `node_modules`) — gated in
  DEPLOY-CHECKLIST §0/Phase-4 addendum. Reasoned through type-coherence of all backend edits
  (new Actions are valid union members; new service/controller methods exist on their interfaces;
  router controller vars match).
- Deploy gotchas re-confirmed: CommonJS/Node tsconfig untouched; `.gitignore` `/data/` still anchored.
  Nothing pushed/deployed.

### What I implemented vs deferred
- **Implemented:** everything in the approved Rev-2/Rev-3 spec (nav, Student Info, leader-first
  contacts, action logging, Records tab, admin Notes filter, RBAC incl. church-read, tokenisation).
- **Deferred (not requested for v1):** Follow-up-needed / Parent-informed toggles on the log form
  (owner chose the two people-fields instead). A dedicated `problem`/`treatment` column pair (kept the
  migration-free two-…four-line body). `listMedicalWatch`/`GET /campers/medical` left in the backend
  for other roles (only the first-aid SPA stopped calling it).

### Files touched
- Backend: `src/services/access-control.ts`, `src/services/note.service.ts`,
  `src/api/controllers/note.controller.ts`, `src/api/controllers/search.controller.ts`,
  `src/api/http/router.ts`. Tests: `src/services/note.service.test.ts` (NEW),
  `src/services/access-control.test.ts`.
- SPA: `public/index.html`, `public/sw.js` (cache bump).
- Docs: `docs/PHASE-4-FIRSTAID-UX.md` (NEW), `docs/CODE-QUALITY-LOG.md` (CQ-013/014),
  `docs/DEPLOY-CHECKLIST.md` (Phase-4 addendum), `CLAUDE.md` (firstAid role + Phase-4 section),
  `debug.md` (first-aid router rows + nav matrix), `CHANGELOG.txt`, this log. Working root:
  `ui-mocks-firstaid.html` (NEW). The Phase-2 stub `docs/PHASE-4-FIRST-AID-DESIGN.md` is superseded
  by the new review (left in place as history).

### Still open (carried forward)
- **C-1 (Critical)** PC-10 split allocations not persisted — still PINNED to Phase 5 (migration `013`
  on `classroom_allocations` + repo/entity/service + round-trip test H-1). Untouched here.
- **H-2 (High)** dashboard vs check-in "current session" disagree in the 12:00–13:00 window — still
  open for the Phase-5/7 correctness pass.
- B-phase perf polish, A5/A8 finalisation, M-1/2/3 + L-3 visual items — unchanged from prior phases.
- Real-toolchain `tsc --noEmit` + vitest run — gated in DEPLOY-CHECKLIST §0.

### Handoff note → Phase 5 (six-hats whole-program review)
- Phase 5 is a six-thinking-hats review of the WHOLE program (Phases 1–4) and is where **C-1 + H-1
  are fixed** (migration `013` on `classroom_allocations`; keep that number free — Phase 4 added NO
  migration). Also fold in **H-2** (swap the dashboard's bespoke current-session calc for the shared
  helper + a 12:30 test).
- **Phase-4 review surface for the hats:** the first-aid RBAC is the security-critical piece — the
  `note:write:firstaid`/`note:read:firstaid` category-scoping and the church-own-church read are
  pinned by `note.service.test.ts`/`access-control.test.ts`; re-verify those tests actually run green
  on the real toolchain (they were written, not executed here). Black-hat angle: the 4-line body
  encoding is parsed by a client regex (`_faParse`) — confirm it degrades gracefully if a field's
  text contains a label-like line; the raw body + CSV are always intact.
- **Anchor files** unchanged: TARGET `CLAUDE.md`, `debug.md`, the working-root brief, this log,
  `docs/IMPROVEMENT-PLAN.md`/`-DESIGN.md`. Nothing pushed/deployed; deployment remains a single event
  after Phase 7. The first-aid feature is built but, like all prior phases, **not shipped**.

---

## Phase 5 — Six-hats whole-program review (2026-06-30)

**Goal (this phase):** a de-Bono Six-Thinking-Hats executive review of the WHOLE program (Phases
1–4), re-run per role (admin/director/church/zoneLeader/first-aid); fix clear low-risk issues in
place (incl. the C-1 + H-2 defects pinned here since Phase 3); report the rest. Deliverable:
`docs/PHASE-5-SIXHATS-REVIEW.md` (organised by hat AND by role, with a before-redeployment shortlist).

### Verdict
**Strong, disciplined, close to deploy-ready.** The single hard pre-deploy gate (C-1) and the High
session-divergence (H-2) are now **fixed in code with regression tests**; the honest remaining
blocker is *verification on a real toolchain*, not implementation. Open items are owner decisions
(SESSION_SECRET fail-fast; check-in-queue durability) + a visual/cleanup tail from Phase 3 — none
deploy-blocking.

### What I fixed (per the "fix safe issues" posture)
- **C-1 (Critical) — PC-10 split allocations now persist.** A >50 church×gender classroom pool
  splits into 7-9/10-12 sub-pools with a 3-part key (`churchId|gender|bracket`); the bracket was
  dropped on save (`setAllocations` destructured 2 parts; `RoomAllocation` had no column), so split
  allocations vanished on reload and never decremented availability. Fix: migration
  `013_allocation_bracket.sql` (NEW; `add column if not exists bracket text` — idempotent,
  backward-compatible) + `AllocationBracket` type & `RoomAllocation.bracket` in
  `core/entities/accommodation.ts` + parse-all-parts/rebuild-3-part-key in
  `accommodation.service.ts` + `bracket` mapping in `supabase.allocation.ts`.
- **H-1 (High) — the test gap that hid C-1.** New round-trip test in
  `accommodation.characterisation.test.ts`: a 60-person single-gender pool splits, allocate the
  `c1|male|7-9` sub-pool, save→load, assert the 3-part key survives.
- **H-2 (High) — dashboard vs check-in current-session divergence (12:00–13:00).**
  `dashboard.service.ts` now uses the shared `currentSession` helper (was a bespoke
  `startTime<=now` with PM `startTime`=13:00, returning AM at 12:30 while check-in returned PM).
  New 12:30 test asserts `PM` + `nextSession===null`; existing 10:00/15:00 tests still hold.
- **JWT hygiene (Low) — removed dead `JWT_SECRET`** from `config/env.ts` (never read anywhere;
  session signing uses `SESSION_SECRET` in `auth.service.ts`). Setting it gave a false sense of
  securing sessions — a deploy footgun. Left a pointer comment.

### What I left open (reported for the owner)
- **B-1 (High)** optimistic check-in queue hard-drops on any online error (red dot only, no
  retry/alert), and the in-memory queue is lost on tab close — a leader can believe a child is
  checked in when the server has no record. Design-level UX/data change; needs on-device testing.
- **B-2 (Medium)** SESSION_SECRET falls back to an in-source constant in prod with only a
  `console.error` (forgeable tokens if unset). Recommend fail-fast on startup. (Prod currently sets
  it — this is defence-in-depth.)
- **B-3 (Medium)** multi-tab / mode-switch desync; **B-4 (Medium)** over-broad client-cache
  invalidation; **M-1/M-2/M-3** visual items + **L-1/L-3** carried from Phase 3.
- **Verified-OK (no action):** `_faParse` degrades gracefully (raw body + CSV intact); import
  absent-deletion is intentional with a visible dry-run delete count; per-instance rate-limit is by
  design.

### Files touched
- Code: `supabase/migrations/013_allocation_bracket.sql` (NEW), `src/core/entities/accommodation.ts`,
  `src/services/accommodation.service.ts`, `src/repositories/supabase/supabase.allocation.ts`,
  `src/services/dashboard.service.ts`, `src/config/env.ts`.
- Tests: `src/services/accommodation.characterisation.test.ts` (NEW round-trip), 
  `src/services/dashboard.service.test.ts` (NEW 12:30 test).
- Docs: `docs/PHASE-5-SIXHATS-REVIEW.md` (NEW — the deliverable), `CHANGELOG.txt` (Phase-5 section),
  this log.

### Verification
- Reasoning + a fan-out source sweep (auth/RBAC, registration/lifecycle/import, SPA/PWA) + reading
  the vitest suites + targeted greps + **`node --experimental-strip-types --check` on every changed
  `.ts`** (Node v24 under the Playwright driver) — all parse clean. Full `tsc --noEmit` + `vitest`
  NOT run (no project `node_modules`) — gated in `DEPLOY-CHECKLIST §0`. Deploy gotchas re-confirmed:
  CommonJS/Node `tsconfig`; anchored `/data/`. Migration `013` is the next free number. Nothing
  pushed/deployed.

### Remediation sub-phase (2026-06-30) — review → decisions → design → plan → execute
After the review, the owner chose what to build now vs defer (decisions table in
`PHASE-5-SIXHATS-REVIEW.md`). I wrote `docs/PHASE-5-REMEDIATION-DESIGN.md` (what & why) +
`docs/PHASE-5-REMEDIATION-PLAN.md` (ordered steps) and executed:
- **B-2 (fail-fast)** — `assertSessionSecret()` (auth.service.ts) called from `createAppInstance()`
  (app.ts); throws in prod when SESSION_SECRET is unset/insecure. + 4 tests.
- **B-1 (banner only)** — check-in "N syncing… / N didn't save — tap to retry" banner; keeps the
  drop-on-error + no-persistence behaviour (residual tab-close/4xx loss now VISIBLE, not silent).
  Full durability deferred.
- **B-3 (cross-tab mode sync)** — localStorage `ycp_campmode` + `storage`/`visibilitychange`
  listeners → `_applyModeChange()`; PREVIEW_MODE guarded.
- **B-4 (cache tuning)** — narrowed `_invalidate` (no more full clear on import; severed the
  settings/schedule → /checkin and /schedule clears per the documented de-link). /home still always
  clears.
- **M-1/M-2/M-3 (visual)** — one `.iconbtn` rule (32px visual, ≥44px hit via ::before); type floor
  `--t-micro` .58→.7rem; 12 solid `#ede9fe` → `var(--chip)`.
- **L-1** — deleted 9 confirmed-dead tokens (kept the now-used ones; Phase-3 list had drifted).
- **Reset copy** — blunter scope warning; backend contract unchanged.
- **Verification:** every changed `.ts` parse-clean (`node --experimental-strip-types --check`); SPA
  `<script>` re-parsed clean (`node --check`, backticks even = 594); `sw.js` bumped camp-v5→**v6**.
  Full `tsc`/`vitest` still gated. Deploy gotchas re-confirmed. Nothing pushed/deployed.
- **Deferred:** B-1 full durability; L-3.

### Known-risk clearance (2026-06-30) — R8 + R9
Resolved the two long-standing KNOWN RISKS the owner asked for next:
- **R8 (accommodation reservations vs availability) — SUPERSEDED/MOOT.** The model it concerned
  (`AccommodationBlock` + per-church `reservations` + `accommodation-occupancy.ts`) was removed in
  the 2026-06-27 rework (migration 004). Nothing to change; marked superseded so it isn't re-opened.
- **R9 (newYear password-less accounts) — RESOLVED.** The temp-password generator was already built
  (restored accounts CAN log in); verifying it surfaced + fixed the residual gaps:
  1. **Security:** the PUBLIC `GET /settings` was returning `settings.lastTempPasswords` (plaintext
     rollover passwords) to any unauthenticated caller. `settings.controller.get()` now strips the
     array and exposes only `pendingTempPasswordCount`; NEW `settings.controller.test.ts` pins it.
  2. SPA rollover modal copy corrected (it falsely said the temps were in the Step-1 workbook, which
     is downloaded *before* rollover). 3. Admin→Data shows a "N pending" banner from the safe count.
     4. `SECURITY-ACTIONS.md §6` runbook rewritten (was stale). No migration; newYear/export backend
     behaviour unchanged — only the public /settings projection narrowed. Parse-clean; nothing shipped.
- **Phase 6 note:** R9 no longer needs a year-to-year fix — but Phase 6 should still smoke-test the
  rollover→temp-password→export→login loop end-to-end on the real toolchain.

### Handoff note → Phase 6 (year-to-year reusability review)
- **C-1 + H-2 are now CLOSED in code** — Phase 6 should not re-pin them; instead, on the real
  toolchain, **confirm the new tests pass green** (`accommodation.characterisation` 3-part round-trip;
  `dashboard.service` 12:30) and that `tsc --noEmit` is clean, then ensure **migration `013` is in the
  deploy plan** (it is inert without it). The next free migration number is now `014`.
- **Phase 6's actual remit (year-to-year reuse):** stress the `saveDefaults`→`newYear`→`reset` cycle.
  Known sharp edges to examine: `newYear` restores accounts **password-less** (R9 — operator must
  reset; is the temp-password surfacing in `lastTempPasswords` enough?); the snapshot strips hashes;
  `reset` wipes to bare (no restore). Confirm the scaffold snapshot captures everything a second year
  needs (churches, accounts, accommodation rooms, FAQ, schedule, devotionals) and that **accommodation
  `classroom_allocations` are correctly NOT carried across years** (allocations are per-cohort) while
  the **classrooms themselves ARE** — verify the new `bracket` column doesn't leak stale data across a
  rollover.
- **Owner decisions are now made and built** (see the remediation sub-phase above): B-2 fail-fast,
  B-1 banner, B-3, B-4, M-1/2/3, L-1, reset copy. Only B-1 full durability + L-3 remain deferred.
- **On-device eyeball list for the deploy gate:** the >50 single-gender accommodation split (C-1),
  the 12:00–13:00 dashboard (H-2), the M-1/M-2/M-3 visual deltas, the check-in unsynced/failed
  banner (offline→online), and a two-tab mode switch (B-3).
- Anchor files unchanged. Nothing pushed/deployed; deployment remains a single event after Phase 7.

---

## Phase 6 — Year-to-year reusability review (2026-06-30)

**Goal (this phase):** assess, feature by feature, whether a **non-technical operator** can reuse the
app for next year's camp **through the UI alone** — no code, schema, or backend changes. Fix clear
low-risk gaps in place; specify larger "make this admin-managed" gaps for the owner. Deliverable:
`docs/PHASE-6-REUSABILITY-REVIEW.md` (feature table with Yes/Partial/No, a plain-English "New Camp
Year" runbook, and a prioritised gap list).

### Verdict
**Reusable year-to-year through the UI.** Assessed ~21 functional areas. The whole config a non-coder touches each year is in-app editable — dates, churches, accounts,
accommodation rooms, FAQ, schedule, devotionals, ministry contacts — and the per-camper data
(including **costs** via the CSV `Cost` column and **discount codes** via the CSV `Code` column) is a
pure re-import. The `saveDefaults → newYear(Close-Out) → re-import` loop is sound: classrooms (scaffold)
survive a rollover while **allocations are correctly wiped** (per-cohort), and the migration-013
`bracket` column lives on the allocation rows so it is wiped with them — **no stale leak across years**
(verified: `newYear` calls `allocationRepo.deleteAll()`). After the owner decisions below, every area
is reusable through the UI.

### What I fixed (`public/index.html`, SPA-only; `sw.js` cache bump camp-v6 → camp-v7)
- **Stale SPA zone list (live prod defect + reuse).** `ZONES` was `['Yellow','Blue','Green','Red']` —
  pre-**migration-011**, which renamed the *Green* zone to *Black*. The director's "send a zone notice"
  composer is the **sole** consumer of `ZONES`, so a director could not target the live **Black** zone
  and selecting **Green** posted a notice **no church/leader could receive**. Corrected to
  `['Yellow','Blue','Black','Red']` (matches backend `ZONE_NAMES` + the accounts screen `ZONE_OPTS`).
  Collapsed the duplicate `ZONE_OPTS` to **reference the single `ZONES`** const so they can't drift again.
- **S1 — New Year guards against a missing baseline.** `newYear` throws "No defaults snapshot saved…"
  if Save Defaults was never run (previously only a bare toast deep in the flow). `doNewYear()`'s catch
  now shows an actionable **"Save your setup first"** modal routing to the Data screen (mirrors
  `adminReset`'s export-required modal), and the Close-Out checklist opens with a Save-Defaults reminder.
  **Nothing is purged** on this path (the snapshot check precedes any delete).

### Owner decisions (2026-06-30) — design-level gaps resolved, CLOSED (not carried forward)
- **Z1 — keep zones FIXED.** `ZONE_NAMES = Yellow/Blue/Black/Red` stays a code+enum set; documented as
  a platform constraint. Admin-managed zones deliberately **not** built. A different/extra zone needs a
  developer (enum + migration) — accepted, not a per-year task.
- **T1 — timezone fixed at Australia/Brisbane.** No in-app field by design. The draft "clobber fix"
  (preserve a stored timezone on save) was **REVERTED** — under a fixed-Brisbane invariant, re-asserting
  `timezone:'Australia/Brisbane'` on every save is correct and self-healing. `saveSettings()` is thus
  **net-unchanged** from pre-phase (only a clarifying comment added).
- Import phantom-church Yellow default + `seed.ts` post-reset fallback — reviewed, acceptable, documented.

### Files touched
- `public/index.html` (3 net edits: `ZONES` fix, `ZONE_OPTS` de-dup, S1 no-snapshot modal + Close-Out
  reminder; the `saveSettings` timezone edit was made then **reverted** per T1 — net-unchanged + a
  comment), `public/sw.js` (cache bump). Docs: `docs/PHASE-6-REUSABILITY-REVIEW.md` (NEW — the
  deliverable), `CHANGELOG.txt` (Phase-6 section), this log. **No `.ts`/schema/migration changes.**

### Verification
- `node --check` on the SPA `<script>` (Node under the Playwright driver): **PARSE OK, backticks even
  = 598.** No `.ts` changed → `tsc --noEmit` + vitest unaffected (still gated in DEPLOY-CHECKLIST §0).
  CommonJS `tsconfig` + anchored `/data/` gitignore untouched. Next free migration number still **014**.
  Nothing pushed/deployed.

### Handoff note → Phase 7 (redeployment)
- **Reusability changes that MUST be in the deploy:** `public/index.html` (zone list corrected to
  include **Black** not Green; `ZONE_OPTS`→`ZONES`; S1 no-snapshot modal + Close-Out reminder) and
  `public/sw.js` (**camp-v7** — without the bump the old shell serves from cache and the zone fix never
  reaches users). `saveSettings`/timezone is net-unchanged (T1 decision).
- **No new migration** this phase; confirm Phase-5's migration **013** (allocation `bracket`) is in the
  deploy plan (inert until applied). Next free number remains **014**.
- **On-device eyeball:** (1) as a **director**, open the notice composer → zone dropdown lists **Black**
  (not Green) and a Black-zone notice reaches Black-zone churches; (2) as **admin**, try a New-Year
  rollover with **no saved defaults** → "Save your setup first" modal appears, **no data purged**; run
  Save Defaults, then the rollover proceeds. (Carry the Phase-5 eyeball list forward too.)
- **No open owner decisions remain** from Phase 6 — Z1/T1 closed as deliberate fixed constraints, S1
  fixed. Nothing deploy-blocking.
- Anchor files unchanged. Nothing pushed/deployed; deployment remains the single Phase-7 event.

---

## Phase 7 — Reconcile + redeployment runbook (2026-06-30) — PROGRAM COMPLETE

**Goal (this phase):** not features — reconcile the whole program against the working tree, capture
every pivot, and leave the owner a single reliable redeployment runbook. The closing phase.

### Reconciliation — every claim verified, ZERO drift
Cross-checked PROGRAM-LOG + CHANGELOG against the actual tree:
- **Migrations:** `013_allocation_bracket.sql` present and is the **only** new migration post-`010`
  (`011`/`012` shipped with the original 2026-06-22 deploy). Next free number = `014`. ✓
- **`sw.js` = `camp-v7`** (Phase-6 claim). SPA `<script>` backticks **even = 598**; SPA + all 15
  changed `.ts` files **parse clean** under Playwright-bundled Node v24
  (`node --check` / `--experimental-strip-types --check`). ✓
- **C-1** verified end-to-end: `AllocationBracket`/`RoomAllocation.bracket` in the entity, 3-part-key
  parse/rebuild in `accommodation.service.ts` (`:69`, `:133`), `bracket` mapping in
  `supabase.allocation.ts`. ✓
- **H-2** `dashboard.service.ts` imports + uses the shared `currentSession`/`buildSessions` helper. ✓
- **B-2** `assertSessionSecret()` in `auth.service.ts`, called from `createAppInstance()` in `app.ts`;
  dead `JWT_SECRET` gone from `config/env.ts`. ✓
- **R9** `settings.controller` strips `lastTempPasswords` → `pendingTempPasswordCount` only. ✓
- **Phase 6 zone fix** `ZONES=['Yellow','Blue','Black','Red']` + `ZONE_OPTS=ZONES`. ✓
- **First-aid:** routes `GET /notes/firstaid` + `/search/contacts/:camperId` in the router;
  `note:write:firstaid`/`note:read:firstaid` in access-control; **zero** emoji/full-width chars in
  the SPA. ✓ All claimed test files exist (incl. `settings.controller.test.ts`,
  `accommodation.characterisation.test.ts`, `dashboard.service.test.ts`). ✓
- **Deploy gotchas intact:** `tsconfig` CommonJS/Node; `.gitignore` `/data/` anchored. ✓
- **Honest gap (unchanged):** full `tsc --noEmit` + `vitest` still NOT run (no project
  `node_modules`) — the mandatory §0 pre-flight in `DEPLOY-CHECKLIST.md`. Confirmed by reasoning +
  parse-checks; the suites were written, not executed in-env.

### Deliverables written
- **`docs/PROGRAM-SUMMARY.md`** (NEW) — what the program set out to do, what shipped (by area), and
  the 9 material pivots from the brief (no toolchain/git → owner commits; migrations were at `012`
  not `010`; one new migration `013` vs brief's "none expected", justified by C-1; resequenced
  execution; review-found defects; intentional type-scale rationalisation; narrowed first-aid spec;
  Z1/T1 as fixed constraints; the late-caught live `ZONES` prod defect). Includes a §4 note that the
  original repo's "PHASE 6: DEPLOYMENT" (2026-06-22) is a *different* numbering from this Initiative.
- **`docs/DEPLOY-CHECKLIST.md`** (REWRITTEN) — now the **single ordered runbook**, superseding the
  earlier Phase-1/4-only version. §0 mandatory `tsc`+`vitest` pre-flight → §1 apply migration `013`
  in order (before push) → §2 `sw.js` `camp-v7` ships with `index.html` → §3 env/secrets
  (`SESSION_SECRET` now fail-fast, `PERSISTENCE=supabase`) → §4 CommonJS/`/data/` no-regress guards →
  §5 commit/push to `master` → §6 per-role + first-aid post-deploy smoke checks → §7 outstanding
  owner decisions.

### Outstanding owner decisions (carried into the runbook §7)
- **B-1** check-in queue durability — failure is now *visible* (banner) but not *durable* (drops on
  4xx / tab close, not persisted). Decide whether to invest in true persistence as a fast follow-up.
  **Non-blocking.**
- **L-3** `.statband` column stepping — minor visual; bundle into any future visual pass. **Non-blocking.**
- **Z1 / T1** — CLOSED as deliberate fixed constraints (fixed zone enum; fixed Brisbane tz); recorded
  for the owner, not open work.
- Nothing else open. The hard gates (C-1, H-2, R9) are fixed with tests.

### Files touched
- `docs/PROGRAM-SUMMARY.md` (NEW), `docs/DEPLOY-CHECKLIST.md` (rewritten), this log. **No source/
  test/CSS/migration changes** — Phase 7 is reconcile + documentation only. Deploy gotchas
  re-confirmed; nothing pushed/deployed (the owner executes the runbook).

### Program close
7 phases complete. The upgraded app is deploy-ready pending the §0 toolchain run. The owner follows
`docs/DEPLOY-CHECKLIST.md` to redeploy into `citipointe-youth/my-youth-camp` `master`;
`docs/PROGRAM-SUMMARY.md` keeps the repo history coherent. **Improvement Initiative: COMPLETE.**
