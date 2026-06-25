# debug.md — Youth Camp Platform debugging map

> Companion to `CLAUDE.md`. Point Claude at **both** files when reloading context for a bug.
> CLAUDE.md = system/architecture/contract. This file = "where does this symptom live?"
> Don't duplicate CLAUDE.md here — it already covers the SPA↔backend contract, presence
> invariants (atCamp vs lifecycle), RBAC model, camp-mode behaviour, and deploy gotchas.

## How to use this file (per bug set)

1. Read `CLAUDE.md` + this file. **Don't read anything else yet.**
2. From the **symptom router** below, jump to the one function/file that owns it.
3. **Confirm line numbers by Grep on the symbol name** — line numbers here are approximate
   (snapshot 2026-06-25) and drift as the file changes. The *names* are stable; grep them.
4. Read only that function's range. Most SPA bugs are one function in `public/index.html`.

> **Don't re-grep the whole map on reload** — line numbers only drift when `index.html` is
> edited, and the per-symbol grep in step 3 self-corrects where the current bug is.
> **Maintenance rule:** when a fix shifts offsets in `index.html`, update the affected line
> numbers in this file *as part of that fix*, so the map is correct at the next reload.

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

## Frontend — `public/index.html` (single 2,128-line SPA)

This one file is the only real navigation cost in the repo. Map below; **grep the name to
confirm the line**.

### Global state (line ~315)
`TOKEN, ACTOR, SETTINGS, CAMP_MODE('pre-camp'), STACK, PREVIEW_MODE` — one declaration line.
Also: `ALLREG/CHURCHES` (~759), `_navToken` (~461), `SCHED_DAY` (~1450), `DEVO_DAY` (~1465),
`_pendingImportCsv` (~1945).

### Infrastructure / plumbing
| Symbol | ~Line | Owns |
|---|---|---|
| `_doFetch` / `api` | 284 / 303 | All HTTP. Bare results, throws on non-2xx. **Preview write-guard** lives in `api()`. Request timeout + GET coalescing. |
| `sessionExpired` | 359 | 401 handling |
| `ICONS` / `ic` | 328 / 344 | SVG icon set + renderer. **Blank icon = missing key here.** |
| `toast / modal / closeModal` | 352–354 | Transient UI |
| `dayLong / timeFmt / dtFmt` | 355–357 | Date formatting (UTC-anchored) |
| `_initDemoLogin / quick` | 373 / 380 | Demo quick-login (localhost only) |
| `doLogin / logout` | 381 / 395 | Auth. `logout` clears PREVIEW_MODE first. |

### Navigation / shell
| Symbol | ~Line | Owns |
|---|---|---|
| `updateModeUI` | 401 | Preview banner + mode chrome |
| `enterPreview / exitPreview` | 414 / 422 | Client-only at-camp preview (no backend) |
| `TAB_OF` | 436 | Tab-id → highlighted-tab map. **Wrong tab highlighted = here.** |
| `_showScreen / _paint / _navTo / go / gotoTab / back` | 444–480 | Router |
| `_renderWideNav` | 493 | Desktop sidebar items (**admin & director only**) |
| `buildTabs` | 531 | Bottom-nav tabs per role × mode. **Missing/extra tab = here.** |

### Home (dispatch at `RENDER.home`, line 555)
`RENDER.home` → firstAid? `renderHomeFirstAid` (1043). Else re-fetches `/settings` (picks up
admin mode switch live), then pre-camp home (inline) vs `renderHomeAtCamp` (633).
- `renderHomeAtCamp` 633, `noticeCard` 677, urgent-notice popup `_checkUrgentNoticesFromFeed` 703,
  `renderMyDay` 723, `renderOversightPulse` 731 (async, no `/campers` fetch — uses session DTO).

### Pre-camp screens
| Screen / fn | ~Line |
|---|---|
| `RENDER.people` (My Youth) | 761 |
| `scopeRegs / drawPeople / personRow` | 798 / 799 / 812 |
| `openPerson / markReg` | 826 / 845 |
| `RENDER.codes` (reg codes) | 848 |
| `RENDER.help` | 860 |
| `RENDER.budget / RENDER.accom` | 1166 / 1199 |
| `RENDER.data` (director/admin data view) | 1848 |

### At-camp screens
| Screen / fn | ~Line | Notes |
|---|---|---|
| `RENDER.checkin` | 912 | Daily session check-in. `_ciLabel` 867, `CHECKIN_QUEUE` 877, `drainQueue` 887, `_optimisticState` 906, `rowHtml` 944 |
| `_performCheck / confirmCheckOut / doCheck` | 983 / 993 / 1017 | Optimistic flip + undo (`_showUndoToast` 999, `undoCheck` 1006) |
| `notePrompt / reviewNote / confirmNote` | 1018 / 1026 / 1037 | Check-in notes |
| `renderHomeFirstAid` | 1043 | firstAid home |
| `loadMedicalWatch` | 1060 | Medical-watch list |
| `renderSearchFirstAid` | 1071 | |
| `openCasualtyCard / revealMedicare` | 1087 / 1114 | `revealMedicare` uses `_currentCasualtyCard` (no re-fetch) |
| `RENDER.search / runSearch / reveal` | 1124 / 1129 / 1146 | Contact search + reveal |
| `RENDER.notifs / deleteNotice` | 1149 / 1161 | Notices |
| `RENDER.compose / sendNotif` | 1233 / 1248 | Send notice (zoneLeader/director/admin) |
| `RENDER.firstday` | 1259 | Day-1 arrivals (sign-in) |
| `RENDER.myyouth` | 1336 | Leader's youth roster |
| `openCamper` | 1380 | Camper detail |
| `signOutPrompt/Review/Confirm`, `signInPrompt/Confirm` | 1416–1446 | **Attendance** (writes atCamp/lifecycle) |
| `RENDER.schedule` | 1451 | `selSchedDay` 1462 |
| `RENDER.devotional` | 1466 | `selDevoDay` 1479 |
| `RENDER.faq` | 1482 | |
| `RENDER.testimonies / submitTestimony` | 1488 / 1500 | |
| `RENDER.notes / drawNotes / exportNotes` | 1504 / 1519 / 1533 | |

### Admin screens (admin role; identical in both modes)
| Screen / fn | ~Line |
|---|---|
| `RENDER.admin` (console) | 1541 |
| `switchMode` | 1561 |
| `RENDER.adminAccounts` (+ add/edit/save/del acct, churches) | 1579–1655 |
| `RENDER.adminAccom` (+ block CRUD) | 1655–1677 |
| `RENDER.adminFaq / adminFaqEdit` | 1680 / 1693 |
| `RENDER.adminRecords` (+ `downloadAuditExport`, `downloadCsvExport`) | 1707–1734 |
| `RENDER.adminCloseOut` (+ `doNewYear`) | 1745 / 1769 |
| `RENDER.adminSettings / saveSettings` | 1790 / 1806 |
| `RENDER.adminData` (+ `adminNewYear`, `adminReset`, `adminClear`) | 1816–1943 |
| `RENDER.import / adminUpload / _confirmImport` | 1837 / 1946 / 1968 |
| `RENDER.adminChurchImport` (+ upload/confirm) | 1981–2009 |
| `RENDER.adminWizard` | 2028 |
| `RENDER.adminDevos / saveDevo` | 2043 / 2058 |
| `RENDER.adminSchedEdit` (+ add/edit/save/del sched) | 2061–2090 |
| `RENDER.adminContacts / saveContacts` | 2093 / 2106 |

---

## Role × mode → what should appear (check expected vs actual first)

**Bottom-nav tabs** (`buildTabs`, line 531):

| Role | pre-camp | at-camp |
|---|---|---|
| `church` | Home · My Youth · Help · Notices | Home · Check-in · Search · Notices |
| `zoneLeader` | Home · My Youth · Help · Notices | Home · Check-in · Search · Notices |
| `director` | Home · My Youth · **Data** · Help · Notices | Home · Check-in · Search · Notices |
| `admin` | Home · My Youth · **Data** · Notices · **Admin** | Home · Check-in · Search · **Admin** |
| `firstAid` | Home · Search · Schedule (**same in both modes**) | Home · Search · Schedule |

**Desktop wide sidebar** (`_renderWideNav`, line 493) — only **admin** and **director** get items
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
| Dashboard / session status / roster counts | `src/services/dashboard.service.ts` | wrong "checked-in"/"still due" counts, roster contents |
| CSV import | `src/services/import.service.ts`, `church-import.service.ts` | import dropping/duplicating rows, dry-run |
| Reset / new-year / defaults / **mode** | `src/services/admin.service.ts` | wipe behaviour, snapshot restore, mode switch |
| Accounts / churches | `src/services/account.service.ts` | login, account CRUD, sole-admin guard |
| Accommodation | `src/services/accommodation*.ts` | blocks/reservations/held, lock |
| Search / contact reveal | `src/services/search.service.ts` | search results, reveal audit |
| Audit / export | `src/services/audit-export.service.ts` | export CSV, lastExportedAt |
| Supabase repos | `src/repositories/supabase/*` | prod-only data round-trip issues |
| Types / Zod schemas / errors | `src/core/*` | validation rejects valid input |

Verification: `npm run typecheck` (clean) · `npm run test` (vitest, 186+ pass). Note the two
deploy-only gotchas in CLAUDE.md (CommonJS tsconfig; anchored `/data/` gitignore) — neither is
caught by tsc/vitest.

---

## Symptom router (fastest path)

| Symptom | Go to |
|---|---|
| Blank / wrong icon | SPA `ICONS` (328) |
| Wrong tab highlighted | SPA `TAB_OF` (436) |
| Tab missing/extra for a role or mode | SPA `buildTabs` (531) / `_renderWideNav` (493) — check grid above |
| Write silently blocked, "preview" toast | SPA `api()` preview guard (303) + `enterPreview` (414) |
| Mode change didn't reach a logged-in user | SPA `RENDER.home` `/settings` re-fetch (555); backend `admin.service` |
| Check-in count / roster wrong | SPA `RENDER.checkin` (912) + `_optimisticState` (906); backend `dashboard.service` / `person.service` (atCamp scoping) |
| Check-in tap doesn't stick / undo broken | SPA `CHECKIN_QUEUE` (877) `drainQueue` (887) `_performCheck` (983) `undoCheck` (1006) |
| Sign-in/out wrong (atCamp/lifecycle) | SPA `signIn/OutConfirm` (1438–1446); backend `person.service.signEvent` + presence invariants in CLAUDE.md |
| Search / reveal contact | SPA `runSearch` (1129) `reveal` (1146); backend `search.service` |
| First-aid medical watch / casualty card | SPA `loadMedicalWatch` (1060) `openCasualtyCard` (1087) `revealMedicare` (1114); backend `person.service.listMedicalWatch` |
| Notices not showing / urgent popup | SPA `RENDER.notifs` (1149) `_checkUrgentNoticesFromFeed` (703) |
| Accommodation / budget numbers | SPA `RENDER.accom` (1199) `RENDER.budget` (1166); backend `accommodation*` |
| Pre-camp registrant edits / scoping | SPA `RENDER.people` (761) `scopeRegs` (798) `markReg` (845) |
| Import CSV issues | SPA `_confirmImport` (1968) / church import (1981+); backend `import.service` |
| New-year / reset / wipe guard | SPA `adminCloseOut`/`doNewYear` (1745/1769), `adminReset` (1928); backend `admin.service` |
| 403 / permission denied | backend `access-control.ts` (one file) |
| 401 / kicked to login | SPA `sessionExpired` (359) `api()` (303); check `SESSION_SECRET` env |
