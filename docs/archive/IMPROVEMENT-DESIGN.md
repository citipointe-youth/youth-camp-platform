# IMPROVEMENT-DESIGN.md — Youth Camp Platform, Phase 1 of 7

> **Status:** Design (pre-implementation). Authored 2026-06-29.
> **Scope:** Phase 1 of the 7-phase improvement program — the "engineering-maturity" pass.
> Brief: `../../CAMP-PLATFORM-IMPROVEMENT-BRIEF.md` (working root). Reference app: `connection-made-simple/` (CMS).
> This doc is one of the four **anchor files** (with `CLAUDE.md`, `debug.md`, `IMPROVEMENT-PLAN.md`)
> from which full working context can be rebuilt after any context reset.

---

## 0. Context, constraints & deviations from the brief

**The TARGET** is `my-youth-camp/` (camp `CLAUDE.md`/`debug.md`). **The REFERENCE** is `connection-made-simple/`.
We port CMS's *engineering maturity* (fluid type, breakpoints, SVG icons, perf layer, SW) onto the
camp app's *existing visual identity and SPA structure* — we do **not** reskin or rewrite to CMS's
`setApp` model (locked decision #2).

**Hard constraints (from brief §0 / §3):**
- No `npm`, no dev server, no browser. Verify by reasoning + keeping `tsc --noEmit` clean +
  vitest tests where natural + rendering visual changes into `ui-mocks.html` (working root).
- **Do not push, do not deploy.** Finish at a clean tree + full handoff pack.
- Don't regress the two deploy gotchas: CommonJS `tsconfig`; anchored `/data/` gitignore.
- Don't regress documented SPA efficiency rules (no double fetches).
- Keep the visual identity (indigo/purple, Plus Jakarta Sans, `:root` tokens).

**Deviations / corrections to the brief's stated assumptions (discovered during read):**
1. **Migrations already exist through `012`** (`011_rename_green_zone_black`, `012_registration_fields`),
   not `010` as the brief states. The next number, *if a migration were needed*, is `013`.
   **Expected outcome: no migration is required** (all Budget/accommodation/check-in work is
   frontend + pure logic against fields that already exist). We will **not** invent one.
2. **Neither repo is a git repository** in this environment. "Commit at each phase boundary" is
   reinterpreted as: persist state to `IMPROVEMENT-PLAN.md`, keep `tsc`/tests green, leave a clean
   tree. No `git` commands are run; the user can init/commit on their side.
3. **The SPA `index.html` is 2,377 lines / 183 KB**, single source of truth for the UI. **All edits
   to it happen on the main thread, serialized.** Subagents only *read* and hand back exact
   old→new strings; line numbers drift on every edit and are re-grepped after each change.
4. The icon system is a **single-size** `ic(n, cls)` registry (18 keys) — not CMS's
   `icN/icS/icLg/icEmpty`. We extend it with size helpers + new glyphs rather than copying CMS's
   helper names verbatim (the camp `ic()` already sizes via CSS context selectors; we keep that and
   add explicit size helpers for parity).

---

## 1. Current-state findings (from the read pass)

### 1.1 CSS / responsive (from `index.html` audit)
- **`:root`** (~L19–25) defines: 15 colour tokens, spacing `--s1..--s6` (4→32px), radii
  `--r-sm/--r/--r-lg`, two shadows, status colours `--ok/--warn/--danger/--info`.
  **No type-scale tokens. No font-size scale.**
- **`body` font is a fixed `15px`**; `html` has no `font-size` rule and does not scale at any width.
- **Exactly one breakpoint:** `@media(min-width:980px)` (~L217) — the binary phone-column→sidebar-grid
  switch. **No 480/540/768/900/1280 progression.** No `prefers-reduced-motion`. No `prefers-color-scheme`.
- **Container:** `.app` is `max-width:460px` (phone column) until 980px, then `#app` becomes a
  `220px 1fr` grid up to `max-width:1600px`. Tablet middle is a centered 460px strip (the owner's
  core complaint).
- **Grids:** only `.tiles` reflows (2→3 cols at 980px). `.statband`/`.gbar` are flex. A few inline
  `auto-fill minmax(...)` grids exist (tile grid ~L1741, room grid ~L1857).
- **~173 un-tokenized hex values** outside `:root` (notably `#fff` ×26, `#ede9fe` ×11 = `--chip`,
  `#5b21b6` ×7, gender colours `#1d4ed8`/`#db2777`, status fills). Many *are* already tokens used as
  raw hex.
- **Safe-area** handling is already correct (`.bar`, `.tabs`, `.sheet`, `#previewBanner` use
  `env(safe-area-inset-*)`; `100dvh` used throughout, no `100vh`). A8 is mostly a verify-and-tidy.

### 1.2 Icons (from `index.html` audit)
- `ICONS` registry (~L402–422), `ic(n,cls)` renderer (~L423), single 24-viewbox stroke SVG, sized by
  CSS context. **18 keys:** home, star, check, search, bell, alert, users, note, calendar, book,
  help, gear, chevron, clock, edit, at, key, trash (+ a couple more confirmed at edit time).
- **No blank-icon bugs today** — every `ic('key')` call resolves. But many UI glyphs are **emoji /
  Unicode symbols rendered as text**, not registry icons:
  - **Must become SVG:** `👁` (preview), `🚨` (urgent), `⚕` (medical), `☎︎` (call), `⌂` (classroom),
    `△` (tent), `✎` (→ reuse `edit`), `✕` (→ `close`/`trash`), `◆`/`◈` (scope/priority markers).
  - **Decision on typographic glyphs** (`→ ← ↓ · – — … ‹ › ⇄ ✓`): these are *typography*, not icons.
    Per decision #4 ("remove ALL emoji … `👁 ☎︎ ◆ ✎`") we replace **emoji and pictographic symbols**.
    Arrows/dashes/dots/ellipsis that are pure typography are **retained** where they read as text
    (e.g. "Mon · Tue", en-dash date ranges), but **directional/affordance arrows on buttons/links**
    (`→`/`←`/`↓` acting as "go"/"back"/"download" icons) are converted to SVG (`arrowr/arrowl/download`).
    `✓` used as a status pictograph in pills → `check` SVG; `✓` is not left as a glyph in interactive
    chips. This boundary is recorded so the C1 grep can be made to pass deterministically.

### 1.3 Backend pure logic (read)
- **`checkin-sessions.ts`** — `buildSessions()` flatMaps **AM+PM for every day**. AC-1 changes the
  first day to PM-only and the last day to AM-only.
- **`accommodation-allocation.ts`** — `computeGroups()` emits one group per church×gender (`{key,
  churchId, church, gender, n}`) gated by 75% classroom ratio. PC-10 splits a church×gender pool
  **>50** into `7-9` / `10-12` sub-pools, leaders halved across the two.
- **`dashboard.service.ts`** — `PreCampDashboard.unpaidCount` + `perChurchBreakdown[].unpaid` + the
  `paymentStatus==='unpaid'` filters are PC-3's target. `paymentStatus` enum/field **stays** (no migration).
- **`person.dto.ts`** — `/registrants` (`RegistrantDto`) already carries `registrationCost:number|null`,
  `discountCode`, `kind:'camper'|'leader'`, `gender`, `churchId/churchName`, `accommodationKind`.
  **Budget needs no new fields and no backend endpoint** — all data is client-side already.
- **`person.ts`** entity / **`enums.ts`** — `PersonKind = 'youth'|'leader'`; the **DTO** maps youth→
  `'camper'` (registrants) / `'student'` (campers). **Budget groups by DTO `kind` (`camper` vs
  `leader`).** `Grade = 7..12`. `paymentStatus: 'unpaid'|'deposit'|'paid'` (kept, unsurfaced).

---

## 2. The responsive system (Category A)

**Goal:** continuous fluid scaling phone→tablet→laptop, single source of truth in `:root`, no dead
zones. Keep the camp palette/identity.

### 2.1 Fluid type scale (A1)
Add a token scale to `:root` (names chosen to read in-context; values are the *current* sizes
mapped onto a scale, so no visual regression at phone width):

| Token | Phone value | Role |
|---|---|---|
| `--t-display` | ~2.0rem | hero/grand-total numbers |
| `--t-h1` | ~1.4rem | screen titles |
| `--t-h2` | ~1.15rem | section headers |
| `--t-body` | 1rem (=root) | body |
| `--t-sm` | ~.86rem | secondary |
| `--t-xs` | ~.78rem | chips/meta |
| `--t-micro` | ~.72rem (**11px floor** enforced) | labels |

- Switch `body` from fixed `15px` to `font-size: var(--t-body)` with **root scaling**:
  `html{font-size:15px}` → `16px @768` → `17px @1280` (proportional growth; mirrors CMS's
  16→17→18 idea but anchored to the camp's 15px base so phone is unchanged).
- Every hardcoded `font-size` in the file maps onto a token (audit table in CODE-QUALITY-LOG).
- 11px legibility floor: `--t-micro` never resolves below 11px (`max(.72rem, 11px)` style clamp at
  the smallest root).

### 2.2 Continuous breakpoints (A2)
Introduce **540 / 768 / 900 / 1280** alongside the existing **980** (which stays the "switch to
sidebar nav" point). Each adds a reflow step:
- 540: content padding grows; 1-col card stacks → 2-col where sensible.
- 768: root font 15→16; container max-width grows; stat/tile grids gain a column; `.two-col` enabled
  below the sidebar threshold.
- 900: tile grids gain another column.
- 980: sidebar grid (unchanged behaviour, now no longer the *first* responsive step).
- 1280: root font 16→17; container max-width to its ceiling; widest grid counts.

### 2.3 Fluid container (A3)
`.app` / `#stage` content column grows with viewport instead of a fixed 460px strip:
`max-width: clamp(460px, 92vw, 720px)` on phone/tablet, expanding to the existing 1600px sidebar
grid at ≥980px. Centered, responsive horizontal padding via a `--pad` token that steps up at 540/768.

### 2.4 Fluid grids (A4, A6, A7/PC-12)
- `.tiles` (home/admin tiles): `repeat(auto-fill, minmax(150px,1fr))` → demonstrable 2→3→4 steps.
- `.statband`: keep flex but allow wrap; on laptop expand to a 4-up grid.
- Dense lists (rosters, accounts, budget rows): **card-stack on phone, table/multi-column on laptop**
  (Project-2 lesson: `overflow-x-auto`+`min-w` only as a fallback). Budget church rows are
  card-stacks that get more horizontal breathing room at width.
- **Accommodation room selector (A7/PC-12):** convert to **wrapping narrow tiles**
  (`auto-fill minmax(140px,1fr)`), matching the account/accommodation-setup tile pattern.

### 2.5 Per-screen audit (A5)
Every `RENDER.*` is walked; the **screen → change** table is appended to this doc at the end of
Phase 6 (Definition of Done requires it complete).

### 2.6 Safe-area (A8)
Audit-and-confirm: insets already handled; ensure new containers inherit `--pad` + insets and the
preview-banner/header double-inset rule still holds.

---

## 3. Perf / perceived-speed model (Category B)

The skeleton exists (`Cache` 30s TTL ~L313, `_allCached` ~L322, `_invalidate` ~L325, `_prefetch`
~L375, `_navTo` SWR ~L537). Bring to CMS parity:

- **B1 prefetch to parity:** `_prefetch()` warms **every endpoint the current role×mode will hit**
  (table in this doc, §3.1). Each `RENDER.*` has a cached path that skips the spinner via
  `_allCached(...)`.
- **B2 optimistic writes:** extend the check-in optimistic pattern (`CHECKIN_QUEUE`) to other
  safe high-frequency writes — sign-in/out, note add, notice delete, registrant mark — each with a
  defined rollback and the correct `_invalidate` mapping.
- **B3 skeletons:** lightweight skeleton placeholders (shimmer blocks) for first loads of
  list/dashboard screens (home pulse, rosters, budget, accommodation).
- **B4 loading indicators (incl. PC-8 import):** audit every long action (import, export,
  reset/rollover, save-defaults) → disabled-button + spinner/progress. Produce **action→indicator
  table** (in this doc, §3.2).
- **B5 smaller first paint:** keep home painting before the async pulse; ensure boot does the
  minimum before first paint (defer non-critical fetches).
- **B6 regression guard:** re-verify the documented "no double fetch" invariants after refactors.

### 3.1 Prefetch matrix (per role × mode) — *to be finalized in Phase 3*
| Role | pre-camp warms | at-camp warms |
|---|---|---|
| church | /settings,/home,/registrants,/notifications | /settings,/home,/checkin/current+status,/notifications |
| zoneLeader | (as church, zone-scoped) | (as church) |
| director | + /accounts/churches | + roster/notes |
| admin | + /accounts/*, /admin/* hub data | + roster/notes |
| firstAid | /settings,/home(firstAid),/search seed | (same both modes) |

### 3.2 Action→indicator table — *to be filled in Phase 3*
(import, export CSV, save-defaults, close-out, factory-reset, send-notice, save-settings …)

---

## 4. Navigation single-source (Category D)

**Problem:** `buildTabs` (~L605) and `_renderWideNav` (~L567) are independent; sidebar is empty for
church/zoneLeader and broken for admin at-camp.

**Design (D3):** one pure function `navModel(role, mode)` returns an ordered list of
`{id, label, icon, tab}` items. **Both** `buildTabs` (bottom nav) and `_renderWideNav` (sidebar)
render from it, so they can't diverge.
- **D1 (CH-1):** church/zoneLeader sidebar mirrors their bottom tabs per mode.
- **D2 (AC-5):** admin at-camp sidebar = exactly **Home, Check In, Search, Notices, Accommodation
  Allocations, Admin Settings** (order fixed). "Admin Settings" routes to `RENDER.admin` (console hub).
- **D4:** `TAB_OF` (~L505) audited so every `RENDER.*` highlights the right item, including new screens.
- **D5:** scroll preservation — same-page re-render must not jump to top (CMS window-scroller model
  applied to `#stage`).

Note: bottom-tab and sidebar item sets aren't *identical* (sidebar shows admin sub-screens), so
`navModel` returns a base tab list **plus** a sidebar-extras list per role×mode; the shared core
guarantees parity on the common items.

---

## 5. Budget rebuild (Category H / §5) — authoritative

### 5.1 Pure costing helper (testable)
New file **`src/services/budget.ts`** — pure, no I/O — is the **canonical** costing logic and the
unit-test target. The SPA mirrors the same algorithm in JS (the HTML can't import from `src/`); the
vitest suite proves the algorithm, and the mock render proves the SPA mirror.

**Input:** array of `{churchId, churchName, kind:'camper'|'leader', registrationCost:number|null}`
(the fields already on `/registrants`).
**Output:**
```
BudgetReport {
  grandTotal: number; camperCount: number; leaderCount: number; churchCount: number;
  churches: ChurchBudget[]  // sorted by name
}
ChurchBudget {
  churchId; churchName; camperCount; total;        // total = campers + leaders lines
  campers: CategoryRow[]; leaders: CategoryRow[];
}
CategoryRow { label; amount; count; lineTotal }     // lineTotal = count * amount
```

### 5.2 Category derivation ("by cost amount, smart labels" — owner decision)
- A category = a **distinct `registrationCost` value** within a (church, audience) scope.
- `registrationCost == null` → a **"Cost not recorded"** category: counted, **flagged**, contributes
  **$0** to totals (never dropped — this is what makes the grand total honest).
- Labels derived from amounts **relative to the dataset**, not hardcoded:
  - highest distinct positive cost in the **whole dataset** → `Full — $X`
  - `0` → `Sponsored — $0`
  - intermediate positive values → `Part — $Y` (or `Half` when ≈50% of Full; otherwise just the amount)
  - a `discountCode` consistently tied to a tier may be surfaced as a hint suffix.
  - **No hardcoded 180/90/0.**
- Rows sorted by amount descending (Cost-not-recorded last).

### 5.3 Totals & the acceptance invariant
- `ChurchBudget.total = Σ camper lineTotals + Σ leader lineTotals`.
- `grandTotal = Σ church totals`.
- **Invariant (asserted by test): `grandTotal === Σ of every CategoryRow.lineTotal across all
  churches & audiences`.** This is the headline data-correctness test (J1).

### 5.4 Screen structure (owner layout)
Grand-total card (`$total · N campers · M leaders · K churches`) → filter (All ministries ▾) +
Export CSV → collapsible church rows (collapsed: name · #campers · church total; expanded: CAMPERS
category rows, then LEADERS category rows, then church-total line). Expand animated + reduced-motion
aware (L3). Single-church filter shows just that church expanded, grand total scoped to it.

### 5.5 CSV export (client-side)
Mirror `/notes/export` style (build a CSV string, trigger download). Columns: `Church, Audience,
Category, Count, UnitPrice, LineTotal` + church-total and grand-total rows. No backend, no migration.

### 5.6 PC-4 (remove tent/classroom price from Settings)
Remove the two price fields from `RENDER.adminSettings` and stop reading
`SETTINGS.tentPrice/classroomPrice` anywhere. **Leave `CampSettings.tentPrice/classroomPrice`
columns/entity fields in place (deprecated)** — no destructive migration. Update `CLAUDE.md` (Budget
+ accommodation notes that currently say prices live on `CampSettings`).

---

## 6. Accommodation split (Category J3 / PC-10)

In `computeGroups()` (`accommodation-allocation.ts`) and the SPA `accomGroups`:
- A church×gender classroom pool with **>50 people** splits **that gender** into two sub-pools by
  school grade: **7–9** and **10–12** (grades 7/8/9 vs 10/11/12). `≤50` stays one group.
- **Leaders have no grade** → that gender's leaders **divide evenly (halved)** across the two
  brackets (odd leader → the extra goes to one bracket deterministically, e.g. 7–9).
- Group keys extend to encode the bracket, e.g. `${churchId}|${gender}|7-9` / `|10-12`; un-split
  groups keep `${churchId}|${gender}`. `validateAllocations`, single-gender rooms, auto-fill, and
  un-allocate cascade all operate on the resulting sub-pool keys unchanged.
- **Requires grade on the occupant.** `AllocationOccupant` gains an optional `grade?: number|null`;
  the service populates it from `Person.grade`. (Type-only; no persisted field, no migration.)
- **Tests (vitest):** boundary at exactly 50 (one group), 51 (split); odd leader counts; one gender
  over and the other under; all-leaders pool.

### 6.1 PC-11 Tent City totals
`tentDistribution`/`tentsFor` already bucket 7/tent students & leaders separately. Surface, next to
**Tent City — Male / Female**, the **count of student tents and leader tents** for that gender
(`tentsFor(stu)` / `tentsFor(ld)` summed across churches).

---

## 7. Check-in session correctness (Category J2 / AC-1)

`buildSessions(checkInDays)`:
- **First day → PM only** (arrive at lunch). **Last day → AM only** (depart at lunch). Interior days
  → AM+PM. **Single-day camp → ?** decision: a 1-day camp collapses to **PM only** (treat as arrival
  day) — documented; tests assert it.
- `currentSession`/dashboard `buildSessions(...).filter(day===today)` keep working (they filter the
  already-correct set). Optimistic queue unaffected (operates on whatever sessions exist).
- **Tests:** 1-day (PM only), 2-day (day1 PM, day2 AM), N-day (PM, full interior, AM).

---

## 8. Iconography & visual system (Category C)

- **C1/C2:** extend `ICONS` with `preview, urgent, medical, phone, classroom, tent, close, arrowr,
  arrowl, download, diamond` (names final at edit time); replace every emoji/pictographic glyph with
  `ic('key')` at the right size. Reuse `edit` for `✎`. Confirm every `ic()` key resolves.
- **Size helpers:** add `icLg`/`icSm` wrappers (or a size arg) so feature icons (grand-total card,
  empty states) and inline chips get correct sizing without ad-hoc CSS.
- **C3 token discipline:** replace stray hex with `:root` vars; add tokens for recurring unmapped
  values (the indigo tints `#5b21b6/#ddd6fe/#c4b5fd/#f5f3ff`, gender `--male/--female`, status fills).
  Gender tokens (`--male`, `--female`) also serve **AC-4** (initials-bubble colour) and the Budget
  gender treatment.
- **C4 empty states:** one `emptyState(icon,msg)` helper (48px icon + message) across all lists.
- **C5 spacing rhythm:** consolidate ad-hoc paddings/gaps onto `--s*` (and add `--s7` if a larger
  step recurs).

---

## 9. A11y / forms / feedback / PWA / micro-interactions (E/F/G/K/L)

- **E:** focus-visible rings on all interactive elements; ≥44px tap targets; ARIA names on icon-only
  buttons; `aria-live` on toasts; `@media(prefers-reduced-motion:reduce)` block (currently absent);
  contrast check on gradient hero/chips.
- **F:** one inline-validation/error pattern; import preview→progress→result; disabled/loading submit
  buttons (anti double-submit); wizard responsive.
- **G:** uniform toast (style/position/`aria-live`/safe-area); map `{code,message}` → friendly text
  (never `[object Object]`); skeletons where spinners flashed; optimistic-rollback "couldn't save"
  affordance.
- **K (SW):** bring `sw.js` from `camp-v2` to the CMS model — network-first HTML, network-only API
  via a complete `API_RE` (enumerate **every** route from `router.ts`), `controllerchange`→auto-reload.
  Bump cache name (→ `camp-v3`) on ship.
- **L:** press/active states; cheap list/section transitions; dropdown/expander animation (Budget
  rows) — all gated by reduced-motion.

---

## 10. Code quality (Category I) — logged in `CODE-QUALITY-LOG.md`
- I1 extract shared render helpers (card/row/chip/header/empty-state) — behaviour-preserving.
- I2 uniform data-load idiom across `RENDER.*` (parallel `Promise.all` + cache + stale guard).
- I3 dead-code sweep (self-registration/reg-codes already gone — verify no stragglers).
- I4 `esc()`/XSS audit on every changed interpolation.
- I5 keep `debug.md` line map accurate as edits shift offsets.

---

## 11. Bug → work-unit mapping (de-confliction; fix once)
| Bug(s) | Folded into |
|---|---|
| PC-3 | §3 J4 / dashboard.service + home render (remove unpaid) |
| PC-9 | `&amp;` double-escape in titles (C/cleanup) |
| PC-5 | FAQ save recursion + in-place re-render; schedule save re-render |
| AC-1 | §7 check-in sessions |
| AC-6 | `openCamper` — drop consents *line* (keep data) |
| AC-7 | Notes/testimonies filter swap (positional) |
| CH-2 | Testimony student dropdown data load |
| PC-2 | Rename "New Year Rollover"→"Save Defaults", rewire to `/admin/defaults` |
| A1–A8 | §2 responsive |
| C1–C5 | §8 icons/tokens |
| D1/D2/D3/D4/D5, AC-5, CH-1 | §4 nav single-source |
| B1–B6, PC-8 | §3 perf + loading table |
| §5 Budget, PC-4 | §5 |
| PC-10, PC-11, A7/PC-12 | §6 accommodation |
| AC-2/AC-3/AC-4, AC-8+AC-7, PC-6/PC-7, PC-1 | Phase 6 per-screen |
| E/F/G/K/L/I | Phase 7 |

---

## 12. Migrations & deploy
- **Expected: zero migrations.** All work is frontend + pure logic over existing fields. If that
  changes, the next number is **`013`** (012 already exists), idempotent-safe, no dropped-column refs,
  with `src/repositories/supabase/*` + entity updated in lockstep.
- `sw.js` cache bump `camp-v2`→`camp-v3` on ship. `DEPLOY-CHECKLIST.md` written in Phase 8.
- Deploy gotchas (CommonJS tsconfig; anchored `/data/`) verified untouched at the end.

---

## 13. Per-screen responsive audit table (A5)

All screens inherit the global foundations — fluid type scale (text grows at 768/1280), the
fluid container (`.app`/`#stage` widens 460→820px below the 980 sidebar), and fluid `.tiles` —
so **none remain a fixed phone column**. Per-screen specifics:

| Screen (`RENDER.*`) | Responsive treatment |
|---|---|
| home (pre-camp) | hero + `.statband` (wraps ≥540) + tile grid (auto-fill) + budget/accom cards (wide); by-ministry table lives in the widened container |
| home (at-camp) | tile grid (auto-fill 2→3→4); notices cards; pulse injected async (B5) |
| people / My Youth | `.row` list, scales with container width |
| help / faq | card list; pre-camp only (PC-7) |
| **budget** | hero grand-total card + collapsible church cards (card-stack, fluid width); category rows are flex rows that breathe with width |
| **accom** | room cards now wrapping tiles (`.accom-rooms` auto-fill 240px); not-allocated + tent tables in the widened container |
| checkin | session roster `.row` list; optimistic queue |
| search | search box + `.row` results |
| notifs / compose | notice cards; seg controls |
| firstday | filtered `.row` lists (not-in + already-in), gender bubbles |
| notes / testimonies | filter `selrow` (wraps ≥540) + card-stack records |
| schedule / devotional | day seg + card |
| admin* | tile/card layouts; account rows; room-setup tiles (auto-fill 180px); data screen card stack |

**Verification:** structural (grids use `auto-fill`/flex-wrap, container max-width steps); visual
confirmation is the DEPLOY-CHECKLIST §4 on-device eyeball (no browser in the authoring env).

## 14. Status note (end of Phase 1)
Done: Phase 0 bugs, Phase 1 foundations (A1–A4, C1–C3), Phase 2 nav (D1–D5), Phase 4 Budget (§5,
PC-4), Phase 5 accommodation (PC-10/11, A7/PC-12), Phase 6 at-camp/admin fixes (AC-2/3/4/7/8,
PC-1/6/7), Phase 7 a11y/SW/micro-interactions (E1–E4, K1–K2 incl. the live `/export` `API_RE`
fix, L1/L3), Phase 8 docs.
Open (carried to a follow-up / Phase 2): B-phase perf *polish* (skeletons, broader optimistic
writes, prefetch matrix, loading-indicator audit) — the perf *skeleton* already shipped; remainder
is additive. Deeper I1/I2 helper extraction. Real-toolchain typecheck/vitest run (DEPLOY-CHECKLIST §0).
