# PHASE 4 — First-aid login (design draft)

> **Status: DESIGN DRAFT ONLY — not implemented.** Authored during Phase 2 (2026-06-29) at the
> owner's request. This document captures the agreed UI/behaviour for the first-aid experience so it
> can be built in a dedicated later phase. **No backend or SPA feature code for this has been written
> yet**; the live app's first-aid screens are unchanged. The visual mock lives in the working-root
> `ui-mocks.html` under the "PHASE 4 — First-aid login (design draft)" section (four labelled phone
> frames).

---

## 1. Why / what the owner asked for

Today the `firstAid` role is **read-only** (`camper:read`, `camper:read:sensitive`, attendance only)
with a home screen showing a "Medical Watch" list and a secondary search. The owner wants first-aid
staff to be **active record-keepers** at camp:

1. **Log first-aid incidents on a student** — a short structured record of *what the problem was* and
   *what treatment was given*.
2. Those records **roll into the existing Testimonies & Student Notes screen** for admin and
   zoneLeader logins, as a **new "First-aid" option in the Record filter** (alongside Testimony /
   Student note / Signed out).
3. **First-aid home becomes camper search** (finding a student is the primary job).
4. **Nav item 2 becomes "First-aid records"** — a history of records this first-aider has logged.

---

## 2. Scope & non-goals

**In scope (Phase 4):** the four screens below + the backend to persist/read first-aid records +
RBAC + tests. **Out of scope:** clinical workflows, medication administration tracking beyond a free
-text treatment field, parent notification, exports beyond the existing notes CSV (the record simply
appears in it).

---

## 3. Data model — reuses `StudentNote`, **no migration needed**

`StudentNote` (`src/core/entities/note.ts`) already has a **free-form `category`** field
(`'note' | 'testimony' | …`, documented "free-form for forward compatibility") and a `body`, plus
`camperId`, `authorId`, `authorName`, `sessionId`, `createdAt`. A first-aid record is therefore just:

```
category: 'firstaid'
camperId: <the student>      // required (a first-aid record is always about a camper)
body:     "Problem: <…>\nTreatment: <…>"
authorId/authorName:         // the logged-in first-aider (server-attributed)
createdAt:                   // server timestamp
```

- **Decision to confirm at build time:** store problem/treatment as **two lines in `body`** (simplest,
  matches how the leader name is already folded into testimony/note bodies and needs **zero schema
  change / zero migration**), **or** add optional `problem?: string` / `treatment?: string` columns
  (cleaner querying; needs migration `013` + repo updates in lockstep). The draft UI assumes the
  **two-line body** approach to stay migration-free, consistent with Phase 1's "no migration" posture.
- The existing `/notes` POST and `/notes/recent` / `/notes/export` endpoints already carry `category`
  through, so surfacing in the admin Notes screen is a filter + badge addition, not new plumbing.

---

## 4. RBAC changes (Phase 4)

- Add a **`note:write:firstaid`** capability (or reuse `note:write` scoped to category `firstaid`) so
  `firstAid` can POST a first-aid note **without** gaining general note-writing. Decide in build:
  cleanest is a dedicated permission asserted in `PersonService`/notes service when `category==='firstaid'`.
- `firstAid` gains **read of their own first-aid records** for the history screen
  (`/notes/recent?category=firstaid&mine=1`, or a dedicated `/firstaid/records` view).
- admin/director/zoneLeader can **read** first-aid records in the Notes screen (zoneLeader scoped to
  their zone, mirroring existing note scoping).
- First-aid records are **sensitive** — they reference a medical event. They must respect the same
  `canAccessPerson` / zone scoping that notes already enforce. **Confirm with the owner** whether
  church logins should ever see first-aid records (draft assumes **no** — admin/director/zoneLeader only,
  matching who sees the Notes screen today).

---

## 5. Screens (see `ui-mocks.html` for the visual draft)

### 5.1 First-aid home = camper search  (nav item 1)
- `navModel('firstAid', …)` changes the **first tab to Search** (icon `search`), and the home route
  renders the search box as the landing screen (today `renderHomeFirstAid` shows Medical Watch).
- Medical Watch does **not** disappear — it moves to a card/section reachable from search, or stays as
  a "flagged campers" shortcut under the search box (build-time choice; draft shows search-first with
  results inline).
- Tapping a result opens the **casualty card** (existing `openCasualtyCard`).

### 5.2 First-aid records history  (nav item 2)
- New nav item **"First-aid records"** (icon `medical`) → a list of records **this first-aider logged**,
  newest first, with simple day / camper filters.
- Each row: camper name (+ grade), time, **Problem** line, **Treatment** line, a "First-aid" pill.
- Reuses the notes list rendering pattern; data from `/notes` filtered to `category==='firstaid'` and
  the current author.

### 5.3 Casualty card → "Add first-aid record"
- The existing casualty card (`openCasualtyCard`) gains an **"Add first-aid record"** card with two
  textareas — **"What was the problem?"** and **"What treatment was given?"** — and a Save button.
- Time + first-aider name are attached automatically (server-side, like notes today).
- On save: POST a `category:'firstaid'` note with `camperId` set; toast confirm; the new record then
  appears in this student's history and in the admin Notes screen.

### 5.4 Admin / zoneLeader Notes screen — new "First-aid" filter
- `RENDER.notes` **Record** filter (`#ntCat`) gains a **`firstaid`** option labelled "First-aid"
  (placed between "Student note" and "Signed out").
- `drawNotes` gains a **badge** for it (e.g. a pink `pill` with the `medical` icon) and renders the
  Problem/Treatment body. The synthesise/merge step already supports multiple record kinds (it merged
  "Signed out" from attendance in Phase 1), so this is the same pattern: include `firstaid` notes in
  `window._notesAll` and let the existing filter/badge logic handle them.
- The existing **notes CSV export** picks them up automatically (they're notes with a category column).

---

## 6. Build checklist (for whoever picks up Phase 4)

- [ ] Decide body-encoding vs. dedicated columns (§3). If columns → migration `013` + supabase repo + entity in lockstep.
- [ ] RBAC: `firstAid` can write `category:'firstaid'` notes only; read own records; admin/director/zoneLeader read (zone-scoped) (§4).
- [ ] `navModel('firstAid')`: tab 1 = Search (home), tab 2 = First-aid records, tab 3 = Schedule. Update `buildTabs`/`navSidebar`/`TAB_OF` (single source — D3).
- [ ] Home route renders search; preserve a path to Medical Watch.
- [ ] Casualty card: add the problem/treatment form + submit.
- [ ] First-aid records history screen + its data load.
- [ ] `RENDER.notes`/`drawNotes`: `firstaid` filter option + badge + body rendering; confirm CSV export includes them.
- [ ] Tests: note creation with `category:'firstaid'`; RBAC (firstAid can write firstaid-notes, cannot write general notes; church cannot read); Notes filter includes/excludes correctly; zone scoping.
- [ ] Update `CLAUDE.md` (first-aid role capabilities + navModel), `debug.md`, `CHANGELOG.txt`.
- [ ] No emoji (C1), token discipline (C3), focus rings/44px targets (E), white header (Phase 2) — match the established system.

---

## 7. Open questions for the owner (resolve before building)

1. Can **church logins** ever see first-aid records, or admin/director/zoneLeader only? (Draft: leaders only.)
2. Should a first-aid record optionally flag **"follow-up needed"** / **"parent informed"** as checkboxes,
   or keep it to just problem + treatment for v1? (Draft: problem + treatment only.)
3. Should Medical Watch stay as a shortcut on the first-aid home (under search), or move entirely behind search?
