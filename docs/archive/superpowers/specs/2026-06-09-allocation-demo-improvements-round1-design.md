# Allocation demo — improvements round 1

**Date:** 2026-06-09
**Status:** Approved (design)
**File:** `demo-site/allocation-platform.html` (single-file demo; no build)

13 improvements grouped into 5 batches. Roles in this app: `admin`, `director`,
`quad` (g79/b79/g1012/b1012), `grade` (year + optional gender). Resolved forks:
quads get **full allocation within their gender+bracket scope**; the grade gender
qualifier is **optional (All / Girls / Boys, default All)**; clicking a quad
attendance tile **expands inline** to per-grade rows.

## Batch A — Access & data model (items 1, 2, 4)

1. **scopeL gender (item 1).** `scopeL` quad branch filters leaders by grade
   bracket only; add a gender filter (`g79`/`g1012` → female, `b79`/`b1012` →
   male). Grade branch already gender-filters when the account has a gender;
   tighten so a gendered grade account never sees other-gender leaders.
2. **Quad full powers (item 2).** Add `quad` to the editable set (`ce`) so quads
   can add leaders, allocate/de-allocate students, and edit/remove leaders — all
   limited to their gender+bracket via existing scoping. Remove the quad
   "view-only" banner. Quad add-leader force-sets gender from the quad and
   restricts the year checkboxes to the quad's bracket (7–9 or 10–12).
3. **Grade gender qualifier (item 4).** Add a Gender select (All / Girls / Boys,
   default All = empty) to the Admin add/edit-account form, shown when role =
   Grade. Persist `gender` on the user (`subAU`/`subEU`). `sugE` appends `f`/`m`
   to the suggested email when a gender is chosen. Existing seed grade accounts
   keep their gender. "All" preserves today's see-everyone behaviour.

## Batch B — Home page (items 6, 7, 8)

6. **Remove "Grade detail" dropdown (item 6).** Delete the collapsible grade-
   breakdown block from the hero (lines ~962–1022) plus `toggleHomeGradeBreakdown`
   and `_hgbOpen`.
7. **Quad "Attendance by Grade" tiles (item 7).** Quads get per-grade tiles for
   their bracket in the same card style as the director "Attendance by Quad"
   cards (Youth/Groups · Unique/Avg).
8. **Click quad tile → per-grade split (item 8).** Director/admin "Attendance by
   Quad" tiles become tappable, expanding inline to per-grade rows (chevron, tap
   to collapse). New module state `_homeQuadOpen` + toggle that re-renders home.

## Batch C — My Students (`renderLeaderView`) (items 3, 9, 10, 11)

3'. **Lifegroup dots (item 3).** Add a second circle-dot row for lifegroup
   attendance mirroring the Fridays dots. No per-session lifegroup data exists, so
   synthesize a deterministic per-student lifegroup history at render time
   (helper `glHist(s)` seeded by `s.id`, length `gT`, hit-count ≈ `gA`). No
   stored-data migration.
9. **Gender + grade filter buttons (item 9).** Add filter buttons above the
   "I am…" leader dropdown that narrow which leaders populate it (director:
   gender + all grades; quad: grades within bracket). New filter state `_lvF`.
10. **Condense rows (item 10).** Put Yr · gender · bday on the **same line as the
    name**; put student mobile and parent number **on one line** together.
11. **Birthday format (item 11).** Render bday as `DD-MM-YYYY` via a `fmtBday`
    helper (source format is `YYYY-MM-DD`).

## Batch D — Allocate "Add Students" picker (item 5)

5. **Picker close + de-allocate (item 5).** Add a sticky modal header with the
   title and an always-visible **✕ close**; make the list body scroll within the
   modal so controls can't be pushed off-screen. Each "Already assigned" row gets
   a **− remove** button that de-allocates and refreshes the picker in place
   (reuse the allocation-removal path; keep `done` set in sync).

## Batch E — Trends (items 12, 13)

12. **Lifegroup grade subheading (item 12).** Move "Grade X Lifegroups" out of the
    card to a subheading **above** the box (like "Overview"), at ~2× current
    subheading size (new `.sh2` class). Apply the same larger size to the
    equivalent Fridays-page grade/section subheadings.
13. **Distinguish expanded sub-lifegroups (item 13).** When a grade is expanded to
    its individual lifegroups, render those rows indented, slightly smaller, and
    on a shaded background so they read as nested.

## Verification

Implement batch by batch. Verify each batch in real headless Chrome (system
Chrome via DevTools Protocol, the harness already used for the white-screen fix):
log in per affected role (admin / director / quad / grade — password `demo1234`),
screenshot the affected screen, and assert behaviour (e.g. quad sees only same-
gender leaders; picker close/remove present; bday format) before deploying.
`node --check`/`vm.Script` the inline script after edits. Deploy via
`git push origin master` (auto-deploys to yc-camp-demo.vercel.app) and confirm live.

## Out of scope

- "Student Search" (`renderStudents`) — distinct from "My Students"
  (`renderLeaderView`); left unchanged.
- The camp demo and the live SvelteKit allocation app — unrelated.
