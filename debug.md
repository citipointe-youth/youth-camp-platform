# debug.md — Youth Camp Platform debugging map

> Companion to `CLAUDE.md`. Point Claude at **both** files when reloading context for a bug.
> CLAUDE.md = system/architecture/contract. This file = "where does this symptom live?"
> Don't duplicate CLAUDE.md here — it already covers the SPA↔backend contract, presence
> invariants (atCamp vs lifecycle), RBAC model, camp-mode behaviour, and deploy gotchas.

## How to use this file (per bug set)

1. Read `CLAUDE.md` + this file. **Don't read anything else yet.**
2. From the **symptom router** below, jump to the one function/file that owns it.
3. **Confirm line numbers by Grep on the symbol name** — line numbers here are approximate
   (snapshot 2026-06-26) and drift as the file changes. The *names* are stable; grep them.
4. Read only that function's range. Most SPA bugs are one function in `public/index.html`.

> **Don't re-grep the whole map on reload** — line numbers only drift when `index.html` is
> edited, and the per-symbol grep in step 3 self-corrects where the current bug is.
> **Maintenance rule:** when a fix shifts offsets in `index.html`, update the affected line
> numbers in this file *as part of that fix*, so the map is correct at the next reload.

> **Verify & deploy conventions (this repo) — do NOT:**
> - **Start a localhost dev server or drive a browser to test.** Verify with `npm run typecheck`
>   + `npm run test` and reasoning/grep only. CSS/layout changes can't be fully proven this way —
>   make the change and tell the user to eyeball it on-device.
> - **Check the Vercel deployment.** GitHub is linked to Vercel; a push to `master` auto-deploys.
>   Pushing is the deploy — no need to poll deployments or curl the prod URL to confirm.

### Per-set input template (what to give Claude each time)

```
Read CLAUDE.md and debug.md. Don't read other files yet.
Account: <username> (role: church | zoneLeader | director | admin | firstAid)
Mode: <pre-camp | at-camp>
Bug(s):
1. <symptom — what you saw vs expected>
```

Role + mode are the two variables that decide *expected* behaviour. Use the grid below to
check "expected vs actual" before touching code.

---

> **Improvement Initiative Phases 1–7 (deployed 2026-06-28) — read this before trusting line numbers below.**
> The SPA grew substantially. Key structural changes (grep the symbol, don't trust offsets):
> - **Single nav source:** `navModel(role,mode)` → `{tabs,extras}`; `navSidebar(role,mode)`;
>   `buildTabs` and `_renderWideNav` BOTH derive from these. "Wrong/empty tab or sidebar" → `navModel`.
> - **Budget rebuilt:** `RENDER.budget`/`drawBudget`/`computeBudgetClient`/`exportBudget`/`_budToggle`
>   (mirror of pure `src/services/budget.ts`). "Budget number wrong" → `budget.ts` first (it's tested),
>   then `computeBudgetClient`. Prices are per-registrant `registrationCost`, NOT settings.
> - **Accommodation split (PC-10/C-1):** `accomChurches`/`accomGroups` (+ `_accomGenderGroups`,
>   `_bracketOfGrade`) mirror backend `computeGroups`; pool >50 splits into `…|gender|7-9` / `|10-12`.
>   Requires migration 013 (`bracket` column on `classroom_allocations`).
> - **Icons:** SVG-only; `ic/icSm/icLg/icXl`, `emptyState`. "Blank icon" → key missing from `ICONS`.
>   **⚠ TDZ gotcha:** `ACC_LABEL` (uses `icSm`) must be declared AFTER `const ICONS`. If `ACC_LABEL`
>   appears before `ICONS` in the script, the whole script crashes silently at boot → white screen after
>   login. Fixed 2026-06-30: `ACC_LABEL` moved to immediately after the `ICONS` closing brace.
> - **Type scale / breakpoints:** `:root --t-*` tokens; root font scales at 768/1280; breakpoints
>   540/768/900/980/1280. "Text too small/large" or "doesn't scale" → these.
> - **sw.js `camp-v7`**, `API_RE` now includes `/export`.

## Frontend — `public/index.html` (single ~2,920-line SPA)

This one file is the only real navigation cost in the repo. Map below (line numbers are a
2026-06-26 snapshot); **grep the name to confirm the line** — they drift on every edit.

> **Desktop/laptop wide layout (≥980px):** restored 2026-06-26 — the grid was orphaned (CSS +
> `_renderWideNav` targeted `#app`/`#header`/`#main`, but the shell is `class="app"`+`id="app"` /
> `id="bar"` / `id="stage"`). Grid now targets `#app`/`#bar`/`#stage` (CSS `@media(min-width:980px)`
> ~213; `_renderWideNav` ~572). **Verified at markup level only, NOT visually** — if the desktop
> view looks off, the `#stage` padding in that media block is the first thing to adjust. The phone
> layout (<980px) is independent of this block.

### Global state (line ~381)
`TOKEN, ACTOR, SETTINGS, CAMP_MODE('pre-camp'), STACK, PREVIEW_MODE` — one declaration line.
Also: `Cache` (313, 30s TTL data cache), `ALLREG/CHURCHES` (~839), `_navToken` (~530),
`SCHED_DAY` (~1519), `DEVO_DAY` (~1533), `_pendingImportCsv` (~2060).

### Infrastructure / plumbing
| Symbol | ~Line | Owns |
|---|---|---|
| `_doFetch` / `api` | 338 / 357 | All HTTP. Bare results, throws on non-2xx. **Preview write-guard** lives in `api()`. Timeout + GET coalescing + **30s result cache**; non-GET writes call `_invalidate`. **`_doFetch` drives the top loading bar** (below). |
| `_npStart` / `_npDone` / `#nprog` | ~586 / ~594 / CSS ~281 | **Global top loading bar** (2026-07-01). Reference-counted; `_doFetch` calls `_npStart()` on entry and `_npDone()` in `finally`, so only **real** network requests animate the bar (cached GETs bypass `_doFetch` → no flash). `#nprog` = first child of `.app`, absolute `top:0`. "Bar stuck / never shows / flashes on cached nav" → the counter balance in these two fns. |
| `Cache` / `_allCached` / `_invalidate` / `_prefetch` | 313 / 322 / 325 / 375 | **Perf layer (ported from CMS).** Cache = 30s TTL Map; `_prefetch` warms endpoints after login; `_invalidate` maps a write path → stale keys. **Stale data after a write = `_invalidate` mapping.** |
| `sessionExpired` | 429 | 401 handling (clears Cache) |
| `ICONS` / `ic` | 394 / 414 | SVG icon set + renderer (incl. `edit/at/key/trash` for account rows). **Blank icon = missing key here.** |
| `heroMark` | ~727 | **(NEW 2026-07-02)** Tent+cross watermark (16% opacity white) for the right side of a `.hero` card — mirrors `public/icons/icon.svg`'s design. Called as the first child of both Home hero cards (`RENDER.home`, `renderHomeAtCamp`). "Watermark missing/wrong on Home" → here; "app icon looks wrong on a phone" → `public/icons/icon.svg` + `sw.js` `CACHE` version (must bump on any icon change or installed users keep the old one) + the known apple-touch-icon SVG/PNG gap noted in `CLAUDE.md`. |
| `toast / modal / closeModal` | 422–424 | Transient UI |
| `dayLong / timeFmt / dtFmt` | 425 | Date formatting (UTC-anchored). `_addDays / _datesBetween` near `adminSettings` derive check-in days. |
| `fmtPhone` / `telLink` | ~1259 / ~1267 | **(NEW 2026-07-02)** `fmtPhone` normalizes AU mobiles for display — reformats a 10-digit `04xxxxxxxx` to `0411 928 301` and re-adds a dropped leading 0 on a 9-digit truncated number (common when a CSV mobile column got numeric-coerced upstream in Excel/Elvanto). Passes through anything else unchanged (incl. masked contact numbers like `0411****01`). `telLink` (tel: links) and every other phone-display site (Data tab, first-aid leader/parent contacts, search reveal, Student Info/camper card) call it. **Doesn't touch editable phone `<input>` values** (e.g. ministry-contacts editor `pair()`) — only rendered/read-only text. "Phone shown inconsistently / missing leading 0" → here. |
| `_initDemoLogin / quick` | 444 / 451 | Demo quick-login (localhost only) |
| `doLogin / logout / _tryRestoreSession` | 452 / 467 / ~2244 | Auth. `doLogin` saves token+actor to localStorage; `logout` clears localStorage; `_tryRestoreSession` (called at boot) restores session across page reloads. |

### Navigation / shell
| Symbol | ~Line | Owns |
|---|---|---|
| `updateModeUI` | 473 | Preview banner + mode chrome |
| `enterPreview / exitPreview` | 483 / 491 | Client-only at-camp preview (no backend) |
| `TAB_OF` | 505 | Tab-id → highlighted-tab map. **Wrong tab highlighted = here.** |
| `_showScreen / _paint / _navTo / go / gotoTab / back` | 513–554 | Router. `_navTo` is **stale-while-revalidate**: shows the previous render (no spinner) on revisits. |
| `_renderWideNav` | 567 | Desktop sidebar — **admin & director only**. Mode-conditional: at-camp shows Check-in/Search/Notes/Notices; pre-camp shows My Youth. Church Import removed. Data/Records merged into "Data, Reset & Exports". |
| `buildTabs` | 605 | Bottom-nav tabs per role × mode. **Missing/extra tab = here.** |

### Home (dispatch at `RENDER.home`, line 629)
`RENDER.home` → firstAid? **redirects to `gotoTab('search')`** (Phase 4: firstAid landing is Search,
not a Home tab; `gotoTab` also maps home→search for firstAid). Else re-fetches `/settings` **only when
not in PREVIEW_MODE** (picks up admin mode switch live; the guard fixed "preview won't load"),
then **parallel-loads** `/home`+`/registrants`+`/notifications`, pre-camp home (inline) vs
`renderHomeAtCamp` (713).
- `renderHomeAtCamp` 713, `renderOversightPulse` 811 (async, no `/campers` fetch — uses session DTO).

### Pre-camp screens
| Screen / fn | ~Line |
|---|---|
| `RENDER.people` (My Youth) | 841 |
| `scopeRegs / drawPeople / personRow` | 878 / 879 / 892 |
| `openPerson / markReg` | 906 / 925 |
| `RENDER.help` | 929 |
| `RENDER.budget` (prices from per-registrant `registrationCost` — NOT settings prices, which are deprecated) | ~1249 |
| `RENDER.accom` — classroom **rooms** + allocation map. Helpers: `accomChurches`/`accomGroups` (75% eligibility), `addAlloc` (auto-fill, single-gender guard), `removeAlloc` (cascade), `drawAccom`, `tentDist` (7/tent). | ~1278 |
| `RENDER.data` (director/admin data view) | ~2906 | Linked from the "Data, Reset & Exports" admin screen's `dataTableCard` "View ›" pill (`RENDER.adminData` ~2849). **(2026-07-02)** `dataApply` (~2969) now sorts client-side: `_dataCache` defaults to createdAt-ascending (approximates import order — `/registrants` itself returns alphabetical) and headers are clickable (`dataSort` ~2963, `DATA_COLS`/`_dataSortVal` ~2944) cycling unsorted→asc→desc. `Mobile` column runs through `fmtPhone`. |

> **`RENDER.codes` (registration code / self-register) was DELETED** — self-registration is gone
> (all registrants arrive via CSV). No reg-code screen, home card, or `/r/:slug` link.

### At-camp screens
| Screen / fn | ~Line | Notes |
|---|---|---|
| `RENDER.checkin` | 981 | Daily session check-in. `_ciLabel` 936, `CHECKIN_QUEUE` 946, `drainQueue` 956, `_optimisticState` 975, `rowHtml` ~1481. **Sessions = `settings.checkInDays`×AM/PM** (id `${day}~am`), NOT schedule — see backend `checkin-sessions.ts`. The status path `encodeURIComponent`s the id (the `~` delimiter replaced `#`, which broke the URL → "Endpoint not found"). **(2026-07-02)** `rowHtml` tile decluttered: avatar/initials, med badge, and the always-on grey sync dot removed; Check-in is now a primary solid button (ghost once already checked in) labelled "Check in"/"Check out", bigger than the ghost "Add note" button. Per-row sync state (`_updateSyncDots`/`_markSynced`) is now a harmless no-op — the top `ci-sync` banner is the only sync-status UI. |
| `_performCheck / confirmCheckOut / doCheck` | 1052 / 1062 / 1086 | Optimistic flip + undo (`undoCheck` 1075) |
| `notePrompt` | 1087 | Check-in notes |
| **FIRST AID (Phase 4)** `renderSearchFirstAid / runFaSearch` | ~1375 | firstAid home = student search (no Medical Watch). `_ALLERGY_RE` flags allergy-type dietary items. |
| `openStudentInfo` | ~1391 | "Student Info" (renamed from casualty card). Re-ranked: alert→consent→**leader contacts** (`GET /search/contacts/:id`)→Medicare→dietary→Log→recent logs→parent (bottom). `faRevealLeader` reveals a leader number. |
| `openFirstAidLog / saveFirstAidLog` | ~1490 | Log-action form → `POST /notes {category:'firstaid'}` (4-line body). |
| `RENDER.records / drawFaRecords / faRecSeg / exportFaRecords` | grep the name | First-aid records tab (`GET /notes/firstaid`); Today/All + per-student filter. `_faParse` splits the 4-line body. **Export button → `exportFaRecords()`** builds a CSV client-side from `window._faRecsAll` (no backend). |
| `revealMedicare` | ~1480 | Uses `_currentStudent` (no re-fetch); POSTs the audit reveal. |
| `RENDER.search / runSearch / reveal` | 1193 / 1198 / 1215 | Contact search + reveal |
| `RENDER.notifs / deleteNotice` | 1218 / 1230 | Notices |
| `RENDER.compose / sendNotif` | 1302 / 1317 | Send notice (zoneLeader/director/admin) |
| `RENDER.firstday` | 1328 | Day-1 arrivals (sign-in). Fetches **both** `/registrants` (lifecycle=registered, kind≠leader) and `/campers` (kind=student) in parallel; deduplicates by id so pre-arrival students appear in "not signed in". |
| `RENDER.myyouth` | 1405 | Leader's youth roster |
| `openCamper` | 1449 | Camper detail |
| `signOutPrompt/Confirm`, `signInPrompt/Confirm` | 1485 / 1509 | **Attendance** (writes atCamp/lifecycle) |
| `RENDER.schedule` | 1520 | Pure plan view (no location, no check-in pill). `selSchedDay` 1530 |
| `RENDER.devotional` | 1534 | `selDevoDay` 1547 |
| `RENDER.faq` | 1550 | |
| `RENDER.testimonies / submitTestimony` | 1556 / 1569 | **Student is optional** — defaults to "No specific student identified" (general testimony). |
| `RENDER.notes / drawNotes / exportNotes` | 1574 / 1589 / 1603 | Camper-less notes show as "No specific student". |

### Admin screens (admin role; identical in both modes)
| Screen / fn | ~Line |
|---|---|
| `RENDER.admin` (console) | 1611 |
| `switchMode` | 1631 |
| `RENDER.adminAccounts` — **rewritten**: one row per login (leadership + churches) with icon actions | 1649 |
| ⮑ `aRoleChange` 1698, `addAcct` 1702, `editLeaderName/saveLeaderName` 1708/1715, `editChurchName/saveChurchName` 1719/1726, `editUsername/saveUsername` 1728/1733, `changePassword/savePassword` 1735/1741, `delAcct/delChurch` 1743/1745, `addChurch` 1747 | — |
| `RENDER.adminAccom` — classroom **rooms** mgmt (+ `saveRoom`/`delRoom`/`addRoom`); tent setup removed (auto-distributed). Prices moved to `RENDER.adminSettings`. | ~1779 |
| `RENDER.adminFaq / adminFaqEdit` | 1778 / 1791 |
| `RENDER.adminRecords` | ~1808 | **Redirects to `adminData`** — all export/close-out content merged there. |
| `RENDER.adminCloseOut` (+ `doNewYear`) | ~1830 / ~1855 | Back button → `adminData`. |
| `RENDER.adminSettings / saveSettings` | 1891 / 1916 |
| ⮑ **Timezone hardcoded** to Australia/Brisbane (field removed); check-in days **auto-derived** from start/end via `_datesBetween`; `renderCheckinDaysPreview`/`onStartDateChange` (start pre-fills end +3 days). Also hosts the two **login-lock toggles** (`stChurchLock`/`stZoneLock` → `churchLoginLocked`/`zoneLeaderLoginLocked`, `.tgl` switch) saved in `saveSettings`. | — |
| `RENDER.adminData` (+ `adminReset`, `adminClear`) | ~1926 | **Merged from Records & Export**: shows compliance export card, close-out card, CSV upload, notifications clear (at-camp), rollover, factory reset. Title = "Data, Reset & Exports". |
| `RENDER.import / RENDER.adminData` upload card (`_importUploadCardHtml`) + `adminUpload` / `_renderImportPreview` / `_confirmImport` / `_createPhantomChurches` / `_detectImportType` / `_xlsxToCsv` | grep the names | **Redesigned 2026-07-02 (late):** single multi-file field, header auto-detect, combined Form→Ticket→Invoice preview→confirm, Excel via lazy SheetJS, per-source last-imported stamps. Phantom churches still get a per-church create form that re-runs the dry-run. |
| `RENDER.adminWizard` (+ `WIZARD_STEPS`) | ~3012 / ~3001 | **9 steps (2026-07-01):** settings→churches→accounts→accom **rooms**→**accomAlloc** (`accom`)→schedule→**devos**→**faq**→**contacts**, logical order. Each step has an auto-`check()` (green tick) + a `tip` shown via `helpTip`. "Wizard step wrong/missing tick or tooltip" → `WIZARD_STEPS`. |
| `RENDER.adminStudents` (+ `stuApply`/`stuEdit`/`stuSave`/`stuAdd`/`stuCreate`/`_stuNorm`/`_rStu`) — **at-camp Individual Student Data Edit** (2026-07-02): merged `/registrants`+`/campers` students table, church/gender/grade filters + search, row-tap core-field edit via `PATCH /registrants/:id`, manual add via `POST /registrants` (created `registered`, signs in via First-day). Admin-console tile is at-camp only (wizard tile pre-camp only) — both in `RENDER.admin`. | ~2955 |
| `RENDER.adminDevos / saveDevo` | 2153 / 2168 |
| `RENDER.adminSchedEdit` — **per-day table** (`_schedRow` ~3048, `addSchedRow`, `saveSchedDay` = source-of-truth replace). No location, no `isCheckInPoint`. Grid `96px minmax(0,1fr) auto` + `.sched-row input{min-width:0}` (2026-07-01, fixes phone overlap — native `type=time` `min-width:auto` was overflowing the Time track). | ~3050 |
| `RENDER.adminContacts / saveContacts` (+ `toggleContactCard` 2235; header shows `n/4 Contacts`) | 2210 / 2236 |

---

## Role × mode → what should appear (check expected vs actual first)

**Bottom-nav tabs** (`buildTabs`, line ~605):

| Role | pre-camp | at-camp |
|---|---|---|
| `church` | Home · My Youth · Help · Notices | Home · Check-in · Search · Notices |
| `zoneLeader` | Home · My Youth · Help · Notices | Home · Check-in · Search · Notices |
| `director` | Home · My Youth · **Data** · Help · Notices | Home · Check-in · Search · Notices |
| `admin` | Home · My Youth · **Data** · Notices · **Admin** | Home · Check-in · Search · **Admin** |
| `firstAid` | Search · Records · Schedule (**same in both modes**; Search is the landing — Phase 4) | Search · Records · Schedule |

**Desktop wide sidebar** (`_renderWideNav`) — all roles get the sidebar at ≥980px; items from `navSidebar(role,mode)` = `navModel` tabs + extras (admin at-camp uses a dedicated order). Items are **mode-conditional**:
- **admin at-camp:** Home, Check In, Search, Notices, Accommodation Allocations, Admin Settings
- **admin pre-camp:** Home, My Youth, Data, Notices, Admin, Budget & Costings, Accommodation Allocations
- **director at-camp:** Home, Check-in, Search, Notices, Notes
- **director pre-camp:** Home, My Youth, Data, Help, Notices, Budget & Costings, Accommodation Allocations
- **church / zoneLeader at-camp:** Home, Check-in, Search, Notices
- **church / zoneLeader pre-camp:** Home, My Youth, Help, Notices
- **firstAid (all modes):** Search, Records, Schedule
- Bottom tabs hidden (`#tabs{display:none}`) at ≥980px; sidebar is the sole nav.

(Full capability/scope matrix is in CLAUDE.md → "Roles". firstAid = read-only, attendance-only,
no notes/admin/pre-camp data.)

---

## Backend — `src/` (layered, small files; grep within the named file)

Architecture: `api (controllers) → services → repositories → core`. Find a route, then its
service. **Bugs are almost always in a service.**

| Concern | File | When the symptom is… |
|---|---|---|
| Route table (path → controller) | `src/api/http/router.ts` | "endpoint 404 / wrong handler" |
| **RBAC** (all role checks) | `src/services/access-control.ts` | any 403 / "should/shouldn't be allowed" |
| Persistence wiring | `src/container.ts` | "works on memory, not supabase" (or vice-versa) |
| Person logic + **presence invariants** | `src/services/person.service.ts` | check-in/sign-in/out, atCamp, lifecycle, medical-watch |
| Daily check-in **sessions** | `src/services/checkin.service.ts` + `checkin-sessions.ts` (pure) | "no check-in sessions", wrong current session, **session-id 404**. Sessions = `settings.checkInDays` × AM/PM (id `${day}~am`/`~pm`), **NOT the schedule** (de-linked 2026-06-25). |
| Dashboard / roster counts | `src/services/dashboard.service.ts` | wrong "checked-in"/"still due" counts, roster contents. Uses `buildSessions(settings.checkInDays)` for today's sessions. |
| Notes / testimonies | `src/services/note.service.ts` | testimony won't save / camper-less note. `camperId` is **optional** (general testimony); `notes.camper_id` is nullable. |
| CSV import (Form, `POST /import/csv`) | `src/services/import.service.ts`, `church-import.service.ts` | import dropping/duplicating rows, dry-run. Churches match/create by **name** (no `code`). Church-scoped matching (`nameChurchKey`/`pickMatch`/`phoneKey`) — **unchanged from before the multi-source work**, still deletes anyone absent from the file. Blank CSV cells no longer clobber existing values on update (2026-07-02 fix) — `parseGender` returns `null` on blank, `'other'` only as the create-time default; `zone` stays unconditional (church-derived, not CSV-derived) by design. |
| **CSV import (Ticket List, NEW `POST /import/tickets`)** | `src/services/ticket-import.service.ts` + `ticket-import.controller.ts` | Owns `accommodationKind`(+`accommodationKindConfidence:'confirmed'`, unconditional unless `Church.accommodationOverride` wins), `ticketNumber`, `invoiceNumber`, `paymentStatus`. Cross-church name(+phone) matching via `person-matching.ts`, never church-scoped, never deletes. No confident match → creates an orphan `Person` (no `churchId`) with `needsReview:true`. Real headers (confirmed 2026-07-02 against a sample): `Event Occurrence information`, `Invoice Payment Status`, plus a **`Ticket Status`** column (skip the row with a warning unless it's exactly `Active` — a cancelled/refunded ticket must never write confirmed accommodation data). `Ticket Type` values are substring-matched (`includes('classroom')`/`includes('tent')`), confirmed to correctly handle real values like `"EARLY BIRD | Tent Accomodation"` (real misspelling in the export). |
| **CSV import (Invoice, NEW `POST /import/invoices`)** | `src/services/invoice-import.service.ts` + `invoice-import.controller.ts` | Owns `registrationCost`/`discountCode` (reused fields), NEW `discountAmount`/`amountPaid`/`feesAmount`/`taxAmount`. **Never creates a person** (no church field in this export, `Person.churchId` is non-nullable) — unmatched rows go to the response's `unmatchedInvoices[]` instead. Tiered match: `invoiceNumber` (cross-referenced against a value Ticket List already set) → billing-contact name+phone fallback. May **guess** `accommodationKind` (`confidence:'guessed'`) via `buildAccommodationPriceLookup` (exact-cents match, ≥3 confirmed samples + ≥90% majority at that price, never overwrites `'confirmed'`). Real headers (confirmed 2026-07-02): plain `First Name`/`Last Name` for the billing contact (NOT `Billing First Name`), `Fees Paid`, `Total Tax`. **Confirmed real risk, not hypothetical**: the billing-contact name is frequently a parent, not the registrant — `src/services/multi-source-import.integration.test.ts` proves the invoice-number tier correctly avoids this trap using the real sample data. |
| **Real-sample regression coverage** | `src/services/multi-source-import.integration.test.ts` (NEW) | Runs the actual 2026-07-02 sample Form/Ticket List/Invoice CSVs (inlined as fixtures) through all three importers in sequence and asserts final per-person state. Re-run this first if a future real export breaks import — it's the closest thing to a real end-to-end check without driving the browser. |
| **Shared matching/merge core** | `src/services/person-matching.ts` (NEW) | `findPersonMatch`/`buildNameIndex`/`addToIndex` (cross-church, normalize-then-exact, bounded Levenshtein≤2 fallback, single-unambiguous-candidate only) and `mergeOwnedFields`/`isBlank` (generic "never overwrite a good value with a blank incoming one" — used by all three import services). "Two people got matched as one" / "an obvious name match didn't happen" → here first. |
| Reset / new-year / defaults / **mode** | `src/services/admin.service.ts` | wipe behaviour, snapshot restore, mode switch |
| Accounts / churches | `src/services/account.service.ts` | login, account CRUD, sole-admin guard |
| Accommodation | `src/services/accommodation.service.ts` + `accommodation-allocation.ts` (pure: groups/validation/tents) | classroom rooms CRUD, allocation map, 75% eligibility, single-gender/capacity validation, lock, church-rooms. **No blocks/reservations** (removed). |
| Search / contact reveal | `src/services/search.service.ts` | search results, reveal audit |
| Audit / export | `src/services/audit-export.service.ts` | export CSV, lastExportedAt |
| Supabase repos | `src/repositories/supabase/*` | prod-only data round-trip issues |
| Types / Zod schemas / errors | `src/core/*` | validation rejects valid input |

Verification: `npm run typecheck` (clean) · `npm run test` (vitest, 261 pass). Note the two
deploy-only gotchas in CLAUDE.md (CommonJS tsconfig; anchored `/data/` gitignore) — neither is
caught by tsc/vitest. Schema migrations `008`–`014` applied to prod; `src/repositories/supabase/*`
must not reference dropped columns. Migration `013` adds `bracket text` to `classroom_allocations`;
migration `014` adds `church_login_locked` + `zone_leader_login_locked` (boolean, default false) to
`settings`. **`supabase.settings` writes ALL settings columns on every save** — if a new settings
column isn't migrated to prod, every settings save (and mode switch / new-year) fails; reads
tolerate absence via `?? false`.

---

## Symptom router (fastest path)

| Symptom | Go to |
|---|---|
| **White screen after login (header visible, content blank)** | SPA `ACC_LABEL` TDZ crash at boot — `ACC_LABEL` must appear after `const ICONS` in the script (fixed 2026-06-30). If it reappears, check script init order. |
| Blank / wrong icon | SPA `ICONS` (394) |
| Wrong tab highlighted | SPA `TAB_OF` (505) |
| Tab missing/extra for a role or mode | SPA `buildTabs` (605) / `_renderWideNav` (567) — check grid above |
| **Stale data after a write / screen won't refresh** | SPA `Cache` (313) + `_invalidate` (325) — the write's path must map to the right stale keys. `{noCache:true}` forces fresh. |
| Slow home / spinner flash on revisit | SPA `_prefetch` (375, warms admin `/accounts/*` too), `_navTo` stale-while-revalidate (537), parallel loads in `RENDER.home` (629) |
| **Top loading bar stuck / missing / flashes on cached nav** | SPA `_npStart`/`_npDone` (~586/~594) + `#nprog` CSS (~281). Only `_doFetch` (real network) drives it; cached GETs bypass it by design. Feels unresponsive on button tap = expected serverless latency, now covered by the bar. |
| **Home Screen (PWA) icon looks wrong / stale on a phone** | `public/icons/icon.svg` (design) + `public/sw.js` `CACHE` (must bump the version any time the icon changes, or installed users keep the cached old one) + the documented `apple-touch-icon` SVG/PNG gap in `CLAUDE.md` (iOS may need a PNG, not the raw SVG). |
| **Home hero card missing/wrong watermark on the right** | SPA `heroMark` (~727); called from `RENDER.home` (pre-camp) and `renderHomeAtCamp` (at-camp) as the first child of `.hero`. |
| **Setup wizard: wrong step order / missing tick / no tooltip** | SPA `WIZARD_STEPS` (~3001) — 9 steps, each with `check()` (tick) + `tip` (`helpTip`). `RENDER.adminWizard` ~3012. |
| **Schedule-edit Time/Activity inputs overlap on phone** | SPA `_schedRow` (~3048) grid `96px minmax(0,1fr) auto` + `.sched-row input{min-width:0}`. Native `type=time` `min-width:auto` overflows a fixed track without this. |
| **`.pill` badge ("View ›" etc.) wraps to two lines on phone** | SPA `.pill` CSS (~123) — needs `white-space:nowrap;flex-shrink:0` (fixed 2026-07-02); a long sibling in the same `.rowsb` was squeezing it below its content width. |
| **Data tab: phone shown inconsistently / missing leading 0** | SPA `fmtPhone` (~1259) — see Infrastructure table above. |
| **Data tab: can't sort columns / doesn't default to import order** | SPA `RENDER.data`/`dataApply` (~2906/~2969) — see Pre-camp screens table above. |
| Write silently blocked, "preview" toast | SPA `api()` preview guard (357) + `enterPreview` (483) |
| **Preview at-camp view won't load** | SPA `RENDER.home` `/settings` re-fetch is guarded by `if(!PREVIEW_MODE)` (~636); `enterPreview` (483) |
| Mode change didn't reach a logged-in user | SPA `RENDER.home` `/settings` re-fetch (~636, skipped in preview); backend `admin.service` |
| **Check-in "Endpoint not found" / session 404** | SPA `RENDER.checkin` (981) — status path must `encodeURIComponent` the id; session-id delimiter is `~` (NOT `#`). Backend `checkin-sessions.ts` `parseSessionId`. |
| "No check-in sessions configured" | backend `checkin-sessions.ts` `buildSessions` — driven by `settings.checkInDays` (set via admin Settings dates), NOT the schedule |
| Check-in count / roster wrong | SPA `RENDER.checkin` (981) + `_optimisticState` (975); backend `checkin.service` / `dashboard.service` / `person.service` (atCamp scoping) |
| Check-in tap doesn't stick / undo broken | SPA `CHECKIN_QUEUE` (946) `drainQueue` (956) `_performCheck` (1052) `undoCheck` (1075) |
| Sign-in/out wrong (atCamp/lifecycle) | SPA `signOut/InConfirm` (1485/1509); backend `person.service.signEvent` + presence invariants in CLAUDE.md |
| Search / reveal contact | SPA `runSearch` (1198) `reveal` (1215); backend `search.service` |
| First-aid student lookup / Student Info card | SPA `renderSearchFirstAid`/`openStudentInfo`/`revealMedicare`; leader contacts via `GET /search/contacts/:id` (`search.service.resolveContacts`). (Medical Watch + `/campers/medical` removed from the first-aid path in Phase 4; `listMedicalWatch` still serves other roles.) |
| First-aid records (log an action / Records tab / Notes "First-aid" filter) | SPA `openFirstAidLog`/`saveFirstAidLog`, `RENDER.records`/`drawFaRecords`, `drawNotes` firstaid branch. Backend `note.service.add` (category-scoped: `note:write:firstaid`) + `recentFirstAid` (`note:read:firstaid`, `canAccessPerson`-scoped) → `GET /notes/firstaid`. Body = 4 lines Problem/Treatment/First-aider/Brought by (`_faParse`). No migration. |
| **First-aid Records "Export" button (CSV) missing/wrong** | SPA `exportFaRecords()` (on the `RENDER.records` page) — builds the CSV client-side from `window._faRecsAll` (loaded from `/notes/firstaid?limit=100`) via `_faParse`; filename via `_exportName`. No backend/permission change (firstAid = `note:read:firstaid` only). Exports the loaded records, not the on-screen Today/All filter. |
| Notices not showing / urgent popup | SPA `RENDER.notifs` (1218); `renderHomeAtCamp` (713) |
| Accommodation allocation (rooms/auto-fill/unallocated/single-gender) | SPA `RENDER.accom`/`addAlloc`/`removeAlloc`/`drawAccom` (~1278); backend `accommodation.service` + `accommodation-allocation.ts` (75% eligibility, `validateAllocations`). Classroom pools include **both students and leaders** (tent pools keep students/leaders separate). |
| Budget numbers wrong | Pure `src/services/budget.ts` (`computeBudget`, tested) → SPA `computeBudgetClient`/`drawBudget`. Costs = per-registrant `registrationCost` (NOT settings prices, which are deprecated). Grand total must == Σ all line totals. Null cost = "Cost not recorded" ($0, flagged). |
| Budget grand total ≠ sum of rows | the reconciliation invariant — check `computeBudget`/`computeBudgetClient` line-total math; covered by `budget.test.ts`. |
| Church/zoneLeader desktop sidebar empty, or admin at-camp sidebar wrong | `navModel`/`navSidebar` (single source) — NOT `_renderWideNav`'s old per-role lists (deleted). |
| Bottom tabs ≠ sidebar items | both derive from `navModel` now; fix it there (D3). |
| Accommodation group counts wrong / no 7-9·10-12 split | `accomGroups`/`_accomGenderGroups` (SPA) + `computeGroups`/`groupsForGender` (backend, tested). Split triggers at pool >50; leaders halved (ceil→7-9). SPA now includes leaders in the pool (was camper-only). |
| First/last camp day has wrong check-in sessions | `checkin-sessions.buildSessions` (AC-1): day1 PM-only, last AM-only. Tested in `checkin-sessions.test.ts`. |
| "Signed out" filter / record missing on Notes | `RENDER.notes`/`drawNotes` — synthesised from camper `signOutHistory` (atCamp:false). |
| FAQ showing in at-camp | `RENDER.faq` guards `CAMP_MODE==='at-camp'`→home; no at-camp home FAQ tile; Help only a pre-camp tab in `navModel` (PC-7). |
| Compliance export downloads broken / serves HTML | `sw.js` `API_RE` must include `/export` (fixed since `camp-v4`; current cache is **`camp-v13`**). If the workbook itself 500s, see the audit-workbook row below (illegal sheet name). |
| Church can't / shouldn't see allocated room | SPA `renderHomeAtCamp` church tile — gated `campMode==='at-camp' && !PREVIEW_MODE`; backend `GET /accommodation/church-rooms/:churchId` |
| Pre-camp registrant edits / scoping | SPA `RENDER.people` (841) `scopeRegs` (878) `markReg` (925) |
| Testimony won't save / "no specific student" | SPA `RENDER.testimonies` (1556); backend `note.service` (`camperId` optional) + `notes.camper_id` nullable |
| Account: can't rename / change password / username | SPA `RENDER.adminAccounts` (1649) row actions — **rename+username merged into one "Account Info" modal** (`editLeaderName`/`editChurchName`, 2026-07-02; `editUsername` deleted); backend `POST /accounts/users/password` + `account.service` |
| **Accommodation override not applied / applied to a leader** | Set in the church **Account Info** modal (`editChurchName`/`saveChurchName` → `PATCH /accounts/churches/:id {accommodationOverride}`); applied ONLY to students, ONLY at CSV import — backend `import.service` `churchOverrideById` (tested). Column `churches.accommodation_override` (migration 016). |
| **At-camp student edit table wrong / add-student fails** | SPA `RENDER.adminStudents`/`stuSave`/`stuCreate` (~2955); backend `registrant.controller` PATCH (accepts churchId/churchName/zone + medical/dietary strings), `person.service.create/update`. New students are `registered` (NOT at camp) by design — they sign in via First-day arrivals. |
| **Import: file detected as the wrong type / rejected as unknown / Excel won't read** | SPA **redesigned 2026-07-02 (late)** — the segmented `IMPORT_SOURCES`/`setImportSource` picker is GONE. One field auto-detects each file by headers: `_detectImportType`/`_IMPORT_SIGNATURES` (add a column marker here if a real export isn't recognised), `_parseHeaderRow`, `adminUpload`→`_renderImportPreview`→`_confirmImport`, unknowns via `_renderImportUnknown`. Files run Form→Ticket→Invoice (`IMPORT_TYPES[...].order`). Excel: `_readImportFile`→`_ensureXlsx` (lazy-loads `public/vendor/xlsx.full.min.js`)→`_xlsxToCsv`. "last imported" line = `_loadImportStamps` (settings `*_imported_at`, stamped by `src/api/controllers/_import-stamp.ts`). |
| Import CSV issues (Form) | SPA `_confirmImport`/`adminUpload` / church import; backend `import.service` (church match by **name**). Ticket accommodation "blank" = the Ticket List was imported before/without a matching Form (rows → needsReview orphans); the combined upload auto-orders Form first. |
| **Audit workbook download 500 / "unexpected error"** | `audit-export.service.ts` — worksheet names cannot contain `* ? : \ / [ ]`. `'Sign-in/Sign-out Log'` had a `/` and threw on `addWorksheet` (fixed 2026-07-02: `'Sign-in & Sign-out Log'`). Covered by `audit-export.service.test.ts`. First-aid records are their own `First-Aid Records` sheet. |
| **First-aid: tapping a student (Search or All Students) doesn't open the profile** | SPA `openStudentInfo`/`openFirstAidLog` must paint the ACTIVE first-aid screen via `_faScreen()` — hard-coding `'search'` made `paint()`'s stale-guard drop the render when on the `allstudents` screen (fixed 2026-07-02). Back button = `_faBackExpr(scr)`. |
| **Import: Ticket List / Invoice row not matching an existing person** | backend `person-matching.ts` `findPersonMatch` first — check name normalization/Levenshtein threshold; then the source-specific service (`ticket-import.service.ts` cross-church, `invoice-import.service.ts` tiered invoiceNumber→billing-name). Real header names are unconfirmed — check the field-mapping table in the design spec before assuming the matching logic is at fault. |
| **Import: a record has a "Needs review" badge that won't go away / accommodation "Guessed" pill looks wrong** | SPA Data tab `reviewCell`/`openReviewModal`/`_markReviewed` and `accomCell` (~3030, `RENDER.data`/`dataApply`); "Mark reviewed" PATCHes `needsReview:false` only — it does **not** fix/merge the record, that's still a manual edit. `accommodationKindConfidence` set by backend `ticket-import.service.ts` (always `'confirmed'`) or `invoice-import.service.ts` (`'guessed'`, via `buildAccommodationPriceLookup`). |
| New-year / reset / wipe guard | SPA `adminCloseOut`/`doNewYear` (1843/1867), `adminReset` (2038); backend `admin.service` |
| 403 / permission denied | backend `access-control.ts` (one file) |
| 401 / kicked to login | SPA `sessionExpired` (429) `api()` (357); check `SESSION_SECRET` env |
| **Login "Invalid credentials" for every failure (can't tell why a login fails)** | Working as designed (2026-07-03 enumeration hardening) — `auth.service.login` returns the SAME `Invalid credentials` for wrong username / inactive / passwordless / wrong password, and runs an equal-cost dummy scrypt (`DUMMY_PASSWORD_HASH`) so timing doesn't reveal account existence. To distinguish causes when debugging, check the user row directly (`status`, `passwordHash != null`), not the login response. |
| **"Too many login attempts" (429 on login)** | `express-adapter.ts` `loginLimiter` + `loginKeyOf` — 10 FAILED attempts per **ip+username** per 15 min (2026-07-02 rework; successes don't count, so shared camp WiFi can't lock the site out). Per-instance in-memory — a retry a minute later often lands on a fresh instance. |
| **Every request slow (~1s+) even on good WiFi** | `vercel.json` `"regions": ["syd1"]` must be present — without it functions run in iad1 (US East) while Supabase is in Sydney and every query pays a trans-Pacific round trip. |
| **Church / zone leader can't log in ("disabled by the camp administrator")** | Working as designed — admin toggled a login lock in **Settings** (`churchLoginLocked` / `zoneLeaderLoginLocked`). Backend check is `auth.service.login` (after the password). Locks block **new logins only**; existing sessions persist to the 12h TTL. admin/director/firstAid never blocked. Toggles: `RENDER.adminSettings`/`saveSettings`. |
| **Home/dashboard shows stale numbers for up to ~30s after a write** | `src/services/dashboard-cache.ts` (30s TTL). Check the write path called `invalidateDashboardCache()` — if a NEW write path was added that touches people/churches/notifications/settings and isn't in the list in CLAUDE.md ("Security & perf hardening ported from CMS"), add the call there. Never disable the cache to "fix" this — invalidate on write instead. |
| **A church/zone login sees another church's/zone's dashboard numbers** | Check `dashboard-cache.ts`'s cache key — it MUST be `${role}:${churchId ?? '_'}:${zone ?? '_'}`. If someone "simplified" the key (e.g. dropped churchId/zone), that's the bug — covered by `dashboard.service.test.ts` → "dashboard response cache" → the two scoping tests. |
| **Browser console shows a CSP violation / a resource silently fails to load** | `public/index.html` `<head>` `Content-Security-Policy` meta tag — a new external resource (font, script, API host) needs an allowlist entry there, not a workaround. The vendored SheetJS (`public/vendor/xlsx.full.min.js`) is same-origin so `script-src 'self'` already covers it. CSP also has `frame-ancestors 'none'` (2026-07-02). Bump `sw.js` `CACHE` (currently **`camp-v13`**) whenever `index.html` changes. |
| **Response security headers (HSTS / COOP / CORP / no-store / X-Powered-By)** | Set in `src/api/http/express-adapter.ts` (2026-07-02): `x-powered-by` disabled; HSTS (prod only), `Cross-Origin-Opener-Policy` + `Cross-Origin-Resource-Policy: same-origin`, and `Cache-Control: no-store` on all API/export responses (static assets served by `express.static` stay cacheable). Google Fonts are unaffected (CORP governs our own responses). |
