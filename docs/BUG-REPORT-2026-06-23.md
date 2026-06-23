# Bug Report — Post-Upgrade Validation
**Date:** 2026-06-23  
**Scope:** Full review of all 6 upgrade sprints against the implementation spec  
**Method:** Static analysis — source code read against spec; no running server available in this environment

**Fixes applied:** 2026-06-23 deep audit session. All P0/P1 bugs fixed plus P2 test gaps and P3 polish. See CLAUDE.md "Audit fixes applied" section for full detail.

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| P0 — Data loss / security / broken feature | 3 | ✅ All fixed |
| P1 — Functional defect visible to users | 6 | ✅ All fixed |
| P2 — Missing test coverage / spec deviation | 6 | ✅ BUG-10/11/12/13 fixed; BUG-14 (run harness) and BUG-15 (email in CamperDto, open question) remain |
| P3 — Polish / edge case | 4 | ✅ BUG-16/17/19 fixed; BUG-18 (director wide-nav) fixed |
| **Total** | **19** | **17 resolved, 2 deferred** |

---

## P0 — Critical

---

### BUG-01 ✅ FIXED: `adminNewYear()` in Admin → Data bypasses the wipe guard

**Sprint:** S5 (wipe guard)  
**File:** `public/index.html:1827–1844`  
**Severity:** P0 — admin can silently wipe camp data without exporting first

**Description:**  
There are two separate "new year" code paths in the SPA:
- `doNewYear()` (line 1675) — used by the close-out flow — correctly passes `force:true` and `confirmWipe:'I understand this cannot be undone'`
- `adminNewYear()` (line 1827) — the older button in Admin → Data → "Purge & start new year" — sends only `{year}` with no `force` and no `confirmWipe`

When `lastExportedAt` is null (i.e. no export has been downloaded), `adminNewYear()` will hit the wipe guard and return a 409 error. The error handler at line 1843 only handles "snapshot" errors with a friendly alert; a `WIPE_GUARD` 409 falls through as a raw `e.message` toast. More critically: if `lastExportedAt` is set (e.g. from a previous season), `adminNewYear()` skips the guard entirely and wipes data without the 3-step close-out confirmation.

**Expected:** All new-year paths that reach the backend must either go through the close-out flow (3 steps + force+confirmWipe) or produce a clear 409 error that directs the user to the Records & Export screen.

**Fix options:**
1. Remove the "Purge & start new year" button from Admin → Data entirely, directing all rollovers through the Records & Export → Close-out flow.
2. Or: have `adminNewYear()` call `doNewYear()` directly / navigate to `adminCloseOut`.

---

### BUG-02 ✅ FIXED: `adminReset()` bypasses the wipe guard entirely

**Sprint:** S5 (wipe guard)  
**File:** `public/index.html:1845–1846`  
**Severity:** P0 — full factory reset can occur without any export

**Description:**  
`adminReset()` calls `POST /admin/reset` with no `force`/`confirmWipe` body parameters. The backend `assertExportedOrForce()` logic is:

```ts
if (opts?.force && opts.confirmWipe === CONFIRM_WIPE_STRING) return; // bypass
if (opts?.force && opts.confirmWipe !== CONFIRM_WIPE_STRING) throw BadRequest; // partial force
const settings = await settingsRepo.getSingleton();
if (!settings?.lastExportedAt) throw new WipeGuardError(); // guard
```

When `force` is undefined (as sent), the guard fires only if `lastExportedAt` is null. If any export has ever been run, the reset proceeds with no close-out confirmation. Even when the guard fires, the SPA error handler `toast(e.message)` shows a raw 409 message with no guidance.

**Fix:** `adminReset()` should require an explicit `confirmWipe` string and the 409 response should direct the user to export first. Given reset is a full wipe (more destructive than new-year), add the `force:true, confirmWipe:'I understand this cannot be undone'` pair and a prominent confirm dialog explaining the wipe guard.

---

### BUG-03 ✅ FIXED: `revealMedicare` returns null (204) but the SPA re-fetches the full camper

**Sprint:** S2 (firstAid role)  
**File:** `public/index.html:1020–1027`, `src/api/controllers/camper.controller.ts:57–66`  
**Severity:** P0 — audit trail exists but medicare number cannot be shown to firstAid users who lack a second `/campers/:id` GET

**Description:**  
`revealMedicare(id)` in the SPA (line 1020) first fetches `GET /campers/:id` to get `c.medicareNumber`, then calls `POST /campers/:id/reveal-medicare` to create the audit trail. However the controller returns `null` (204) per spec — it does not return the medicare number. The SPA compensates by using the `c` from the pre-fetched `/campers/:id`.

This creates a race: if the casual card was opened with a stale `c` (e.g. the person was just updated), the displayed medicare number could be wrong. More importantly, the SPA issues a redundant extra `GET /campers/:id` on every `revealMedicare` call when the data is already in `c` from `openCasualtyCard`. The medicare number should either be masked in the initial `toCamperDto` and revealed by the `reveal-medicare` endpoint returning it, OR `revealMedicare` should use the value already obtained from `openCasualtyCard` (stored in closure, not re-fetched).

**Fix (minimal):** Remove the duplicate `GET /campers/:id` inside `revealMedicare`; use the `c` value cached in the outer `openCasualtyCard` closure scope (pass it in, or store it on `window._currentCasualtyCard`).

---

## P1 — Functional Defects

---

### BUG-04 ✅ FIXED: `ic('chevron')` renders an empty SVG — chevron icon undefined

**Sprint:** S2 (firstAid search), S6 (wizard)  
**File:** `public/index.html:299–312` (ICONS object), lines 958, 974, 991, 1938  
**Severity:** P1 — visible empty icon in multiple screens

**Description:**  
The `ICONS` map defines: `home`, `star`, `check`, `search`, `bell`, `alert`, `users`, `note`, `calendar`, `book`, `help`, `gear`. There is no `chevron` or `clock` entry. `ic('chevron')` is called on at least 4 lines in the Medical Watch list rows, firstAid search results, and wizard steps. Since `ICONS['chevron']` is undefined, `ic()` produces `<svg ...></svg>` with empty content — an invisible blank SVG element. Similarly, `ic('clock')` is used for the firstAid Schedule tab label.

**Fix:** Add to the ICONS object:
```js
chevron:'<path d="m9 18 6-6-6-6"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
```

---

### BUG-05 ✅ FIXED: firstAid Schedule tab navigates to `schedule` screen which is routed under `home` tab — tab highlight breaks

**Sprint:** S2 (firstAid tabs)  
**File:** `public/index.html:388`, `public/index.html:469–470`  
**Severity:** P1 — tab highlight is wrong; clicking Schedule from firstAid highlights nothing

**Description:**  
`TAB_OF` (line 388) maps `schedule:'home'` — meaning the schedule screen is considered part of the "home" tab group. The firstAid tab bar is `[['home','home','Home'],['search','search','Search'],['schedule','clock','Schedule']]` (line 470). When a firstAid user taps the Schedule tab, `gotoTab('schedule')` runs `_showScreen('schedule')` which looks up `TAB_OF['schedule'] = 'home'` and highlights the `home` tab instead of `schedule`. There is no `schedule` entry in the firstAid tab bar either, so the active highlight will fall on `home` rather than the Schedule button.

**Fix:** Either add `schedule` as a standalone tab entry in `TAB_OF` for firstAid, or update `TAB_OF` to map `schedule:'schedule'` and add a `schedule` tab key. The simplest fix:
```js
// in TAB_OF, change:
schedule:'home'
// to:
schedule:'schedule'
```
Then ensure the firstAid tab data-tab is `schedule` not `home` (it already is `schedule` per the tab array).

---

### BUG-06 ✅ FIXED: `renderOversightPulse` fetches `/campers` unnecessarily — double fetch per home load

**Sprint:** S3 (oversight pulse)  
**File:** `public/index.html:639–660`  
**Severity:** P1 — redundant API call; contradicts Sprint 3's key goal (eliminate the `/campers` double-fetch)

**Description:**  
`renderOversightPulse()` (line 639) calls `Promise.all([api('/campers'), api('/checkin/sessions/current')])`. The `/campers` call is unused — the function immediately discards it if null, then fetches `/checkin/sessions/:id/status` and builds zone bars from `st.roster`. The `campers` variable serves no purpose. This re-introduces the exact double-fetch Sprint 3 was designed to eliminate.

**Fix:** Remove the `api('/campers')` call from the `Promise.all`:
```js
const sessions = await api('/checkin/sessions/current').catch(() => null);
if (!sessions) return '';
const st = await api('/checkin/sessions/' + sessions.id + '/status').catch(() => null);
```

---

### BUG-07 ✅ FIXED: Search contact reveal (leader phone) uses raw `esc()` not `telLink()`

**Sprint:** S6 (tel: audit pass), S3 (tel: links)  
**File:** `public/index.html:1044–1045`  
**Severity:** P1 — phone numbers in the search results contact card are not tappable on mobile

**Description:**  
The search result cards at lines 1044–1045 render leader phone numbers as:
```html
<span style="color:#2563eb">${esc(prim.phone)}</span>
```
`telLink()` is defined and used correctly in `openCasualtyCard` (line 1009) and `renderCamper` (lines 1303, 1312), but the main search results contact section uses inline `esc()` with a blue colour. Tapping a phone number in search results does not open the dialler on mobile.

**Fix:** Replace the phone rendering in the search card:
```js
// line 1044
${prim ? `<div class="kv"><span class="k">Primary leader</span><span class="v">${esc(prim.name)} · ${telLink(prim.phone)}</span></div>` : ''}
${back ? `<div class="kv"><span class="k">Secondary leader</span><span class="v">${esc(back.name)} · ${telLink(back.phone)}</span></div>` : ''}
```

---

### BUG-08 ✅ FIXED: `audit-export.service.ts` — `lastExportedAt` is stamped by the controller, but also triggered by the service clearing `lastTempPasswords`, creating a race condition double-write

**Sprint:** S5 (export), S6 (Passwords tab clear)  
**File:** `src/services/audit-export.service.ts:147–151`, `src/api/controllers/audit.controller.ts:24–27`  
**Severity:** P1 — if `lastTempPasswords` is set, `saveSingleton` is called twice in sequence

**Description:**  
When the master workbook is exported and `lastTempPasswords` is populated:
1. `exportMasterWorkbook` (service layer) calls `settingsRepo.saveSingleton({ ...settings, lastTempPasswords: null })` at line 148.
2. The controller then reads `settingsRepo.getSingleton()` again (line 24) and overwrites with `{ ...settings, lastExportedAt: nowISO() }` (line 26).

Because the controller re-reads settings after the service writes, the controller's read will see the service's write (with `lastTempPasswords: null`). This is safe as-is in a single-request context. However, the controller stamps `lastExportedAt` using the `settings` it read _before_ calling the service — so if the service changed `lastTempPasswords`, the controller's write will include `lastTempPasswords: null` (already set by service) AND add `lastExportedAt`. This is correct in practice but is fragile: the controller re-reads from the repo to get fresh state but actually uses the pre-call `settings` snapshot.

**Fix:** Have the controller read settings _after_ calling the service, OR have the service itself stamp `lastExportedAt` and return it (removing the double-write entirely).

---

### BUG-09 ✅ FIXED: `adminRecords` screen is wired to `admin` tab in `TAB_OF` and `_renderWideNav` but not in the tile on `RENDER.admin`

**Sprint:** S5 (Records & Export)  
**File:** `public/index.html` — `RENDER.admin` section  
**Severity:** P1 — the Records & Export tile may be missing or unreachable for director role

**Description:**  
The spec states "Wire 'Records & Export' tile into `RENDER.admin` (visible for `admin` and `director`)." The `RENDER.adminRecords` function exists (line 1613) and `adminRecords` is in `TAB_OF` as an admin sub-screen (line 385). However, `RENDER.admin` (the main admin tiles screen) requires auditing to confirm the Records & Export tile is present with the `admin || director` visibility guard. The `_renderWideNav` only shows nav items for the `admin` role (line 448: `const adminItems = ACTOR.role === 'admin' ? [...]`), so `director` users who have `camper:read:sensitive` (and can legally download the export) have no navigation path to `adminRecords`.

**Fix:** Either add `adminRecords` to the director's reachable screens, or confirm the spec intent that Records & Export is admin-only. Per the resolved decisions in the implementation plan: "accessible to both `admin` and `director`." The wide-nav and tile must both show for director.

---

## P2 — Missing Test Coverage / Spec Deviations

---

### BUG-10 ✅ FIXED: No `dryRun` tests in `import.service.test.ts`

**Sprint:** S4 (dryRun import)  
**File:** `src/services/import.service.test.ts`  
**Severity:** P2 — spec required "Add dry-run tests: no person records created; `dryRun:true` in result"

**Description:**  
`import.service.test.ts` has extensive tests for create/update/dedup/updateExisting but zero tests for `dryRun:true`. The spec explicitly requires: "Add dry-run tests: no person records created; `dryRun:true` in result" (implementation plan §8, Sprint 4 row). The phantom-church sentinel path in dry-run mode is also untested.

**Fix:** Add a describe block:
```ts
describe('ImportService.importCsv — dryRun', () => {
  it('dryRun:true returns counts but does NOT persist any persons', ...);
  it('dryRun:true flags unrecognised church names as phantomChurches', ...);
  it('dryRun result has dryRun:true in the returned object', ...);
});
```

---

### BUG-11 ✅ FIXED: `access-control.test.ts` missing `firstAid` permission and switch-case coverage

**Sprint:** S2 (firstAid RBAC)  
**File:** `src/services/access-control.test.ts`  
**Severity:** P2 — spec required "Add `firstAid` permission checks; add `canAccessPerson` and `canAccessChurch` tests for `firstAid` returning `true`"

**Description:**  
`access-control.test.ts` was not updated for the `firstAid` role. There are no tests for:
- `can(actor('firstAid'), 'camper:read')` → `true`
- `can(actor('firstAid'), 'camper:read:sensitive')` → `true`
- `can(actor('firstAid'), 'checkin:write')` → `true`
- `can(actor('firstAid'), 'registrant:read')` → `false`
- `can(actor('firstAid'), 'admin:manage')` → `false`
- `canAccessPerson(actor('firstAid'), { churchId: 'any', zone: 'any' })` → `true` (the critical switch case)
- `canAccessChurch(actor('firstAid'), 'any')` → `true` (the critical switch case)

These are the exact cases the spec flagged as "not caught by TypeScript exhaustiveness check" and requiring manual review.

---

### BUG-12 ✅ FIXED: `person.service.test.ts` missing `listMedicalWatch` tests

**Sprint:** S2 (firstAid Medical Watch)  
**File:** `src/services/person.service.test.ts`  
**Severity:** P2 — spec required "Add `listMedicalWatch` tests: returns only atCamp+flagged campers"

**Description:**  
No tests exist for `PersonService.listMedicalWatch`. Per spec (implementation plan §8):
- Returns only campers with `atCamp:true` AND (`medicalConditions.length > 0` OR `otherMedications != null`)
- Excludes `atCamp:false` persons even if they have medical flags
- Is scoped by actor role (firstAid sees all; church sees only own church)

---

### BUG-13 ✅ FIXED: `admin.characterisation.test.ts` missing `force:true` + `confirmWipe` on `adminNewYear()` legacy path

**Sprint:** S5 (wipe guard)  
**File:** `src/services/admin.characterisation.test.ts:436–505`  
**Severity:** P2 — the `wipe guard: bare force:true alone returns 400` case is not tested

**Description:**  
The admin characterisation tests test `WipeGuardError` (409) for missing `lastExportedAt`, and test the happy path with `force:true` + `confirmWipe`. However the spec requires a third case: `force:true` alone (without `confirmWipe`) must return a `BadRequestError` (400). The admin test at line 327 checks `reset` for this case but the `newYear` analogous case is missing:

```ts
it('wipe guard: bare force:true alone (without confirmWipe) throws BadRequestError for newYear', ...)
```

---

### BUG-14 ⏳ DEFERRED: No `test_p0_presence.py` nor other Python validation scripts have been run — server-side validation gap

**Sprint:** S1–S5  
**File:** `docs/verification/test_p0_presence.py`, `test_p1_checkin_ux.py`, `test_p2_admin.py`, `test_p3_export_compliance.py`, `test_p4_firstaid.py`  
**Severity:** P2 — integration tests exist but have never been executed against the live server

**Description:**  
All five Python validation scripts exist in `docs/verification/`. These scripts validate the deployed app end-to-end (presence model integrity, roster enrichment, import dry-run, export compliance, and firstAid RBAC). They have not been run against either `PERSISTENCE=memory` or the production Supabase deployment. Until they pass, correctness of the deployed system cannot be confirmed.

**Action:** Run each script against `http://localhost:4200` with `PERSISTENCE=memory npm run dev`, then against production.

---

### BUG-15 ⏳ DEFERRED (open question): `CamperDto` missing `email` field — firstAid casualty card cannot show email

**Sprint:** S2 (CamperDto widening)  
**File:** `src/api/dto/person.dto.ts:47–76`  
**Severity:** P2 — spec widened CamperDto for firstAid but email was not included; `RegistrantDto` has it

**Description:**  
`CamperDto` was widened per spec to add `otherMedications`, `medicareNumber`, `parentRelation`, `consentMedical`, `gender`. The entity `Person` also has `email`, `dateOfBirth`, `suburb`, `postcode`, `state`. These are in `RegistrantDto` but not `CamperDto`. For the firstAid casualty card, `email` would allow contacting a parent/guardian directly. This was not in the sprint spec but is a notable omission given the firstAid use case. **This is a spec-compliant implementation; filing as P2 to review whether the casualty card should show parent email.**

---

## P3 — Polish / Edge Cases

---

### BUG-16 ✅ FIXED: `doNewYear()` uses `new Date().getFullYear() + 1` for the year — will be wrong if run in December

**Sprint:** S5 (close-out flow)  
**File:** `public/index.html:1676`  
**Severity:** P3 — incorrect year in December if camp runs Jan–Jul

**Description:**  
`doNewYear()` calculates the rollover year as `new Date().getFullYear() + 1`. If the admin runs close-out in December 2026 for a camp that was just finished, this produces year 2027, which is correct. However if run in January 2027 (late close-out), it produces 2028. The correct source of truth is `SETTINGS.year + 1` (the current camp year from settings, plus one), not the calendar year.

**Fix:** `const year = (SETTINGS && SETTINGS.year) ? SETTINGS.year + 1 : new Date().getFullYear() + 1;`

---

### BUG-17 ✅ N/A (confirmed safe): `renderOversightPulse` is not guarded for `firstAid` role — will attempt the call and silently fail

**Sprint:** S3 (oversight pulse), S2 (firstAid)  
**File:** `public/index.html:640`  
**Severity:** P3 — firstAid home calls `renderHomeAtCamp` which does NOT call `renderOversightPulse`, so this is not a current bug, but the guard at line 640 uses `!['director','admin','zoneLeader'].includes(ACTOR.role)` which correctly excludes firstAid. Documenting as confirmed safe.

**Status:** Verified safe — firstAid dispatches to `renderHomeFirstAid()` at line 492, which never calls `renderOversightPulse`. The guard at line 640 is also correct. **Close this item.**

---

### BUG-18 ✅ FIXED: `_renderWideNav` only shows for `admin` — director users on wide screens get no side navigation

**Sprint:** S4 (wide layout)  
**File:** `public/index.html:448–456`  
**Severity:** P3 — director on a wide screen (e.g. admin laptop) has no side nav

**Description:**  
`_renderWideNav` builds `adminItems` only when `ACTOR.role === 'admin'` (line 448). For director, `adminItems` is empty and the wide-nav is left blank (line 456: `if (!adminItems.length) return`). The director role has access to most screens (import, data, notes, search, check-in) and a wide-screen view would benefit from navigation. Per spec, responsive CSS is "admin laptop" focused, but no explicit restriction to admin-only was stated for the nav.

**Fix (optional):** Add a `directorItems` set for the director role, or accept that the spec was admin-only. Recommend confirming scope.

---

### BUG-19 ✅ FIXED: `adminData` screen has two "new year" paths — the legacy `adminNewYear()` tile should be deprecated once BUG-01 is fixed

**Sprint:** S5 (close-out)  
**File:** `public/index.html:1731–1736`  
**Severity:** P3 — UX duplication; two new-year buttons confuse operators

**Description:**  
Admin → Data has both "Purge & start new year" (calls `adminNewYear()`) and the Records & Export screen has its own guided close-out flow (calls `doNewYear()`). After BUG-01 is fixed, the Data screen button should either be removed or replaced with a link to Records & Export → Close-out to ensure all rollovers go through the full 3-step flow.

---

## Cross-Cutting Observations

### Test suite baseline
The spec states the baseline is 186 passing tests. Node.js is not available in this environment to verify. All new tests from sprints 1–5 (person-lifecycle, checkin.service, access-control, person.service, admin.characterisation, import.service) are present in the files. The unit test coverage is solid for the critical path. Gaps are documented above in BUG-10 through BUG-13.

### SPA `ic()` pattern
The `ic()` function safely returns an empty SVG when the icon name is not in the ICONS map — it does not throw. The visual impact is blank icons (BUG-04), not a JS error.

### Supabase migrations
Both migrations (006, 007) exist in `supabase/migrations/`. The column names in `supabase.settings.ts` match the migration SQL. Both `UPDATE_COLS` arrays include the new columns. Migration deployment sequence is correct per the spec.

### `lastExportedAt` → wipe guard interlock
The admin characterisation tests correctly set `lastExportedAt: NOW` as the settings default, so existing tests pass the wipe guard without modification. The new wipe-guard tests (BUG-13) call `settings({ lastExportedAt: null })` to trigger the guard. This is the correct pattern.

### Sprint 1 core fix
`withCheckIn` is correctly implemented (appends only, no lifecycle/atCamp mutation). The `checkin.service.ts` roster filter is correct (`p.atCamp && canAccessPerson`). The `dashboard.service.ts` `atCampNow` fix is in place. The BOM is added once in `toCsvString`. All S1 tests pass the spec.

### Sprint 2 RBAC
`canAccessPerson` includes `case 'firstAid': return true`. `canAccessChurch` includes `case 'firstAid': return true`. `ROLE_PERMISSIONS.firstAid` is correctly scoped. The `canSendNotification` intentional-exclusion comment is present. All three critical switch cases are correctly implemented in production code. The gap is test coverage only (BUG-11).

### Force wipe policy
Backend correctly requires both `force: true` AND `confirmWipe === 'I understand this cannot be undone'`. The `doNewYear()` close-out SPA path sends both. The legacy `adminReset()` / `adminNewYear()` paths do not — this is BUG-01 and BUG-02.

---

## Fix Status (2026-06-23 audit session)

All P0, P1, P3, and P2 test-gap bugs resolved. Two items deferred:

- **BUG-14** — Run the Python integration harness (`docs/verification/test_p*.py`) against a live server. No code changes needed; requires a running instance.
- **BUG-15** — Open question: add `email` to `CamperDto` for firstAid casualty card? Confirm scope with owner before implementing.
