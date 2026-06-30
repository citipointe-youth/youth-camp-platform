# IMPROVEMENT-PLAN.md — Phase 1 implementation plan (checkboxes)

> **Anchor file.** Keep checkboxes current as work proceeds. Rebuild context from:
> TARGET `CLAUDE.md` + `debug.md` + working-root `CAMP-PLATFORM-IMPROVEMENT-BRIEF.md` + this plan +
> `docs/IMPROVEMENT-DESIGN.md`. Each sub-phase boundary = checkpoint (update this doc, keep `tsc`
> clean + vitest green; no git in this env so no commit, leave clean tree).
>
> Legend: `[ ]` todo · `[~]` in progress · `[x]` done. Bug IDs in parentheses.

---

## Phase 0 — Pure logic / data bugs (small, testable, low-risk)
- [x] PC-3 — removed "unpaid" from `PreCampDashboard`/`perChurchBreakdown` + service filters + home render pill (J4). `paymentStatus` enum/field & the separate reminders `chase`/`breakdown` left intact.
- [x] PC-9 — fixed 3 title-position `&amp;` (paint titles use `textContent`, which shows the entity literally): "Accounts & churches", "Dates & details", "Data, Reset & Exports". `&amp;` inside HTML-content args left as-is (correct).
- [x] PC-5 — root cause: `_rAccts/_rFaq/_rFaqEdit/_rSched/_rContacts` each called *itself* (`await await _rFaq()`) → stack overflow AND no post-save re-render. All 5 now call their matching `RENDER.*`. Cache invalidation for `/faq`+`/schedule` already correct → fresh re-fetch.
- [x] AC-1 — `buildSessions`: day1 PM-only, last-day AM-only, interior AM+PM; 1-day=PM-only (J2). New `checkin-sessions.test.ts`; updated checkin/dashboard test fixtures to 3-day so their interior-day intent holds.
- [x] AC-6 — `openCamper`: consents line removed from profile UI; consent data still in DTO/model.
- [~] AC-7 — DEFERRED to Phase 6 (notes filter rebuilt **once** with AC-8 per §6 de-confliction map).
- [x] CH-2 — testimony dropdown now merges `/registrants` (pre-arrival youth) + `/campers` (arrived students), dedup by id — church youth appear regardless of lifecycle. (Pure selection not separately extractable; covered by reasoning + mock.)
- [x] PC-2 — title+button now "Save Defaults"; "(incl. devotionals)" dropped; note clarifies vs Close-Out Camp. Handler `adminSaveDefaults()`→`POST /admin/defaults` confirmed distinct from `doNewYear()`→`POST /admin/new-year`.
- [x] Checkpoint: edits structurally balanced (backticks/braces/parens checked); no toolchain in env so `tsc`/vitest verified by reasoning + type-tracking; plan updated. (AC-7 carried to Phase 6.)

## Phase 1 — Foundations (global CSS; do before per-screen)
- [x] A1 — 11-step type-scale tokens `--t-display…--t-micro` in `:root`; `html` root 16→17→18 at 768/1280; mapped 72 style-block `font-size` literals to tokens (≤~0.7px deltas — flagged for on-device review). 2 literals left intentionally (login h1, tile-ic size).
- [x] A2 — continuous breakpoints 540/768/900 (+ 1280 root bump) added before the 980 sidebar block.
- [x] A3 — fluid container: `.app` max-width steps 460→600→720→820; `--pad` gutter steps 14→18→22; `.screen` padding rebased on `--pad`.
- [x] A4 — `.tiles` now `auto-fill minmax(132px,1fr)` (continuous 2→3→4); wide-layout tiles also fluid (min 150px) not capped at 3.
- [x] C1 — added 13 glyphs (preview/urgent/medical/phone/classroom/tent/close/arrowr/arrowl/download/diamond/plus); swept ~57 emoji/affordance/✓ markup sites to `ic*()`; stripped 30 trailing `✓` from textContent toasts. **Zero emoji/pictographs remain.**
- [x] C2 — size helpers `icSm/icLg/icXl` + `emptyState()`; audited every `ic*()` key against registry — **no missing keys, no blank icons.**
- [x] C3 — added tint/gender tokens; tokenised 25 raw-hex in style block + gender hex in swept body markup. (`#fff` left as literal — distinct intent from `--card`.)
- [x] Checkpoint: backticks even (524), style braces balanced, script tags matched; mock updated (Phase-1 showcase section); CODE-QUALITY-LOG started. No toolchain → verified by structure + reasoning.

## Phase 2 — Navigation single-source
- [x] D3 — `navModel(role,mode)` returns `{tabs,extras}`; both `buildTabs` (bottom) and `_renderWideNav` (sidebar via `navSidebar`) derive from it. Old per-function tab/sidebar lists deleted.
- [x] D1 (CH-1) — church & zoneLeader now get a populated sidebar mirroring their bottom tabs per mode (pre: Home·My Youth·Help·Notices; at: Home·Check-in·Search·Notices).
- [x] D2 (AC-5) — `navSidebar` special-cases admin at-camp to exactly: Home, Check In, Search, Notices, Accommodation Allocations, Admin Settings (Admin→`RENDER.admin` hub).
- [x] D4 — sidebar highlight prefers the screen's own id when it's a sidebar item (budget/accom/notes), else `TAB_OF` owner; bottom-tab highlight unchanged via `TAB_OF`.
- [x] D5 — `paint()` now preserves `scrollTop` on same-screen re-paints (subsumes the manual save/restore in `_r*`); fresh navigations still reset to top.
- [x] Checkpoint: nav region brace/paren-balanced; backticks even; 4 nav fns defined once each.

## Phase 3 — Perf layer to parity (+ loading indicators / PC-8)
- [ ] B1 — `_prefetch` warms all role×mode endpoints; `_allCached` spinner-skip on every `RENDER.*`
- [ ] B2 — optimistic writes (sign-in/out, note add, notice delete, registrant mark) + `_invalidate` mapping per write
- [ ] B3 — skeleton loaders (home pulse, rosters, budget, accommodation)
- [ ] B4 / PC-8 — loading-indicator audit (import, export, reset/rollover, save-defaults, send-notice, save-settings) + action→indicator table
- [ ] B5 — smaller first paint (defer non-critical boot fetches; document deferred)
- [ ] B6 — regression guard: re-verify "no double fetch" invariants
- [ ] Checkpoint (finalize prefetch matrix + action table in design doc)

## Phase 4 — Budget rebuild (§5, incl. PC-4) — DONE (out of brief order; done after Phase 2)
- [x] `src/services/budget.ts` pure helper: `computeBudget`, `labelForAmount`, `budgetToCsv`. Categories = distinct cost per (church,audience); null→"Cost not recorded" ($0, flagged, never dropped); labels dataset-relative (Full/Half/Part/Sponsored, no hardcoded values).
- [x] `budget.test.ts` — mixed tiers, all-sponsored, null-cost, leaders-only, empty, single-church filter, code-hint, CSV; **grand total === Σ all line totals asserted** in multiple cases (J1).
- [x] SPA `RENDER.budget`/`drawBudget` rebuilt to mirror the helper: hero grand-total card, ministry filter + Export CSV, collapsible per-church rows (collapsed: name·#campers·total; expanded: CAMPERS then LEADERS category rows w/ count×price=line, church-total line), animated expander (`.budchurch-body`, reduced-motion gated in Phase 7).
- [x] Budget CSV export client-side (`exportBudget`) — Church,Audience,Category,Count,UnitPrice,LineTotal + church-total + grand-total rows.
- [x] PC-4 — removed tent/classroom price inputs from `RENDER.adminSettings`; `saveSettings` no longer sends them; `_budgetPrice` removed; no residual `SETTINGS.tentPrice/classroomPrice` reads. (DB columns left in place — no migration.)
- [x] Mock: collapsed + expanded Budget states added to `ui-mocks.html`.
- [x] Checkpoint: budget region brace/paren/backtick balanced; 5 budget fns present.

## Phase 5 — Accommodation — DONE
- [x] PC-10 — `computeGroups` splits a church×gender classroom pool >50 into `7-9`/`10-12` keys; leaders halved (ceil→7-9); ungraded youth ride 7-9; `AllocationOccupant.grade` added + populated in `accommodation.service`. `genderOfKey` (key index 1) keeps split keys single-gender so validate/auto-fill/cascade work unchanged. SPA `accomChurches`/`accomGroups` rewritten to mirror (incl. leaders in pool — fixed a pre-existing SPA/backend discrepancy). **+vitest**: 50 (single), 51 (split), odd leaders, one-over-one-under, ungraded→7-9, all-leaders, split-key validation.
- [x] PC-11 — Tent City Male/Female headings now show total student-tents · leader-tents for that gender (sum of per-church 7-buckets). (Per-church table already existed.)
- [x] A7 / PC-12 — allocation room cards reflow as wrapping narrow tiles (`.accom-rooms` grid, auto-fill minmax 240px); admin room setup already used the tile pattern. Removed stale "Prices are set in Camp settings" infobox line (PC-4 follow-through).
- [x] Checkpoint: accom region brace/paren/backtick balanced.

## Phase 6 — Per-screen responsive audit + remaining at-camp/admin fixes
- [~] A5 — per-screen audit table: foundations (fluid type/container/grids) make every screen scale; table to be finalised in design doc Phase 8.
- [~] A6 — dense lists: notes/budget are card-stacks; rosters use `.row`; wide tables (by-ministry, tents) live in the wide container. Mostly inherited from A1–A4; spot-tighten in Phase 8.
- [ ] A8 — safe-area/viewport verify across new containers (Phase 8 eyeball).
- [x] AC-2 — already-signed-in first-day rows are now tappable to sign OUT (error correction) via `signOutPrompt`; respects attendance path.
- [x] AC-3 — first-day filter (`matchFilter`) now applies to the already-signed-in section (`visibleIn`) too.
- [x] AC-4 — initials bubble already gender-coloured via `.av.male`/`.av.female` (blue/pink, now tokenised `--male/--female`). Verified on first-day rows.
- [x] AC-8 + AC-7 — notes/testimonies filter rebuilt once: Zone & Ministry swapped (Zone first); "Signed out" record option added, synthesised from camper `signOutHistory` (atCamp:false). Empty state via `emptyState`.
- [x] PC-6 — FAQ admin (`RENDER.adminFaq`) already lists each existing FAQ with editable Q/A + Save/Delete + Add form. Confirmed satisfied.
- [x] PC-7 — removed at-camp home FAQ tile; `RENDER.faq` guards `CAMP_MODE==='at-camp'`→home; Help only a pre-camp tab in `navModel`. Admin can still edit FAQ via Admin console.
- [x] PC-1 — `RENDER.adminData` reordered: Upload → Save Defaults → Compliance Export → Close-Out → Factory Reset.
- [ ] Checkpoint (A5/A6/A8 finalised in Phase 8)

## Phase 7 — A11y / forms / feedback / PWA / micro-interactions / code-quality
- [x] E1 focus-visible rings on all interactive els · E2 `.iconbtn` min 44px · E3 aria-label on icon-only account buttons + toast `role=status aria-live` · E4 `prefers-reduced-motion` block (was absent) · E5/E6 (contrast/labels) spot-checked, flagged for eyeball.
- [~] F1/F3 — import already has dry-run preview→confirm; submit-button disable-on-pending is partial (B4 covers import). F4 wizard inherits fluid layout. (Lower-priority polish; B4 loading audit deferred with B-phase.)
- [x] G1 toast `aria-live` + safe-area (already bottom-anchored) · G2 confirmed all errors are `Error.message` strings — no `[object Object]` path · G3 skeleton = `emptyState`/SWR (B3 deferred) · G4 (optimistic rollback) tied to B2 (deferred).
- [x] K1 — **found & fixed the documented `API_RE` gotcha**: `/export` was missing (SPA downloads /export/audit|registrants|signin-out) → could serve stale HTML. Added; cache bumped `camp-v3`→`v4`. SW already network-first HTML / network-only API. · K2 `controllerchange` auto-reload already present · K3 HTML offline fallback to cache present.
- [x] L1 press/active states (reduced-motion gated) · L3 Budget expander animation (done in Phase 4) · L2 screen `rise` animation gated by reduced-motion.
- [~] I — CQ log maintained (CQ-001..006); I3 noted dead `accLabelOf().text`; I4 esc() audit on changed interpolations done inline; I1/I2 (broad helper extraction) partially via `emptyState`/`navModel`/budget helpers — deeper extraction left as low-risk follow-up. I5 debug.md updated in Phase 8.
- [ ] Checkpoint — Phase 8 finalises docs.

## Note on deferred B-phase (perf polish)
Phase 3 (B1 full prefetch matrix, B2 broader optimistic writes, B3 skeletons, B4 loading-indicator
audit, B5/B6) is **partially in place from the existing codebase** (Cache/`_allCached`/`_prefetch`/
SWR `_navTo` already shipped; check-in optimistic queue exists; home paints before async pulse).
The remaining B work is **additive polish, not correctness** — deferred so the correctness-critical
rebuilds (Budget, accommodation, nav, bugs) and the SW gotcha landed first. Documented here and in
the design doc as open for a follow-up pass / Phase 2 of the program.

## Phase 8 — Final pass / handoff pack
- [x] CHANGELOG.txt — new 2026-06-29 section, by category + bug ID.
- [x] CLAUDE.md — "Improvement Initiative" contract block + superseded accommodation/check-in notes.
- [x] debug.md — Phase-1 banner + symptom-router entries (Budget, nav source, accom split, signed-out, export SW).
- [x] docs/CODE-QUALITY-LOG.md — CQ-001..010.
- [x] docs/DEPLOY-CHECKLIST.md — ordered ship steps (toolchain gate, no migration, sw v4, eyeball list, push).
- [x] docs/PROGRAM-LOG.md — Phase 1 entry + decisions + handoff note to Phase 2.
- [x] docs/IMPROVEMENT-DESIGN.md — A5 per-screen table + status note filled.
- [x] ui-mocks.html — Phase-1 showcase + Budget collapsed/expanded states.
- [x] migrations — confirmed NONE needed (repo already at 012; next would be 013).
- [~] Final: `tsc`/vitest must run on a real machine (no toolchain here) — gated in DEPLOY-CHECKLIST §0.
      Structural checks done: string-aware brace balance = 0, backticks even, no `${}`-in-single-quote,
      every `ic*()` key resolves, zero emoji. Deploy gotchas intact; nothing pushed.

---

## Decisions / pivots log (append as they happen)
- 2026-06-29: Migrations already at `012`, not `010` (brief snapshot stale). Next = `013`; expect none.
- 2026-06-29: No git repo in env → "commit at boundary" = persist plan + green build + clean tree.
- 2026-06-29: Typographic glyphs (`· – — …` and text arrows in non-affordance contexts) retained;
  emoji + pictographic/affordance glyphs (`👁🚨⚕☎⌂△✎✕◆◈`, button `→←↓`, status `✓`) → SVG. (C1 boundary.)
- 2026-06-29: Budget groups by DTO `kind` (`camper`/`leader`); youth→camper mapping is in the DTO.
- 2026-06-29: 1-day camp → PM-only check-in (arrival-day semantics).
