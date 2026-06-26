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

## Frontend — `public/index.html` (single ~2,260-line SPA)

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
`SCHED_DAY` (~1519), `DEVO_DAY` (~1533), `_pendingChurchCsv` (~2100).

### Infrastructure / plumbing
| Symbol | ~Line | Owns |
|---|---|---|
| `_doFetch` / `api` | 338 / 357 | All HTTP. Bare results, throws on non-2xx. **Preview write-guard** lives in `api()`. Timeout + GET coalescing + **30s result cache**; non-GET writes call `_invalidate`. |
| `Cache` / `_allCached` / `_invalidate` / `_prefetch` | 313 / 322 / 325 / 375 | **Perf layer (ported from CMS).** Cache = 30s TTL Map; `_prefetch` warms endpoints after login; `_invalidate` maps a write path → stale keys. **Stale data after a write = `_invalidate` mapping.** |
| `sessionExpired` | 429 | 401 handling (clears Cache) |
| `ICONS` / `ic` | 394 / 414 | SVG icon set + renderer (incl. `edit/at/key/trash` for account rows). **Blank icon = missing key here.** |
| `toast / modal / closeModal` | 422–424 | Transient UI |
| `dayLong / timeFmt / dtFmt` | 425 | Date formatting (UTC-anchored). `_addDays / _datesBetween` near `adminSettings` derive check-in days. |
| `_initDemoLogin / quick` | 444 / 451 | Demo quick-login (localhost only) |
| `doLogin / logout` | 452 / 467 | Auth. `doLogin` clears Cache + calls `_prefetch`; `logout` clears PREVIEW_MODE first. |

### Navigation / shell
| Symbol | ~Line | Owns |
|---|---|---|
| `updateModeUI` | 473 | Preview banner + mode chrome |
| `enterPreview / exitPreview` | 483 / 491 | Client-only at-camp preview (no backend) |
| `TAB_OF` | 505 | Tab-id → highlighted-tab map. **Wrong tab highlighted = here.** |
| `_showScreen / _paint / _navTo / go / gotoTab / back` | 513–554 | Router. `_navTo` is **stale-while-revalidate**: shows the previous render (no spinner) on revisits. |
| `_renderWideNav` | 567 | Desktop sidebar items (**admin & director only**) |
| `buildTabs` | 605 | Bottom-nav tabs per role × mode. **Missing/extra tab = here.** |

### Home (dispatch at `RENDER.home`, line 629)
`RENDER.home` → firstAid? `renderHomeFirstAid` (1112). Else re-fetches `/settings` **only when
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
| `RENDER.budget / RENDER.accom` | 1235 / 1268 |
| `RENDER.data` (director/admin data view) | 1958 |

> **`RENDER.codes` (registration code / self-register) was DELETED** — self-registration is gone
> (all registrants arrive via CSV). No reg-code screen, home card, or `/r/:slug` link.

### At-camp screens
| Screen / fn | ~Line | Notes |
|---|---|---|
| `RENDER.checkin` | 981 | Daily session check-in. `_ciLabel` 936, `CHECKIN_QUEUE` 946, `drainQueue` 956, `_optimisticState` 975, `rowHtml` 1013. **Sessions = `settings.checkInDays`×AM/PM** (id `${day}~am`), NOT schedule — see backend `checkin-sessions.ts`. The status path `encodeURIComponent`s the id (the `~` delimiter replaced `#`, which broke the URL → "Endpoint not found"). |
| `_performCheck / confirmCheckOut / doCheck` | 1052 / 1062 / 1086 | Optimistic flip + undo (`undoCheck` 1075) |
| `notePrompt` | 1087 | Check-in notes |
| `renderHomeFirstAid` | 1112 | firstAid home |
| `loadMedicalWatch` | 1129 | Medical-watch list |
| `renderSearchFirstAid` | 1140 | |
| `openCasualtyCard / revealMedicare` | 1156 / 1183 | `revealMedicare` uses `_currentCasualtyCard` (no re-fetch) |
| `RENDER.search / runSearch / reveal` | 1193 / 1198 / 1215 | Contact search + reveal |
| `RENDER.notifs / deleteNotice` | 1218 / 1230 | Notices |
| `RENDER.compose / sendNotif` | 1302 / 1317 | Send notice (zoneLeader/director/admin) |
| `RENDER.firstday` | 1328 | Day-1 arrivals (sign-in) |
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
| `RENDER.adminAccom` (+ saveBlock/delBlock/addBlock) | 1753 / 1773–1775 |
| `RENDER.adminFaq / adminFaqEdit` | 1778 / 1791 |
| `RENDER.adminRecords` | 1805 |
| `RENDER.adminCloseOut` (+ `doNewYear`) | 1843 / 1867 |
| `RENDER.adminSettings / saveSettings` | 1891 / 1916 |
| ⮑ **Timezone hardcoded** to Australia/Brisbane (field removed); check-in days **auto-derived** from start/end via `_datesBetween`; `renderCheckinDaysPreview`/`onStartDateChange` (start pre-fills end +3 days). | — |
| `RENDER.adminData` (+ `adminReset` 2038, `adminClear` 2053) | 1926 |
| `RENDER.import / adminUpload / _confirmImport` | 1947 / ~2030 / 2078 |
| `RENDER.adminChurchImport` (+ `_renderChurchImportPreview`/`_confirmChurchImport`) | 2091 / 2101 / 2119 |
| `RENDER.adminWizard` | 2138 |
| `RENDER.adminDevos / saveDevo` | 2153 / 2168 |
| `RENDER.adminSchedEdit` — **per-day table** (`_schedRow` 2172, `addSchedRow` 2193, `saveSchedDay` 2197 = source-of-truth replace). No location, no `isCheckInPoint`. | 2176 |
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
| `firstAid` | Home · Search · Schedule (**same in both modes**) | Home · Search · Schedule |

**Desktop wide sidebar** (`_renderWideNav`, line ~567) — only **admin** and **director** get items
(`zoneLeader` gets wide layout but empty sidebar):
- **admin:** Home, Check-in, Search, Notes, Accounts, Settings, Accommodation, Schedule, Data & Reset, Church Import, Records & Export, Setup Wizard
- **director:** Home, Check-in, Search, Notes, Import Students, Records & Export

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
| CSV import | `src/services/import.service.ts`, `church-import.service.ts` | import dropping/duplicating rows, dry-run. Churches match/create by **name** (no `code`). |
| Reset / new-year / defaults / **mode** | `src/services/admin.service.ts` | wipe behaviour, snapshot restore, mode switch |
| Accounts / churches | `src/services/account.service.ts` | login, account CRUD, sole-admin guard |
| Accommodation | `src/services/accommodation*.ts` | blocks/reservations/held, lock |
| Search / contact reveal | `src/services/search.service.ts` | search results, reveal audit |
| Audit / export | `src/services/audit-export.service.ts` | export CSV, lastExportedAt |
| Supabase repos | `src/repositories/supabase/*` | prod-only data round-trip issues |
| Types / Zod schemas / errors | `src/core/*` | validation rejects valid input |

Verification: `npm run typecheck` (clean) · `npm run test` (vitest, 219+ pass). Note the two
deploy-only gotchas in CLAUDE.md (CommonJS tsconfig; anchored `/data/` gitignore) — neither is
caught by tsc/vitest. Schema migrations `008`–`010` (field removals + nullable note camper) are
applied to prod; `src/repositories/supabase/*` must not reference the dropped columns.

---

## Symptom router (fastest path)

| Symptom | Go to |
|---|---|
| Blank / wrong icon | SPA `ICONS` (394) |
| Wrong tab highlighted | SPA `TAB_OF` (505) |
| Tab missing/extra for a role or mode | SPA `buildTabs` (605) / `_renderWideNav` (567) — check grid above |
| **Stale data after a write / screen won't refresh** | SPA `Cache` (313) + `_invalidate` (325) — the write's path must map to the right stale keys. `{noCache:true}` forces fresh. |
| Slow home / spinner flash on revisit | SPA `_prefetch` (375), `_navTo` stale-while-revalidate (537), parallel loads in `RENDER.home` (629) |
| Write silently blocked, "preview" toast | SPA `api()` preview guard (357) + `enterPreview` (483) |
| **Preview at-camp view won't load** | SPA `RENDER.home` `/settings` re-fetch is guarded by `if(!PREVIEW_MODE)` (~636); `enterPreview` (483) |
| Mode change didn't reach a logged-in user | SPA `RENDER.home` `/settings` re-fetch (~636, skipped in preview); backend `admin.service` |
| **Check-in "Endpoint not found" / session 404** | SPA `RENDER.checkin` (981) — status path must `encodeURIComponent` the id; session-id delimiter is `~` (NOT `#`). Backend `checkin-sessions.ts` `parseSessionId`. |
| "No check-in sessions configured" | backend `checkin-sessions.ts` `buildSessions` — driven by `settings.checkInDays` (set via admin Settings dates), NOT the schedule |
| Check-in count / roster wrong | SPA `RENDER.checkin` (981) + `_optimisticState` (975); backend `checkin.service` / `dashboard.service` / `person.service` (atCamp scoping) |
| Check-in tap doesn't stick / undo broken | SPA `CHECKIN_QUEUE` (946) `drainQueue` (956) `_performCheck` (1052) `undoCheck` (1075) |
| Sign-in/out wrong (atCamp/lifecycle) | SPA `signOut/InConfirm` (1485/1509); backend `person.service.signEvent` + presence invariants in CLAUDE.md |
| Search / reveal contact | SPA `runSearch` (1198) `reveal` (1215); backend `search.service` |
| First-aid medical watch / casualty card | SPA `loadMedicalWatch` (1129) `openCasualtyCard` (1156) `revealMedicare` (1183); backend `person.service.listMedicalWatch` |
| Notices not showing / urgent popup | SPA `RENDER.notifs` (1218); `renderHomeAtCamp` (713) |
| Accommodation / budget numbers | SPA `RENDER.accom` (1268) `RENDER.budget` (1235); backend `accommodation*` |
| Pre-camp registrant edits / scoping | SPA `RENDER.people` (841) `scopeRegs` (878) `markReg` (925) |
| Testimony won't save / "no specific student" | SPA `RENDER.testimonies` (1556); backend `note.service` (`camperId` optional) + `notes.camper_id` nullable |
| Account: can't rename / change password | SPA `RENDER.adminAccounts` (1649) row actions; backend `POST /accounts/users/password` + `account.service` |
| Import CSV issues | SPA `_confirmImport` (2078) / church import (2091+); backend `import.service` (church match by **name**) |
| New-year / reset / wipe guard | SPA `adminCloseOut`/`doNewYear` (1843/1867), `adminReset` (2038); backend `admin.service` |
| 403 / permission denied | backend `access-control.ts` (one file) |
| 401 / kicked to login | SPA `sessionExpired` (429) `api()` (357); check `SESSION_SECRET` env |
