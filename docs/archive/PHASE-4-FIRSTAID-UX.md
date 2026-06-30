# PHASE 4 — First-Aid Login UX Review

> **Phase 4 of the 7-phase improvement program.** A focused executive UX review of the **First-Aid
> login experience**: make it genuinely effective for a first-aider *on shift*, and strip away
> everything that is noise to them. This document is the review (personas → current-state audit →
> proposed screens/fields → rationale → RBAC → open questions). The visual mockups live in the
> working root as `ui-mocks-firstaid.html`.
>
> **Status when written: REVIEW + MOCKUPS for owner approval. No feature code changed yet.** It
> supersedes the earlier Phase-2 stub `docs/PHASE-4-FIRST-AID-DESIGN.md` (which is now the historical
> "draft"; this is the executive review that drives the build).

> ### Revision 2 (2026-06-29) — owner feedback incorporated
> The owner reviewed Rev 1 and refined the scope. **The job is narrower and more focused:**
> *a first-aider finds a student's details and makes quick logs of actions — that's it.*
> Changes from Rev 1, applied throughout this doc and the mockups:
> 1. **Medical Watch is dropped entirely** (no Watch tab, no watch shortcut on home), and the
>    "shift handover" framing is dropped — Records is simply the first-aider's log of actions.
> 2. **"Casualty Card" is renamed "Student Info"** everywhere.
> 3. **Legibility** — the light-grey secondary text is darkened (use `--ink-2`, not `--muted`, for
>    body-level secondary text on these screens).
> 4. **Tone softened** — the medical-alert and consent boxes are made calmer (amber/tinted, not
>    intense red/green) so the screen doesn't read as alarming for routine lookups.
> 5. **Leader contacts are the focus, not the parent.** The student's **ministry leader contacts
>    (primary + secondary, from camp setup)** move to the top as the primary "who do I call" — a
>    first-aider's first move is to reach the student's leader. The **parent/guardian emergency
>    contact moves to the bottom as the last resort.**
>
> Net nav: **Search · Records · Schedule** (3 tabs). Net Student Info order: identity → medical alert
> (softened) → consent (softened) → **leader contacts (primary + secondary)** → Medicare →
> dietary → log action → this student's recent logs → **parent (last resort, bottom).**

---

## 0. TL;DR for the owner

A first-aider's whole job is: **find the right student fast → see what could hurt them and whether
I'm allowed to treat → reach the student's leader → write down what I did.** (Rev 2: this is the whole
scope — no watch lists, no handover dashboards.)

Three headline changes:

1. **Search-first.** Finding a student is the #1 job, so the landing screen is a big search box.
2. **A re-ranked Student Info screen** (was "Casualty Card"). Order: **medical alert (softened) →
   Can I treat? (consent, softened) → leader contacts (primary + secondary, the focus) → Medicare →
   dietary → Log action → this student's recent logs → parent emergency contact (last resort).**
   Today allergies can hide in a separate "Dietary" card *below* the medical card — a genuine safety
   gap we close by merging allergens into the alert.
3. **Quick action logging (the missing capability).** A first-aider records *what happened* and *what
   they did* against the student. Those logs appear in a **Records** tab (the first-aider's own log of
   actions) and roll into the admin/zoneLeader **Notes** screen under a new "First-aid" filter —
   reusing `StudentNote` with `category:'firstaid'`, **no migration**.

Plus a quiet cleanup: the first-aid screens were built with **hardcoded hex** (`#1e3a5f`, `#dc2626`,
`#b45309` …) and predate the Phase-1 token sweep — they should be tokenised when we touch them (C3).

---

## 1. Persona — "the first-aider on shift"

**Who they are.** A camp first-aid officer or nurse. Could be a registered nurse, could be a
volunteer with a current Senior First Aid certificate. They are **not** camp administrators and have
no interest in registrations, money, accommodation, or accounts. *(Rev 2: the scope is deliberately
narrow — find a student's details, make a quick log of any action taken. No watch lists, no
handover/coordination tooling.)*

**The conditions they work in (this drives every design choice):**
- **One-handed, on a phone.** The other hand is on the patient, holding an ice pack, or steadying a
  kid. The UI must be operable with a thumb.
- **Under pressure and adrenaline.** An allergic reaction or a head knock is time-critical. They
  cannot hunt through tabs or parse jargon. **Glanceable beats complete.**
- **Variable light, sometimes gloved, sometimes outdoors.** High contrast, large type, big tap
  targets (≥44px), no fiddly controls.
- **Interrupted constantly.** They start a task, get pulled away, come back. State must be forgiving;
  the log must be quick enough to finish in one sitting.

**What they must do, fast, in priority order:**
1. **Find a specific student** — a kid is in front of them, or a name came over the radio.
2. **See what could hurt this kid** — allergies (esp. anaphylaxis), medical conditions, current
   medications. *This is the single most important screen in the app for them.*
3. **Know whether they're allowed to treat** — is medical consent granted? If not, the workflow is
   "reach the leader/parent first," so consent status must be unambiguous.
4. **Reach the student's leader** — the first move is to contact the student's **ministry leader**
   (primary, then secondary — from camp setup), one tap to dial. *(Rev 2: this is the focus contact,
   not the parent.)*
5. **Log the action** — what happened + what they did, a quick record against the student.
6. **Hand off to hospital/ambulance** — Medicare number, on demand, with an audit trail.
7. **Reach the parent/guardian** — the **last resort** if the leader can't be raised; kept at the
   bottom of the screen.

**Device reality:** **phone is the default** (≈95% of use). A **tablet** may live at the first-aid
tent/station — so we design phone-first but make at least one **wider view** first-class (two columns,
larger type). A laptop is rare; the existing ≥980px sidebar covers it for free.

*Note on the leader-contact source:* camp setup already stores per-church **ministry contacts**
(`male/female` × `primary/backup`) — exactly what `search.service` masks/reveals via
`/search/contact/:camperId/:role`. So the "reach the leader" focus is **data that already exists**; we
surface the same-gender primary + backup contact at the top of Student Info and reveal phone numbers
through the existing audited reveal path (`camper:read:sensitive`).

---

## 2. Current-state audit — keep / cut / add

The `firstAid` role today (RBAC: `camper:read`, `camper:read:sensitive`, `attendance:write` — **no**
notes, **no** `checkin:write`, **no** pre-camp data). Three screens + schedule.

### 2.1 What it does today (mapped from `public/index.html`)

| Screen | Today | Verdict (Rev 2) |
|---|---|---|
| **Home** (`renderHomeFirstAid`) | Hero + **Medical Watch** (top 10 flagged campers) + a "Search all campers" button | **Replace** — home becomes Search; **Medical Watch removed entirely** |
| **Search** (`renderSearchFirstAid` / `runFaSearch`) | Name search → result rows (name, church·zone, on-site, "medical" badge) → student info | **Keep + promote** to home |
| **Casualty Card** (`openCasualtyCard`) | Identity → Medical (conditions, meds, Medicare reveal, consent) → Presence (atCamp + raw `lifecycle`) → Parent → Dietary | **Rename → "Student Info"**; re-rank; lead with leader contacts; fix the allergy gap |
| **Schedule** (`RENDER.schedule`) | Read-only day schedule | **Keep** (owner) |

### 2.2 KEEP (these are right)

- **Camp-wide read of campers** including sensitive fields — correct; a first-aider needs every kid.
- **Name search → Student Info** flow — the core loop. Keep it, make it the landing.
- **Medicare reveal as an audited POST** (`/campers/:id/reveal-medicare`) — good privacy hygiene; keep
  the tap-to-reveal + audit.
- **`tel:` links** — keep, but **promote the LEADER contact to the primary full-width CALL button**
  (parent call becomes a secondary control at the bottom).
- **The `attendance:write`-but-not-`checkin:write` split** — correct and deliberate; do not change.
- **Schedule** in the nav — owner-retained.

### 2.3 CUT (noise a first-aider should never see — and current defects)

- **Medical Watch — removed entirely (Rev 2).** No Watch tab, no "flagged campers" shortcut, no
  `/campers/medical` fetch on the first-aid path. The first-aider's job is *find a student → see
  details → log an action*; a proactive flagged list is out of scope. (The `listMedicalWatch` service
  + `/campers/medical` route can stay in the backend for other roles, but the first-aid SPA stops
  calling it.)
- **Everything pre-camp / back-office.** Already correctly absent (no registrations, blue cards,
  payment, budget, accommodation, accounts, import, settings, FAQ, devotionals). **Keep it absent.**
- **The raw `lifecycle` enum on the Student Info screen** ("registered / arrived / checked_out /
  departed"). A first-aider does not care about a registration state machine. **Cut the jargon**;
  replace with a plain **"On site / Not on site"** line (derived from `atCamp`).
- **Blue-card number/expiry** must never appear on the Student Info screen — compliance artefact, not
  clinical info. (Not there today; keep it out.)
- **Safety defect — allergies buried.** Today the red **Medical** card only renders *if*
  `medicalConditions` or `otherMedications` exist, while **Dietary requirements render in a separate
  yellow card lower down.** Allergies (incl. life-threatening ones like nut/egg) are frequently
  recorded as *dietary* items. A first-aider scanning the red card can **miss an anaphylaxis risk**.
  Fixed by merging allergens into the alert block.
- **Over-intense alarm colours (Rev 2).** The medical-alert and consent boxes should not read as
  emergency-red/green for a routine lookup. **Soften** to amber/tinted surfaces with darker text.
- **Hardcoded hex** throughout the first-aid functions (`#1e3a5f`, `#0f2035`, `#dc2626`, `#b45309`,
  `#94a3b8`, `#16a34a`, `#fef3c7`, `#92400e`). They predate the Phase-1 token sweep and violate the
  C3 token-discipline rule. **Cut the literals**, use `:root` tokens.
- **Hard-to-read light-grey text (Rev 2).** Secondary text on these screens used `--muted` (#6b7280)
  on tinted/white at small sizes. Use a darker secondary ink for body-level secondary text so it's
  legible in variable light. (Add a `--ink-2` token, ~`#4b4868`, for this.)

### 2.4 ADD (the gaps)

- **Quick action logging** — the owner's headline ask. A "Log action" button on Student Info with
  **"What happened?"** + **"What treatment was given?"** + **First-aider** (required) + **Leader who
  brought them** (optional). Persists as `StudentNote{category:'firstaid'}`.
- **A Records tab** — the first-aider's log of actions, newest first. (Rev 2: framed simply as "your
  logs," not a handover dashboard.)
- **An "Allergies & medical alert" block near the top of Student Info** (softened tone), merging
  conditions + medications + allergy-type dietary items into one block so allergens can't hide.
- **Leader contacts at the top — the focus.** Surface the student's **ministry leader** (primary +
  secondary, from camp setup) with a full-width **Call leader** button via the existing reveal path.
- **A "Can I treat?" consent line** (softened) — Granted / Not granted (with "reach leader/parent
  before treating"). Lifted out of the medical card.
- **This student's recent logs** on the Student Info screen — quick context.
- **Parent/guardian as the last-resort contact at the very bottom** of Student Info.
- **Empty/idle states** via the shared `emptyState()` helper (search idle, no logs yet) — consistent
  with the Phase-1/2 system.

---

## 3. Proposed experience — screens & fields

Phone-first. The only mode a first-aider ever sees is **at-camp** (the role is absent pre-camp).

### 3.1 Navigation (single source — `navModel('firstAid', …)`, feeds both tabs & sidebar via D3)

| # | Tab | Icon | Route | Why |
|---|---|---|---|---|
| 1 | **Search** *(home)* | `search` | first-aid search (landing) | Finding a student is the #1 job |
| 2 | **Records** | `note` | first-aider's logged actions | "What have I logged?" |
| 3 | **Schedule** | `clock` | read-only day schedule | Owner-retained |

**(Rev 2)** three tabs — **Watch is removed.** Bottom tabs on phone; the same three mirror into the
≥980px sidebar automatically (the nav single-source already does this).

### 3.2 Screen 1 — Search (the new home)

- Big search input at the top (`Search any student by name…`), 200ms debounce (already built).
- Result rows: initials bubble (gender-tinted, reusing `--male-bg/--female-bg`), name + grade,
  church·zone, **on-site** chip, and a softened **allergy/medical** pill when flagged. Tap → Student
  Info. *(No Medical Watch shortcut — removed.)*
- Idle + empty states via `emptyState('search', …)` with **darkened** (not light-grey) hint text.

### 3.3 Screen 2 — Student Info (renamed from "Casualty Card"; re-ranked)

Top → bottom, Rev 2 order:

1. **Identity header** — initials bubble (gender-tinted), **large name**, grade · Student/Leader,
   church · zone, and an **On site / Not on site** chip (calm, not alarming). No `lifecycle` jargon.
2. **Medical alert** (softened — amber/tinted card with a clear heading, **not** intense red) —
   **allergies + medical conditions + current medications + allergy-type dietary items merged here**,
   each as a legible line. If nothing is recorded, an explicit "No medical conditions recorded" line.
3. **Can I treat?** — **Medical consent** (softened): Granted / Not granted (with "reach the
   leader/parent before treating"). Its own line, not buried — but in a calm tint, not alarm-green/red.
4. **Leader contacts — the focus.** The student's **ministry leader**: **primary** + **secondary/
   backup**, each a full-width call button. This is the first-aider's first move. Sourced from
   camp-setup church contacts (same data `search.service` already serves). UI details (Rev 3): both
   leader buttons use a **clear/bordered black-text style** (no green emphasis); the **phone icon is
   the call affordance**, so buttons show **just the number** (no "Call <name> ·" prefix); the
   secondary number is **shown directly** (no "tap to reveal").
5. **Medicare** — tap-to-reveal (audited POST, unchanged) for ambulance/hospital handoff.
6. **Dietary** (remaining non-allergy items, e.g. vegetarian) — demoted below the clinical block;
   allergy-type items already surfaced in (2).
7. **Log action** (primary button) → the action form (3.4).
8. **Recent logs for this student** — last few `firstaid` records (time · problem snippet).
9. **Parent / guardian** (bottom of the screen): name (+ relation) and a quiet call button (number
   only, no "Call" prefix). Deliberately last — the leader is the primary contact, the parent is the
   fallback (label reads simply "Parent / guardian", no "last resort" wording on screen).

### 3.4 Action form (from Student Info) — **(owner-confirmed fields)**

- **"What happened?"** textarea (the problem).
- **"What treatment was given?"** textarea.
- **"First-aider"** text field (**required**) — the person actually entering/treating. Because the
  station likely runs on a *shared* `firstAid` login, the treating person is named explicitly rather
  than inferred from the account.
- **"Leader who brought them"** text field (**optional**) — who escorted the student.
- **Layout (Rev 3):** the two people fields **stack on one line each on phone** (they were too cramped
  side-by-side) and go **side-by-side only once there's width** (≥~520px container / tablet).
- Encoded as four labelled lines in the note `body` (`Problem:` / `Treatment:` / `First-aider:` /
  `Brought by:`). The login account's `authorId`/`authorName` + `createdAt` are still **server-stamped**
  for the audit trail (the typed "First-aider" is the clinical attribution; the account id is the
  security attribution).
- Save → toast confirm → log appears in (a) this student's "recent logs", (b) the Records tab,
  (c) the admin/zoneLeader Notes screen + church (own-church).
- Disabled/loading button state on submit (no double-submit) — matches Phase-1/2 form discipline.

### 3.5 Screen 3 — Records (the first-aider's logged actions)

- List of `firstaid` records, **newest first** (campwide — owner decision Q3).
- Row: student name + grade, time, **Problem** line, **Treatment** line, a softened **First-aid** pill.
- Simple **Today / All** filter; optional per-student filter.
- `emptyState('note', 'No actions logged yet.')` when empty, with **darkened** hint text.

### 3.6 Wider view (tablet / first-aid station)

At ≥768px the content column widens and type steps up (Phase-1 fluid system, free). On Student Info we
show a **two-column layout**: clinical column (alert / consent / Medicare) beside the **leader-contact
+ log** column, with parent at the bottom — so a station tablet shows the whole picture with minimal
scrolling. The mockups include this wide view.

---

## 4. RBAC & backend filtering (what a first-aider may touch)

The guiding rule: **a first-aider can write and read first-aid records, and nothing else new.** They
must not gain general note-writing or note-reading.

- **New action `note:write:firstaid`** — granted to `firstAid` (and to admin/director for
  completeness). The note service asserts it (instead of `note:write`) **only** when
  `category==='firstaid'`; a first-aider attempting any other category is rejected. This is cleaner
  than overloading `note:write`.
- **New action `note:read:firstaid`** — granted to `firstAid` so the Records tab can read first-aid
  records. `firstAid` still does **not** get general `note:read` (no testimonies/general notes).
- **A dedicated read path** for first-aiders — e.g. `GET /firstaid/records` (or
  `/notes/recent?category=firstaid`) that returns **only** `category==='firstaid'` notes, scoped by
  the same `canAccessPerson` the notes service already enforces. A first-aider must **never** receive
  testimonies or general notes through this path — that is the key thing the new tests pin.
- **admin / director / zoneLeader** read first-aid records through the **existing** Notes screen via a
  new "First-aid" filter — they already have `note:read`; zoneLeader stays zone-scoped (existing
  `canAccessPerson` logic, no change needed).
- **church** logins **(owner decision Q3): can read first-aid records, scoped to their own church's
  campers.** Since church does not currently have `note:read`, this needs a deliberate grant of
  `note:read:firstaid` to `church`, with the read path applying `canAccessPerson` (which already
  limits church to its own `churchId`). Church gains **no** first-aid *write* and **no** access to
  general notes/testimonies — only their own campers' first-aid records, read-only.
- **Leader contacts (Rev 2 focus) — no new permission.** Surfacing/calling the student's ministry
  leader uses the **existing** `search.service` reveal path (`GET /search/contact/:camperId/:role`,
  asserting `camper:read:sensitive`, which `firstAid` already holds). So "reach the leader" needs **no**
  RBAC change — it reuses the masked-contact + audited-reveal mechanism already in the app.
- **Data model:** `StudentNote{ category:'firstaid', camperId:<required>, body:"Problem: …\nTreatment:
  …", authorId/authorName: server, createdAt: server }`. **No migration** — reuses the existing
  free-form `category` and the existing `/notes` plumbing (`category` already flows through create,
  `recent`, and CSV export). The two-line body mirrors how leader names are already folded into
  testimony bodies. (A cleaner `problem?`/`treatment?` column pair is possible but needs migration
  `013` + repo/entity in lockstep — **not recommended**: it collides with the migration number
  **pinned to Phase 5 for the C-1 accommodation fix**, and the program's posture is migration-free
  where reasonable.)

### 4.1 Tests to add (RBAC is the point)

- `firstAid` **can** create a `category:'firstaid'` note; **cannot** create a `category:'note'` or
  `'testimony'` note (asserts `note:write:firstaid` is category-scoped).
- `firstAid` **can** read first-aid records; **cannot** read general notes/testimonies through the
  first-aid path (the path returns only `firstaid` category).
- `church` **can** read its **own** church's first-aid records but **not** another church's; `church`
  still **cannot write** first-aid records and **cannot** read general notes/testimonies.
- `zoneLeader` reading first-aid records is **zone-scoped** (sees in-zone campers only).
- The admin Notes "First-aid" filter includes `firstaid` records and excludes them when another
  filter is active.
- Existing 202-test suite stays green; `tsc --noEmit` stays clean.

---

## 5. Information hierarchy & legibility principles (the "executive" rationale)

- **Important first, alarming never.** On Student Info the order is: what could hurt this kid → may I
  treat → reach the leader → what did I do → (parent, last resort). But the *tone* is calm — amber/tint
  surfaces, not emergency red/green (Rev 2). Routine lookups shouldn't feel like a crisis.
- **No ambiguity on absence.** "No medical conditions recorded" is shown explicitly — a blank card
  must never be read as "nothing's wrong" by omission.
- **One primary action per screen.** Search box on home; Call leader / Log on Student Info.
- **Thumb-first, glove-friendly.** ≥44px targets, generous spacing, the call/log buttons full-width.
- **Legible secondary text (Rev 2).** Body-level secondary text uses a **darker** ink (`--ink-2`),
  not the light `--muted` grey, so it reads in variable light. No sub-11px text on this role's screens.
- **Token discipline.** Every colour from `:root` — fixing the existing hardcoded-hex debt as we go.
- **Minimal taps.** Student in two taps (search → row). Call leader in two taps (row → Call). Log in
  three (row → Log → Save).

---

## 6. Build plan (on owner approval) — summary

1. **RBAC** — add `note:write:firstaid` (firstAid + admin/director) + `note:read:firstaid` (firstAid,
   admin, director, zoneLeader, **church**); category-scope the note-write assert; add the first-aid
   records read path returning only `firstaid` notes, scoped by `canAccessPerson`
   (`access-control.ts`, `note.service.ts`, router/controller). **Leader contacts need no new
   permission** (reuse `/search/contact/:id/:role` + `camper:read:sensitive`). Tests first.
2. **navModel('firstAid')** — tabs Search · Records · Schedule (Rev 2: 3 tabs, **no Watch**); update
   `buildTabs`/`navSidebar`/`TAB_OF` (single source). Home route renders search. **Remove the
   `/campers/medical` call from the first-aid SPA path.**
3. **Student Info** (rename from casualty card) — re-rank per §3.3; merge allergens into a **softened**
   alert; **soften** the consent box; **lead with leader contacts** (primary + secondary call via the
   reveal path); **move parent to the bottom** as last resort; add the action form + this-student
   recent logs. Tokenise all hex; darken secondary text (`--ink-2`); add `--ink-2` token.
4. **Records tab** + its data load (the new read path).
5. *(Watch tab removed — nothing to build.)*
6. **Admin/zoneLeader Notes** — add the "First-aid" filter + badge + Problem/Treatment body render;
   confirm CSV export picks them up (it does — `category` is already a column).
7. **Docs/tests** — `tsc --noEmit` clean; new RBAC + filter tests; `CODE-QUALITY-LOG.md`,
   `CHANGELOG.txt` dated section, `CLAUDE.md` (first-aid capabilities + navModel), `debug.md`,
   `ui-mocks-firstaid.html`. **No push/deploy** (Phase 7 ships).

**Constraints honoured:** CommonJS tsconfig + anchored `/data/` gitignore preserved; migration `013`
stays reserved for Phase 5's C-1 fix (we add **none**); verify by reasoning + `tsc --noEmit` + vitest.

---

## 7. Owner decisions (LOCKED 2026-06-29) — these drive the build

Two rounds of owner feedback are folded in. **Rev 2 (the latest) takes precedence** where it differs.

**Round 1 (the five open questions):**

1. **Records scope → CAMPWIDE.** The Records tab shows **all** first-aiders' logged actions (newest
   first); admin/director see all, zoneLeader zone-scoped, church own-church.
2. **Action fields → two text fields PLUS two people fields.** Captures: **"What happened?"**,
   **"What treatment was given?"**, **"First-aider"** (required — the treating person, named explicitly
   because the station likely runs on a *shared* `firstAid` login), and **"Leader who brought them"**
   (optional). Migration-free — extra labelled lines in the note `body`; `authorId`/`createdAt` still
   server-stamped.
3. **Visibility → ALSO CHURCH LOGINS** (own-church). Read grant: first-aiders (own records path),
   admin/director (all), zoneLeader (zone), **church (own church)**. `church` gets **no** write and
   **no** general-note access. Tests pin own-church-only + no-write.
4. **Schedule → KEEP** in the nav.

**Round 2 (Rev 2 — refinements that override Round 1 where noted):**

A. **Drop Medical Watch entirely** and the handover framing. No Watch tab, no watch shortcut, no
   `/campers/medical` on the first-aid path. → **Nav is 3 tabs: Search · Records · Schedule** (this
   supersedes Round-1 Q4's "4 tabs incl. Watch" — Watch is gone, Schedule stays). Records is just
   "your logs of actions," not a coordination/handover view.
B. **Rename "Casualty Card" → "Student Info"** everywhere (UI label, render fn naming, docs).
C. **Darken light-grey secondary text** for legibility — add an `--ink-2` token (~`#4b4868`) and use
   it instead of `--muted` for body-level secondary text on these screens.
D. **Soften the medical-alert and consent boxes** — calm amber/tint surfaces with dark text, not
   intense red/green. (Allergens are still merged into the alert — the safety fix stays; only the
   *tone* changes.)
E. **Leader contacts are the focus; parent is the last resort.** The student's **ministry leader**
   (primary + secondary, from camp setup) leads the Student Info contact section with a full-width
   **Call leader** button; the **parent/guardian moves to the bottom** as the fallback. Leader contacts
   reuse the existing `/search/contact/:id/:role` reveal path — **no new permission**.

### 7.1 Build deltas (net of both rounds)
- **navModel('firstAid')**: **3 tabs** — `search` (home) · `records` · `schedule`. No `watch`.
  `TAB_OF`/`buildTabs`/`navSidebar` derive from the single source.
- **Student Info order:** identity → medical alert (soft) → consent (soft) → **leader contacts
  (primary+secondary)** → Medicare → dietary → Log action → recent logs → **parent (last resort)**.
- **RBAC**: `note:write:firstaid` (firstAid + admin/director); `note:read:firstaid` (firstAid, admin,
  director, zoneLeader, **church**), read path scoped by `canAccessPerson`. Leader-contact calling
  reuses `camper:read:sensitive` (already held) — no new permission.
- **Action body schema**: 4 labelled lines — `Problem:` / `Treatment:` / `First-aider:` /
  `Brought by:` (last optional).
- **Visual tokens:** add `--ink-2`; soften alert/consent to amber/tint; tokenise all first-aid hex.

---

*Prepared for owner review. On approval I implement into the real app (`public/index.html`, RBAC, and
backend record path), keep `tsc --noEmit` clean, add the RBAC/filter tests, log in
`CODE-QUALITY-LOG.md`, add a dated `CHANGELOG.txt` section — and stop before any push/deploy.*
