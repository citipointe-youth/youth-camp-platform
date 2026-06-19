# Camp SPA → Demo Alignment Implementation Plan

> **For the implementer (you):** execute task-by-task. Each task names the **exact demo function(s) to read** and the **exact SPA anchor** — read only those, never whole files. Steps use `- [ ]` for tracking.

**Goal:** Bring `Camp Platform/public/index.html` to behavioural parity with `youth app demo/camp-platform.html`, reusing the existing Express backend.

**Architecture:** SPA = one inline `<script>`: `api()` → `RENDER[id]` screens → `go()/gotoTab()/paint()` router → `buildTabs()` → `CAMP_MODE`. A port adds/replaces a `RENDER.<id>` (+ helpers), wires it to a real endpoint, and surfaces it (home card via `go('<id>')` or a tab). No build; verify with `node --check`.

**Reference spec:** `docs/superpowers/specs/2026-06-10-camp-spa-alignment-design.md`

---

## ⚡ Token-lean execution rules (read once, apply every task)

1. **Read only what a task names.** Open the demo function at its line number and the SPA anchor region — nothing else. Do **not** read either file end-to-end.
2. **Reuse the endpoint cheat-sheet below** — never grep the backend to rediscover a route.
3. **The demo is the source of truth.** Port its behaviour; adapt names/CSS to the SPA. Map demo MockAPI fields to real API fields (the two known mismatches are flagged in their tasks).
4. **Verify with `node --check`, not by re-reading.** After editing, extract the `<script>` and check it; don't re-open the file to "confirm".
5. **Backend is complete — don't touch `src/`** unless a task's *conditional* backend note says to (only gaps #5/#7 note-category and #1 fee-tier may need it; default is approximate/frontend-only).
6. **Commit per task** (`git -c core.autocrlf=true`, from `Camp Platform/`). One feature area = one commit.
7. **Don't re-seed/redesign.** Surface new screens through the existing `RENDER` map + `buildTabs()` + home cards.

## Camp demo → SPA anchor map

| Demo (`camp-platform.html`) | SPA action (`public/index.html`) |
|---|---|
| `api()` / MockAPI | already real: `api(path,opt)` @220 |
| `RENDER.x` / `go` / `gotoTab` / `paint` | same pattern @282–289 (register `RENDER.x`) |
| `buildTabs` @700, `TAB_OF` @669 | `buildTabs` @296 (add tabs per role×mode) |
| `switchMode` @ (demo) / `switchDay` @664 | `switchMode` @888 (exists); **add** `switchDay` |
| `RENDER.home` @721 / `renderHomeAtCamp` @771 | `RENDER.home` @317 / `renderHomeAtCamp` @362 |
| `RENDER.budget` @1052, `drawBudget` @1063, `budgetAmount` @1062 | **new** `RENDER.budget` |
| `RENDER.accom` @1083, `drawAccom` @1111, `tentDist` @1110, `addAlloc`/`removeAlloc` @1096/1105, `accomChurches` @1090 | **new** `RENDER.accom` (SPA already has block CRUD: `addBlock`/`saveBlock`/`delBlock`) |
| `RENDER.notifs` @1036, `noticeCard` @807, `dismissNotice` @822, `deleteNotice` @1049 | **new** `RENDER.notifs` + notice helpers (SPA has `sendNotif`) |
| `RENDER.people` @834, `drawPeople` @872, `accDisplay` @881 | `RENDER.people`/`drawPeople` exist @390+ — align |
| `RENDER.testimonies` @1408, `submitTestimony` @1414 | **new** `RENDER.testimonies` |
| `RENDER.myyouth` @1258 | align at-camp My Youth (SPA `renderPeople`/people) |
| `RENDER.notes` @1416, `drawNotes` @1428 | **new** `RENDER.notes` list (SPA has `exportNotes`/`notePrompt`) |

## Endpoint cheat-sheet (all exist; auth via Bearer token in `api()`)

```
GET  /home                         GET  /settings           PATCH /settings           POST /admin/mode
GET  /registrants[ ?churchId ]     GET  /registrants/breakdown
GET  /accommodation/blocks         POST /accommodation/blocks   PATCH/DELETE .../:id
GET  /accommodation/held/:churchId POST /accommodation/reservations
GET  /campers                      GET  /campers/:id        PATCH /campers/:id
GET  /checkin/sessions[/current]   POST /checkin            POST /attendance/sign-out|sign-in
GET  /notes/recent                 GET  /notes/export       POST /notes               GET /notes/camper/:id
GET  /notifications[/latest]       POST /notifications      DELETE /notifications/:id
GET  /schedule  POST/PATCH/DELETE   GET /faq …   GET /devotional/:day  POST /devotional
GET  /accounts/users|churches  (+ POST/PATCH/DELETE)
```

---

## Phase 0 — Baseline

### Task 0: Confirm clean baseline
- [ ] From `Camp Platform/`: `git status -s` (clean), `npx tsc --noEmit && npm run test` (green), `npm run dev` → load http://localhost:4200, log in `admin@campplatform.org` / `demo1234`, confirm the app renders. Note the test count.
- [ ] One grep to resolve the two conditionals up front: `grep -nE "category|cat\b|kind" src/core/entities/note.ts` and `grep -n "feeTier" src/core/entities/registrant.ts`. Record whether `StudentNote.category` and `Registrant.feeTier` exist — Tasks 5/7 and 1 branch on this.

---

## Phase 1 — Pre-camp gaps

### Task 1: Budget & costings (director/admin)
**Read:** demo `RENDER.budget` 1052–1062, `budgetAmount` 1062, `drawBudget` 1063–1082. SPA: `RENDER.home` pre-camp card area @317–361, `buildTabs` @296.
**Endpoint:** `GET /registrants`, `GET /settings` (tent/classroom prices live in settings).
- [ ] Add `RENDER.budget` + `budgetAmount`/`drawBudget` helpers, computing per-registrant fee from `accommodationKind` × camp price, summed, with a per-ministry dropdown. **If `Registrant.feeTier` exists** (Task 0), honour half/sponsored tiers; **else approximate** by accommodationKind only.
- [ ] Surface as a **director/admin home card** in pre-camp `RENDER.home`: `<div ... onclick="go('budget')">Budget & costings</div>`.
- [ ] Verify: `node --check`; `npm run dev` → director → Budget shows totals + per-ministry.
- [ ] Commit `feat(camp-spa): budget & costings screen`.

### Task 2: Accommodation allocation UI  *(largest task — consider sub-commits)*
**Read:** demo `RENDER.accom` 1083–1095, `accomChurches` 1090, `addAlloc` 1096–1104, `removeAlloc` 1105–1109, `tentDist` 1110, `drawAccom` 1111–1144. SPA: existing block helpers `addBlock`/`saveBlock`/`delBlock` (grep to them), admin accommodation area.
**Endpoint:** `GET /registrants`, `GET/POST /accommodation/blocks`, `POST /accommodation/reservations`.
- [ ] Add `RENDER.accom` for director/admin: classroom rooms (reuse the block list) → allocate eligible ministries (≥75% in classroom) by gender with **partial placement** (fill to capacity, remainder stays; multiple ministries per room; un-allocate cascades then returns remainder) via `addAlloc`/`removeAlloc`.
- [ ] Add **Tent City — Male/Female** auto-distribution into 7-person tents (leaders separate from students) via `tentDist`.
- [ ] Surface as a **director/admin home card** (`go('accom')`).
- [ ] Verify: `node --check`; director → Accommodation allocations: allocate a ministry, partial-fill, un-allocate, see Tent City.
- [ ] Commit `feat(camp-spa): accommodation allocation + tent city`.

### Task 3: Pre-camp My Youth + by-ministry parity
**Read:** demo `RENDER.people` 834–871, `drawPeople` 872–880, `accDisplay` 881–920. SPA: `RENDER.people` @390, `drawPeople`, `personRow`, `filterMyYouth`, `scopeRegs`.
**Endpoint:** `GET /registrants`, `GET /registrants/breakdown`.
- [ ] Align the SPA people screen: church/gender/grade filters; **Student split + Leader split**; accommodation shown as Tent/Classroom (hide named locations from church/zone leaders via `accDisplay`); a **By-ministry** table (per-ministry M/F students + M/F leaders + total; zone leaders see own zone, director/admin all). All registrants assumed paid.
- [ ] Verify: `node --check`; church + director → filters, splits, by-ministry render.
- [ ] Commit `feat(camp-spa): pre-camp My Youth splits + by-ministry`.

### Task 4: Notices (full)
**Read:** demo `RENDER.notifs` 1036–1048, `noticeCard` 807–821, `dismissNotice` 822–833, `deleteNotice` 1049. SPA: `sendNotif` (grep).
**Endpoint:** `GET /notifications`, `GET /notifications/latest`, `POST /notifications`, `DELETE /notifications/:id`.
- [ ] Add `RENDER.notifs` (own tab) + `noticeCard`/`dismissNotice`: list notices, zone-leader/director **delete**, **scheduled-for-later**, **dismiss**. Notices are mode-scoped; pre-camp never expire, at-camp expire after 3h.
- [ ] Add **latest-3 notices** to both home screens (`GET /notifications/latest`).
- [ ] Verify: `node --check`; zoneLeader → send + delete; home shows latest 3.
- [ ] Commit `feat(camp-spa): notices tab + home latest-3 + dismiss/delete`.

---

## Phase 2 — At-camp gaps

### Task 5: Testimonies (Day 2+) + first-day gating
**Read:** demo `RENDER.testimonies` 1408–1413, `submitTestimony` 1414–1415, `switchDay` 664. SPA: `RENDER.firstday`/`fd*`, `renderHomeAtCamp` @362.
**Endpoint:** `POST /notes` (the demo sends `{cat:'testimony', body, authorName}`).
- [ ] **Backend-conditional:** if Task 0 showed `StudentNote.category` exists, just POST it; **if not**, add an optional `category` to the entity + create-schema + note.service (small) and `npx tsc --noEmit && npm run test`.
- [ ] Add `RENDER.testimonies` + `submitTestimony`. Gate by `SETTINGS.campDay`: Day 1 → First Day Sign In, Day 2+ → Submit Testimonies (mirror demo `switchDay`).
- [ ] Verify: `node --check`; set Day 2 → submit a testimony → appears in records (Task 7).
- [ ] Commit `feat(camp-spa): testimonies + day-2 gating`.

### Task 6: At-camp My Youth (signed-out / late arrivals / filters)
**Read:** demo `RENDER.myyouth` 1258–1370. SPA: at-camp people/`renderPeople`, `signOut*`/`signIn*`.
**Endpoint:** `GET /campers`, `POST /attendance/sign-out|sign-in`.
- [ ] Align at-camp My Youth: tabs **At camp / Signed out / Late arrivals**; gender/grade/zone filters; sign-out/in actions wired to attendance endpoints.
- [ ] Verify: `node --check`; zoneLeader at-camp → filter, sign a camper out/in.
- [ ] Commit `feat(camp-spa): at-camp My Youth signed-out/late + filters`.

### Task 7: Notes / records list (filters + CSV Category + auto-notes)
**Read:** demo `RENDER.notes` 1416–1427, `drawNotes` 1428–1452. SPA: `exportNotes`, `notePrompt`, `reviewNote`.
**Endpoint:** `GET /notes/recent`, `GET /notes/export`.
- [ ] Add `RENDER.notes` (zone leader/director/admin): all zones; filters **Record** (testimony / sign-out·in / student note) + **Ministry** + **Zone**; show grade/gender for notes & records; CSV export adds a **Category** column.
- [ ] Ensure sign-out / late-arrival / sign-back-in **auto-create a categorised record note** (mirror demo). Backend-conditional same as Task 5 (needs `category`).
- [ ] Verify: `node --check`; director → filter records, export CSV has Category.
- [ ] Commit `feat(camp-spa): notes/records list + categories + CSV`.

### Task 8: Your Accommodation church tile (at-camp)
**Read:** demo `renderHomeAtCamp` 771–806 (the church accommodation tile). SPA: `renderHomeAtCamp` @362.
**Endpoint:** `GET /accommodation/held/:churchId`.
- [ ] For church accounts at-camp, add a "Your Accommodation" home tile from the allocation.
- [ ] Verify: `node --check`; church at-camp → tile shows their rooms.
- [ ] Commit `feat(camp-spa): church Your-Accommodation tile`.

---

## Phase 3 — Cross-cutting parity

### Task 9: Home parity (both modes)
**Read:** demo `RENDER.home` 721–770, `renderHomeAtCamp` 771–806. SPA: `RENDER.home` @317, `renderHomeAtCamp` @362.
**Endpoint:** `GET /home`, `GET /notifications/latest`.
- [ ] Align both home screens: stat band (campers/leaders/blue cards), director-only **Budget** + **Accommodation** cards (Tasks 1–2), by-ministry summary, church tent/classroom rego counts + registration code, latest-3 notices (Task 4).
- [ ] Verify: `node --check`; each role × mode home matches the demo's layout/intent.
- [ ] Commit `feat(camp-spa): home parity (stat band, role cards, latest-3)`.

### Task 10: Tab × role × mode matrix + mode/day badges
**Read:** demo `buildTabs` 700–720, `TAB_OF` 669, `switchDay` 664; SPA `buildTabs` @296, `switchMode` @888, mode badge @259.
**Endpoint:** `POST /admin/mode`, `PATCH /settings` (campDay).
- [ ] Make `buildTabs()` produce the demo's per-role, per-mode tab sets; add the **Day 1 / Day 2** badge (`switchDay`, `SETTINGS.campDay`) in at-camp; confirm the mode badge (PRE-CAMP amber / AT CAMP green) matches.
- [ ] Verify: `node --check`; switch mode + day as admin; tabs change per role.
- [ ] Commit `feat(camp-spa): tab matrix + mode/day badges`.

---

## Phase 4 — Verify & docs

### Task 11: Full regression
- [ ] If any backend change (Tasks 5/7/1): `npx tsc --noEmit && npm run test` ≥ baseline.
- [ ] `node --check` the SPA `<script>`.
- [ ] Manual smoke each **role × mode**: church / zoneLeader / director / admin × pre-camp / at-camp — every ported screen renders, no console errors.
- [ ] Commit any fixes.

### Task 12: Docs
- [ ] `Camp Platform/CLAUDE.md`: flip the "older fetch-based SPA that has drifted" note → "aligned to the demo (date)"; add a **camp demo↔SPA function map** like the allocation app's.
- [ ] Root `Project 4/CLAUDE.md`: update the gotcha that says the camp SPA hasn't been aligned.
- [ ] `youth app demo/CLAUDE.md`: change "The camp SPA has drifted and is not yet aligned" in the alignment rule.
- [ ] Commit `docs: camp SPA aligned to demo + function map`.

---

## Self-review notes
- **Spec coverage:** all 10 gap-inventory rows map to Tasks 1–10; verification Task 11; docs Task 12. ✔
- **Token-lean:** every task carries explicit read anchors + the endpoint cheat-sheet; no whole-file reads required.
- **Backend conditionals** (note `category`, registrant `feeTier`) are resolved once in Task 0 and branched in Tasks 1/5/7 — no rediscovery.
- **Biggest risk** isolated to Task 2 (accommodation allocation) with a "sub-commit" hint.
- **Phasing:** stop-points after Phase 1 (pre-camp usable), Phase 2 (at-camp usable), Phase 3 (full parity).
