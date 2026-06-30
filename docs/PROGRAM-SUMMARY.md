# PROGRAM-SUMMARY.md — Youth Camp Platform Improvement Program

> Authored 2026-06-30 (Phase 7, the closing phase). The single-page story of the 7-phase
> improvement program: what it set out to do, what actually shipped, and every material pivot from
> the original brief — so the owner and the **original repo's** git history stay coherent when this
> work is committed back to `citipointe-youth/my-youth-camp` `master`.
>
> **Companion docs:** the ordered shipping procedure is `docs/DEPLOY-CHECKLIST.md`; the blow-by-blow
> ledger is `docs/PROGRAM-LOG.md`; the master brief is `../CAMP-PLATFORM-IMPROVEMENT-BRIEF.md`.

---

## 1. What the program set out to do

Port the CMS sibling app's **engineering maturity** (fluid type, continuous breakpoints, fluid
grids, SVG-only icons, a complete perf/service-worker model) onto the camp app's **existing visual
identity and SPA structure** — **no reskin, no `setApp` rewrite** — plus a full Budget rebuild and a
batch of 22 owner-reported bug fixes. Then harden it through successive independent reviews and a
first-aid login UX, ending in a single clean redeployment to the live production app
(https://my-youth-camp.vercel.app, Supabase backend, Vercel auto-deploy from `master`).

Seven phases: **(1)** engineering-maturity pass + 22 bug fixes → **(2)** UI showcase + owner feedback
→ **(3)** independent code review → **(4)** first-aid login UX → **(5)** six-thinking-hats whole-program
review + defect fixes → **(6)** year-to-year reusability review → **(7)** reconcile + write the
redeployment runbook (this phase).

---

## 2. What actually shipped (by area)

**Responsive / engineering maturity (Phase 1):** fluid `--t-*` type scale (11 tokens; root font
16→17→18px @768/1280; 72 literals tokenised), continuous breakpoints 540/768/900/1280 before the
980px sidebar, fluid container (460→820px) and `.tiles`. All emoji → SVG (13 new glyphs +
`icSm/icLg/icXl` + `emptyState`); tint/gender hex tokenised. Single-source navigation
`navModel(role,mode)` → `buildTabs` + `_renderWideNav` (church/zoneLeader now have populated desktop
sidebars). A11y: focus rings, 44px targets, ARIA, reduced-motion.

**Budget — full rebuild (Phase 1):** pure `src/services/budget.ts` (+ tests) with an SPA mirror.
Costs now come from per-registrant `registrationCost`, **not** `CampSettings.tentPrice/classroomPrice`
(deprecated, columns left in DB). Null cost = "Cost not recorded" ($0, flagged, never dropped); grand
total reconciles to the sum of line totals; client-side CSV export.

**Check-in & accommodation correctness (Phase 1):** first camp day PM-only / last day AM-only /
1-day camp PM-only (`buildSessions`, AC-1, + tests). A church×gender classroom pool **>50** splits
into `7-9`/`10-12` sub-pools (PC-10, + tests); Tent City headings show student/leader tent totals
(PC-11). Removed "unpaid" from the home DTO/UI (PC-3); FAQ is pre-camp-only (PC-7). All 22 owner bugs
addressed.

**UI + owner refinements (Phase 2):** white header at every width (CQ-011); A6 wide layout
(`.wide-cards`: 1/2/3 col at <980/≥980/≥1280) on the roster + Budget rows + Settings two-col (CQ-012).
Phone/tablet rendering left byte-for-byte unchanged. A live responsive showcase was built in the
working-root `ui-mocks.html`.

**First-aid login UX (Phase 4):** a focused first-aider experience — nav **Search · Records ·
Schedule** (no Medical Watch); "Student Info" screen led by **ministry-leader contacts** (parent is
the bottom fallback), softened medical-alert/consent tone, a quick action-log form. Backend:
category-scoped RBAC `note:write:firstaid` (firstAid+director+admin) / `note:read:firstaid`
(+zoneLeader, +church own-church); routes `GET /notes/firstaid` and `GET /search/contacts/:id`;
first-aid records stored as `StudentNote{category:'firstaid'}` (4-line body) — **no migration**. New
`note.service.test.ts` + extended `access-control.test.ts`. Admin Notes gained a "First-aid" filter.

**Correctness fixes from the reviews (Phases 3 & 5):**
- **C-1 (Critical)** — PC-10 **split allocations now persist**. The 3-part group key
  (`churchId|gender|bracket`) was being truncated to 2 parts on save, so split-pool allocations
  vanished on reload. Fixed with migration **`013_allocation_bracket.sql`** + `RoomAllocation.bracket`
  + parse/rebuild in `accommodation.service.ts` + mapping in `supabase.allocation.ts` + a round-trip
  regression test (**H-1**).
- **H-2 (High)** — the at-camp dashboard reimplemented the "current session" calc (PM at 13:00) and
  disagreed with check-in for the 12:00–13:00 window daily. Now uses the shared `currentSession`
  helper; a 12:30 regression test pins it.
- Emoji sweep completed (two stray full-width `＋` removed); FAQ-edit now re-renders.

**Hardening from the six-hats remediation (Phase 5):**
- **B-2** — `assertSessionSecret()` makes a production deploy **refuse to start** if `SESSION_SECRET`
  is unset/insecure (no-op in dev and when correctly set). Dead `JWT_SECRET` removed.
- **B-1** — a check-in "N syncing… / N didn't save — tap to retry" **banner** (makes the existing
  drop-on-error/tab-close loss visible; full queue durability deferred).
- **B-3** — cross-tab camp-mode sync via `localStorage` + `storage`/`visibilitychange`.
- **B-4** — narrowed cache invalidation (no full clear on import). Visual M-1/M-2/M-3 + dead-token
  cleanup (L-1).
- **R9 (security)** — the public `GET /settings` was leaking `lastTempPasswords` (plaintext rollover
  passwords) to unauthenticated callers; now exposes only `pendingTempPasswordCount`
  (`settings.controller.test.ts` pins it). **R8** marked superseded/moot.

**Year-to-year reusability (Phase 6):** verified a non-technical operator can reuse the app through
the UI alone. Fixed a **live prod defect** — the SPA `ZONES` list still said "Green" after
migration-011 renamed that zone to **Black**, so a director's zone notice to Black was impossible and
a Green notice reached nobody; corrected to `['Yellow','Blue','Black','Red']` and collapsed the
duplicate `ZONE_OPTS` to reference it. **S1** — New Year now guards against a missing baseline
snapshot (actionable modal, nothing purged). Confirmed migration-013's `bracket` column rides on the
per-cohort allocation rows, so it's correctly wiped on rollover (no stale leak).

---

## 3. Material pivots from the original brief (and why)

1. **No git repo / no Node toolchain in the authoring env.** The work was done in a plain folder with
   no `node_modules` and no `git`. *Pivot:* "commit at each phase boundary" became "persist the plan,
   keep the tree clean, leave all commits and the single deploy to the owner." Verification was done
   by reasoning + reading the existing vitest suites + targeted greps + a string/comment/template-aware
   brace-and-backtick scanner, and — from Phase 4 on — `node --check` / `node --experimental-strip-types
   --check` using the **Playwright-bundled Node v24**. **Full `tsc --noEmit` + `vitest` were never run
   in-env; they are the gated pre-flight in `DEPLOY-CHECKLIST.md §0`.** *(Confirmed again in Phase 7:
   toolchain still absent, bundled Node still works, all changed files parse clean.)*

2. **Migrations were already at `012`, not `010`.** The brief's snapshot was stale. The brief expected
   **zero** migrations; the program delivered **exactly one** — `013` — and only because review found a
   real persistence defect (C-1). `011`/`012` shipped with the original 2026-06-22 deployment; **the
   only migration this initiative adds to prod is `013`.** Next free number is now `014`.

3. **One new migration after all (`013`), against the brief's "expected: none."** Justified: C-1 was a
   genuine data-loss bug (split allocations silently dropped). The migration is additive, idempotent
   (`add column if not exists bracket text`), and backward-compatible.

4. **Execution order resequenced.** Budget and accommodation rebuilds were landed right after Phase 2
   (while context was fresh and they were the correctness-critical, testable pieces) rather than
   strictly after Phase 3. Phase 3's perf polish was largely already present; the remainder is additive.

5. **The Critical defect was found by review, not planned.** C-1/H-1 surfaced in Phase 3, were pinned
   to Phase 5, and were fixed there with tests — the review loop did its job. H-2 was likewise a
   review find (Phase 3 re-run) fixed in Phase 5.

6. **Type-scale rationalisation is intentional, not byte-identical.** 33 accreted font sizes collapsed
   to 11 tokens with ≤~0.7px deltas — flagged for on-device eyeballing rather than pixel-diffing.

7. **First-aid spec narrowed by owner feedback.** Medical Watch was dropped entirely; "Casualty Card"
   became "Student Info"; leader contacts moved to the top with parent as fallback. The migration-free
   4-line-body encoding was kept over a dedicated `problem`/`treatment` column pair.

8. **Reusability gaps closed as deliberate fixed constraints, not features.** Zones stay a fixed
   code+enum set (**Z1**) and the timezone stays fixed at Australia/Brisbane (**T1**) — both documented
   as platform constraints rather than admin-managed fields. A draft timezone "clobber fix" was written
   then **reverted** because re-asserting Brisbane on every save is correct and self-healing under that
   invariant.

9. **A live prod defect was caught late (Phase 6) and folded into this same deploy.** The stale `ZONES`
   "Green" entry is not an improvement-initiative regression — it predates the program — but it ships
   with this redeployment because the fix is in `index.html`/`sw.js`.

---

## 4. Naming note for the original repo's history

The original repo's `CHANGELOG.txt` already contains a **"PHASE 6: DEPLOYMENT — GONE LIVE"** section
dated 2026-06-22. That is the **original app's** internal phase numbering and is unrelated to this
**7-phase Improvement Initiative** (Phases 1–7, 2026-06-29/30). When you write the commit message,
call this body of work the *Improvement Initiative* to avoid colliding with that earlier "Phase 6."

---

## 5. Net state at hand-off

**Deploy-ready, pending the gated toolchain run.** The one hard pre-deploy gate (C-1) and the High
session divergence (H-2) are fixed in code with regression tests; the R9 security leak is closed. The
honest remaining blocker is **verification on a real toolchain** (`tsc --noEmit` + `vitest`), not
implementation. See `docs/DEPLOY-CHECKLIST.md` for the single ordered procedure and §"Outstanding
owner decisions" there for the short post-ship tail (B-1 full durability, L-3) — none deploy-blocking.
