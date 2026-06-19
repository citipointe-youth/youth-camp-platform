# Demo Consolidation + Allocation App Alignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all demo HTML into one `youth app demo/` folder (the new Vercel deploy source), delete the stale duplicate, then port the canonical `allocation-platform.html` demo tweaks into the real `youth-allocation-platform` app at the correct layer.

**Architecture:** Three real artifacts today — `Camp Platform/` (camp backend + the deployed `demo-site/`), `youth-allocation-platform/` (youth backend + `public/index.html` SPA + a stale `demo-site/`). After this plan: a sibling `youth app demo/` holds every demo and is deployed via Vercel CLI to the existing `yc-camp-demo` project; both app folders contain only real code; the SPA gains the demo's UI tweaks wired to real Express endpoints.

**Tech Stack:** Static HTML demos (single-file, inline `<script>`), Vercel CLI deploy, TypeScript/Express backend (Zod, vitest), vanilla-JS SPA.

**Reference spec:** `Camp Platform/docs/superpowers/specs/2026-06-10-demo-consolidation-and-allocation-app-alignment-design.md`

**Conventions:**
- All paths are relative to `Project 4 - YOUTH CAMP 2025 Optimisation/` unless noted.
- Windows working tree: every git commit uses `git -c core.autocrlf=true`.
- "Syntax-check a demo" = extract its single `<script>…</script>` to a temp `.js` and run `node --check`.
- The canonical `allocation-platform.html` (in `youth app demo/` after Phase 1) is the **reference implementation** for all Phase 3 ports. Each port task reads the named demo function, then re-expresses its behavior in the SPA's idiom wired to the real API.

---

## File Structure

**Created:**
- `youth app demo/` — all demo HTML + `assets/` + `vercel.json` + `.vercel/` (deploy source).

**Moved (from `Camp Platform/demo-site/` → `youth app demo/`):** `index.html`, `camp-platform.html`, `allocation-platform.html`, `allocation-exec.html`, `allocation-training.html`, `exec-presentation.html`, `suite-briefing.html`, `training.html`, `assets/`.

**Deleted:** `youth-allocation-platform/demo-site/` (stale), `Camp Platform/demo-site/` (after move), `Camp Platform/vercel.json` (after `.vercel` relocates).

**Modified (Phase 3, real SPA):** `youth-allocation-platform/public/index.html`. Possibly `youth-allocation-platform/src/core/enums.ts` (quad helpers) only if a server-side need surfaces.

**Modified (Phase 4, docs):** `youth-allocation-platform/CLAUDE.md`, `Camp Platform/CLAUDE.md`, `Project 4 …/CLAUDE.md`, `~/.claude/.../memory/yc-camp-demo-deployment.md` + `MEMORY.md`.

---

## Phase 1 — Consolidate demos

### Task 1: Create `youth app demo/` and move the canonical demos

**Files:**
- Create: `youth app demo/` (folder)
- Move: all of `Camp Platform/demo-site/*`

- [ ] **Step 1: Create the folder and move files (preserving `assets/`)**

`youth app demo/` is **outside** the `youth-camp-platform` git repo, so `git mv` cannot target it — use an OS move. (The repo records the deletion later, in Phase 2 Task 3.)

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation"
mkdir -p "youth app demo"
mv "Camp Platform/demo-site/"* "youth app demo/"
ls -la "youth app demo"
```

Expected: `youth app demo/` now lists all 8 HTML files + `assets/`; `Camp Platform/demo-site/` is empty.

- [ ] **Step 2: Syntax-check each demo's `<script>` survived the move**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth app demo"
for f in camp-platform.html allocation-platform.html allocation-exec.html allocation-training.html exec-presentation.html suite-briefing.html training.html; do
  node -e "const s=require('fs').readFileSync('$f','utf8');const m=s.match(/<script>([\s\S]*?)<\/script>/);require('fs').writeFileSync('/tmp/_chk.js', m?m[1]:'');" && node --check /tmp/_chk.js && echo "OK: $f";
done
```

Expected: `OK: <file>` for each (or no output for files whose main script is fine; any `SyntaxError` is a real failure to fix before continuing).

- [ ] **Step 3: Delete the stale duplicate demo folder**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation"
rm -rf "youth-allocation-platform/demo-site"
ls -la "youth-allocation-platform"
```

Expected: no `demo-site/` under `youth-allocation-platform/`.

- [ ] **Step 4: Commit the repo-side removal of `demo-site/`**

(Defer the actual commit to Phase 2 Task 3, where it is sequenced with the deploy re-point and the Vercel Git-disconnect. Do NOT commit yet — committing `demo-site` removal before the dashboard disconnect could trigger an empty auto-deploy.)

---

## Phase 2 — Re-point deployment to `youth app demo/`

### Task 2: Make `youth app demo/` the Vercel deploy source

**Files:**
- Move: `Camp Platform/.vercel/` → `youth app demo/.vercel/`
- Create: `youth app demo/vercel.json`
- Delete: `Camp Platform/vercel.json`

- [ ] **Step 1: Relocate the Vercel project link**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation"
mv "Camp Platform/.vercel" "youth app demo/.vercel"
cat "youth app demo/.vercel/project.json"
```

Expected: `project.json` shows `"projectName":"yc-camp-demo"` (link preserved).

- [ ] **Step 2: Add a `vercel.json` that serves this folder statically (no build)**

Create `youth app demo/vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "",
  "installCommand": "",
  "outputDirectory": "."
}
```

- [ ] **Step 3: Remove the now-obsolete `vercel.json` from the Camp Platform repo**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation"
rm -f "Camp Platform/vercel.json"
```

- [ ] **Step 4: Verify the deploy folder serves locally before touching production**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth app demo"
npx --yes serve -l 5055 . >/tmp/serve.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5055/index.html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5055/allocation-platform.html
kill %1 2>/dev/null || true
```

Expected: `200` for both.

### Task 3: STOP — manual Vercel Git-disconnect, then commit + deploy

- [ ] **Step 1: Ask the user to disconnect Git on the `yc-camp-demo` Vercel project**

Print this instruction and WAIT for confirmation before proceeding:

> In the Vercel dashboard → project **yc-camp-demo** → Settings → Git → **Disconnect** the `987tom1/youth-camp-platform` repository. This prevents the now-demo-less repo from auto-deploying an empty site. Reply "done" when finished.

- [ ] **Step 2: Commit the `demo-site/` removal in the Camp Platform repo**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/Camp Platform"
git -c core.autocrlf=true add -A
git -c core.autocrlf=true commit -m "chore: move demo-site out to youth app demo/ (deploy now via CLI)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Expected: commit records deletion of `demo-site/**` and `vercel.json`.

- [ ] **Step 3: Deploy the consolidated demo folder to production**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth app demo"
vercel deploy --prod --yes
```

Expected: build-less deploy succeeds; prints the production URL. If Vercel prompts to re-link, point it at the existing `yc-camp-demo` project (do not create a new one).

- [ ] **Step 4: Verify live with cache-busted curls**

```bash
cb=$(date +%s)
for p in index.html camp-platform.html allocation-platform.html allocation-exec.html allocation-training.html; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://yc-camp-demo.vercel.app/$p?cb=$cb";
done
```

Expected: `200` for every path.

---

## Phase 3 — Align the real youth-allocation-platform SPA

All edits in `youth-allocation-platform/public/index.html` unless a step says otherwise. After each task: `npm run typecheck` (backend types — should stay green) and a manual browser smoke via `npm run dev` (http://localhost:4300). Commit after each task. The real app is **not** a git repo; initialise one first so commits are possible.

### Task 4: Initialise git for the real app + baseline verification

**Files:** `youth-allocation-platform/` (new repo)

- [ ] **Step 1: Init repo and capture a clean baseline**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth-allocation-platform"
git init -q
printf "node_modules\ndata\n.DS_Store\n" > .gitignore
git -c core.autocrlf=true add -A
git -c core.autocrlf=true commit -q -m "chore: baseline before demo alignment"
```

- [ ] **Step 2: Confirm the app builds and tests pass before changes**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth-allocation-platform"
npm install
npm run typecheck && npm run test
```

Expected: typecheck clean; vitest all pass. Record the pass count (regression baseline).

### Task 5: Home — remove old Grade-detail dropdown, add compact hero + attendance tiles

**Reference (canonical demo):** `renderHome`, `attTile`, `svcSessFor`, `homeGradeMini`, `toggleHomeQuad`; removed `toggleHomeGradeBreakdown`. CLAUDE.md patterns: "Home hero card", "Grade logins", "Director/Admin home", "Quad home".
**Target SPA:** `renderHome` (+ helpers). **Data:** `GET /overview`, `GET /trends`.

- [ ] **Step 1: Read both implementations**

Read `youth app demo/allocation-platform.html` functions `renderHome`, `attTile`, `svcSessFor`, `homeGradeMini`, `toggleHomeQuad`. Read SPA `renderHome` and the `GET /overview` + `GET /trends` response shapes (from `src/api/controllers/overview.controller.ts` and `trends.controller.ts`).

- [ ] **Step 2: Port the hero + tiles into the SPA**

Replicate, in `renderHome`:
- Compact 2-row hero table (Youth row + Groups row; Unique + Avg/wk columns) for this term + previous term; row labels `Youth (N)` / `Groups (N)`.
- Remove any old collapsible "Grade detail" dropdown (`toggleHomeGradeBreakdown` equivalent) if present.
- Grade logins: compact 4-column single-row strip (Total / Alloc / Pending / At Risk); no "By Quad" cards.
- Director/Admin: "Attendance by Quad" tiles, each tappable to expand inline into per-grade rows (state `_homeQuadOpen` + `toggleHomeQuad`).
- Quad: equivalent "Attendance by Grade" tile per year in bracket.
- Add helpers `attTile()`, `svcSessFor()`, `homeGradeMini()` adapted to real API data (not demo `_DB`).

- [ ] **Step 3: Verify**

Run `npm run dev`; log in as `grade7f`, `g79`, `director` (password `demo1234`); confirm each home variant renders, tiles expand/collapse, no console errors. Then `npm run typecheck`.

- [ ] **Step 4: Commit**

```bash
git -c core.autocrlf=true add public/index.html
git -c core.autocrlf=true commit -m "feat(spa): align Home hero + attendance tiles with demo"
```

### Task 6: Student detail — leader assignments with inline remove + search-to-assign

**Reference:** `showSD`, `assignSD`, `unassignSD`, `sdLeaderSearch`, `sdEligibleLeaders`. CLAUDE.md: "Student detail modal".
**Target SPA:** `showStudentDetail`. **Data:** `GET /allocations/student/:studentId` (current leaders), `GET /leaders` + scope filter (eligible), `POST /allocations` (assign), `DELETE /allocations/:studentId/:leaderId` (remove).

- [ ] **Step 1: Read** the canonical `showSD`/`assignSD`/`unassignSD`/`sdLeaderSearch`/`sdEligibleLeaders` and the SPA `showStudentDetail`.

- [ ] **Step 2: Implement** a "Leader Assignments" section in `showStudentDetail`: list current leaders (deduped) each with an inline Remove (calls `DELETE /allocations/:sid/:lid`), plus a "Search a leader to assign" box that lists eligible leaders (actor scope ∩ student gender + grade, from `GET /leaders`) and assigns in place via `POST /allocations`, re-rendering both the modal and the page behind it.

- [ ] **Step 3: Verify** as `director`: open a student, remove a leader, search + assign another; confirm the leader list and the Leaders page reflect changes; `npm run typecheck`.

- [ ] **Step 4: Commit** — `feat(spa): student-detail leader assign/unassign with eligible search`.

### Task 7: My Students — condensed rows, birthday format, Fridays + lifegroup dots, filters

**Reference:** `renderLeaderView`, `fmtBday`, `glHist`, `tLvF` (`_lvF` state). CLAUDE.md: "My Students".
**Target SPA:** `renderMyStudents`. **Data:** `GET /students` (+ `hist`), `GET /trends` for **real** lifegroup history (do NOT synthesise as the demo's `glHist` does — see spec judgement call).

- [ ] **Step 1: Read** canonical `renderLeaderView`/`fmtBday`/`glHist` and SPA `renderMyStudents`; confirm what lifegroup data `GET /trends` (or `GET /students`) already returns.

- [ ] **Step 2: Implement** condensed rows (name + yr/gender/bday inline; student + parent number on one line); `fmtBday` → `DD-MM-YYYY`; two dot rows — green Fridays (`s.hist`) and teal lifegroups sourced from the real trends/lifegroup endpoint; Year/Gender filter buttons (`_lvF`) that also narrow the leader dropdown. If the backend exposes no per-student lifegroup history, add a follow-up note rather than synthesising client-side.

- [ ] **Step 3: Verify** as a `leader`/`grade` login: rows condensed, bday formatted, both dot rows show, filters narrow list + dropdown; `npm run typecheck`.

- [ ] **Step 4: Commit** — `feat(spa): condensed My Students rows + real lifegroup dots + filters`.

### Task 8: Allocation picker — background sync on mutate + in-picker de-allocate

**Reference:** `openPicker`, `pickerSyncBg`, `remPick`, `addAllocation`. CLAUDE.md: "Add-Students picker".
**Target SPA:** `openStudentPicker`, `addAllocFromPicker`, `filterPicker`, `pickerRow`. **Data:** `POST /allocations`, `DELETE /allocations/:sid/:lid` (server already refuses duplicates — no client dedup needed).

- [ ] **Step 1: Read** canonical `openPicker`/`pickerSyncBg`/`remPick` and SPA `openStudentPicker`/`addAllocFromPicker`/`pickerRow`.

- [ ] **Step 2: Implement** a sticky picker header with an always-visible ✕ close; assigned rows get a `−` de-allocate (`DELETE`); add/remove both refresh the Leaders page behind (`render()`), equivalent to `pickerSyncBg`. Rely on the server for duplicate rejection; do not port `dedupeAllocations`/`addAllocation` client guards.

- [ ] **Step 3: Verify** as `quad`: open picker, add a student then remove it via `−`, confirm Leaders page behind updates live; `npm run typecheck`.

- [ ] **Step 4: Commit** — `feat(spa): picker background sync + in-picker de-allocate`.

### Task 9: Quad editable parity + helpers; redirect legacy quad views

**Reference:** editable-roles flag `ce` includes `quad`; `quadGender`, `quadGrades`; `renderAllocate`/`renderMyQuad`/`renderQuadView` redirect to `go('leaders')`. CLAUDE.md: "Leaders & Allocation".
**Target SPA:** `renderLeaders`, `renderAllocate`, `renderMyQuad`, `renderQuadView`. **Optional backend:** `src/core/enums.ts` if `quadGender`/`quadGrades` are needed server-side (only if a real endpoint requires them — otherwise SPA-only).

- [ ] **Step 1: Read** canonical handling of `ce`/`quadGender`/`quadGrades` and the three redirect functions; read SPA `renderLeaders` and whether quad currently has add/edit/allocate powers.

- [ ] **Step 2: Implement** quad add/edit/allocate scoped to the quad's gender + bracket (new leaders auto-set to quad gender; year focus limited to bracket); remove any view-only banner; make `renderAllocate`/`renderMyQuad`/`renderQuadView` redirect to `go('leaders')`. Add SPA helpers `quadGender(q)`/`quadGrades(q)`. Confirm the **server** authorizes quad writes (check `src/services/access-control.ts`); if it does not, that is a backend change — add scoped quad permissions there and a vitest test.

- [ ] **Step 3: Verify** as `g79` (quad): can add a leader, allocate a same-gender in-bracket student, edit/remove; cannot touch other gender/bracket; `npm run typecheck && npm run test`.

- [ ] **Step 4: Commit** — `feat: quad editable parity scoped to gender+bracket`.

### Task 10: Trends + At Risk parity sweep

**Reference:** Trends "three-number stat card" (`statCard`, `grpBar`, `avgAtt`, `twoNum`), Fridays/Lifegroups drill-downs, scroll preservation (`_trQuadOpen`/`_trGradeOpen`); At Risk seeded prev-term data. CLAUDE.md: "Trends page", "Trends Fridays/Lifegroups drill-down", "At Risk".
**Target SPA:** `renderTrends`, `renderAtRisk` (SPA already has `statCard`, `avgAtt`, `colChart`).

- [ ] **Step 1: Read** canonical Trends drill-down + `grpBar` and SPA `renderTrends`/`renderAtRisk`; diff what is missing (grpBar breadth bar, 3-col cards on every section, expand/collapse state, scroll preservation, At-Risk prev-term line for declining 50–75%).

- [ ] **Step 2: Implement** only the gaps found: add `grpBar(uniq, enrolled)`; ensure every Fridays chart and Lifegroups section is followed by the 3-column `statCard`; add `_trQuadOpen`/`_trGradeOpen` expand state and scroll-preservation (save `.pg.scrollTop` before `setApp()`, restore via `requestAnimationFrame`); show the prev-term line + trend arrow for declining students in `renderAtRisk`.

- [ ] **Step 3: Verify** as `director`: Trends expand/collapse keeps scroll position, stat cards + breadth bars present; At Risk shows prev-term line for a declining student; `npm run typecheck`.

- [ ] **Step 4: Commit** — `feat(spa): trends drill-down/breadth-bar + at-risk prev-term parity`.

### Task 11: Phone-mode / viewport responsiveness

**Reference:** `onViewportChange`, `syncToggle`; CLAUDE.md "Phone mode" (header padding-top 50px, `.pg` overflow-x hidden, `.alc` overflow hidden).
**Target SPA:** CSS in `<style>` + any viewport listener.

- [ ] **Step 1: Read** canonical `onViewportChange`/`syncToggle` + the phone-mode CSS rules.

- [ ] **Step 2: Implement** the equivalent responsive CSS/listeners in the SPA so the header clears the Dynamic Island and the allocate view does not overflow horizontally.

- [ ] **Step 3: Verify** in a narrow viewport (DevTools iPhone): no horizontal overflow on Home/Leaders; `npm run typecheck`.

- [ ] **Step 4: Commit** — `fix(spa): phone-mode header + overflow parity`.

### Task 12: Full SPA regression pass

- [ ] **Step 1: Run the full suite**

```bash
cd "Project 4 - YOUTH CAMP 2025 Optimisation/youth-allocation-platform"
npm run typecheck && npm run test
```

Expected: typecheck clean; test count ≥ the Task 4 baseline (any new quad-RBAC test included).

- [ ] **Step 2: Manual smoke each role** (`admin`, `director`, `g79`, `grade7f`, a `leader`) across Home, Leaders & Alloc, Student detail, My Students, Trends, At Risk — no console errors, behavior matches the canonical demo.

- [ ] **Step 3: Commit** any fixes — `test: SPA alignment regression pass`.

---

## Phase 4 — Documentation

### Task 13: Update all CLAUDE.md + memory to the new layout

**Files:** `youth-allocation-platform/CLAUDE.md`, `Camp Platform/CLAUDE.md`, `Project 4 …/CLAUDE.md`, `~/.claude/projects/C--Users-thoma/memory/yc-camp-demo-deployment.md` + `MEMORY.md`.

- [ ] **Step 1: `youth-allocation-platform/CLAUDE.md`** — change the "Canonical demo location" banner and "Frontend files" table to `youth app demo/allocation-platform.html`; remove references to the deleted local `demo-site/`.

- [ ] **Step 2: `Camp Platform/CLAUDE.md`** — update "Frontend files" + the `demo-site/` deploy note: demos now live in `youth app demo/`, deployed via `vercel deploy --prod` (CLI), Git auto-deploy disconnected.

- [ ] **Step 3: `Project 4 …/CLAUDE.md`** — update the live-demo, canonical-file, and edit→ship sections: canonical demos are in `youth app demo/`; deploy is CLI from that folder; `git push` no longer deploys.

- [ ] **Step 4: Memory** — update `yc-camp-demo-deployment.md` (CLI deploy from `youth app demo/`, Git disconnected) and adjust its `MEMORY.md` pointer hook if needed.

- [ ] **Step 5: Commit docs** in the Camp Platform repo (`git -c core.autocrlf=true commit -m "docs: point to youth app demo/ + CLI deploy"`) and the youth-allocation-platform repo separately.

---

## Self-Review notes

- **Spec coverage:** Phase 1 (consolidate) ✓ Task 1; Phase 2 (re-point deploy + manual disconnect) ✓ Tasks 2–3; Phase 3 (per-layer alignment of the 19-function delta) ✓ Tasks 4–12; Phase 4 (docs) ✓ Task 13. Every spec phase maps to a task.
- **glHist judgement call** (spec risk) is encoded in Task 7 Step 2 (use real data, don't synthesise).
- **Git-disconnect ordering** (spec risk) is enforced by Task 3 Step 1 preceding Step 2's commit.
- **Server-side dedup** decision (skip client `addAllocation`/`dedupeAllocations`) is explicit in Task 8.
- **Ports reference named demo functions**, not inlined guessed code, because the SPA is a parallel implementation — the canonical demo file is the authoritative source each port reads first.
```
