# Design spec & plan — bug/feature batch (2026-06-25)

Account: admin · Mode: pre-camp. Source: 11 reported items. Decisions captured from the
requester are inline. Deploy contract: push to `master` → auto-deploys to production
(my-youth-camp.vercel.app); prod Supabase ref `nwfafrgojqkxylbppywo`. On any verification
failure: **ship the passing subset**, leave the rest committed/branched with a summary.

---

## A. Performance (#1) — DESIGN

**Finding:** the SPA *already has a persistent shell.* Header `.bar` is static HTML updated in
place (`updateModeUI`, `_paint`); the tab bar is built only by `buildTabs()` on login/mode-change;
screens are pre-rendered `<section class="screen">` toggled by `.active`; the CMS nav-token
stale-render guard (`_navToken`/`_stale`) and spinner-on-nav are already ported. So **no
shell refactor is required** — that removes the large regression surface that was the concern.

What's missing vs Connection Made Simple (the cause of slowness):
1. **No client-side result cache.** `api()` has in-flight GET coalescing (`_inflight`) but no
   cross-navigation cache, so every revisit re-fetches and re-spins.
2. **No `_prefetch()`** after login to warm common endpoints.
3. **No `_allCached()` spinner-skip** — a spinner shows even when data is already known.
4. **`RENDER.home` runs sequential awaits** (`/settings`→`/home`→`/registrants`→
   [`/accounts/churches`]→`/notifications`) and re-fetches `/settings` on *every* home visit.

**Design (port CMS patterns, low risk):**
- Add a `Cache` object (Map, 30s TTL) with `get/getStale/set/del/clear`, mirroring CMS.
- Wrap GET results in `api()`: on a cache hit return synchronously-resolved data; on miss fetch,
  store, return. Non-GET writes call `Cache.del(prefix)` for affected resources, then bypass.
- `_prefetch()` after `buildTabs()` in `doLogin()`: fire-and-forget GETs for `/settings`,
  `/home`, `/registrants`, `/notifications`, `/accounts/churches` (pre-camp) /
  `/checkin/...` (at-camp).
- `_allCached(...paths)` → render functions skip the spinner and paint immediately when all
  paths are warm (`Cache.get` non-null).
- `RENDER.home`: `Promise.all` the independent fetches; use `Cache.getStale('/settings')` for
  instant paint then revalidate. Keep the live mode-switch behaviour but **guard it so it never
  runs while `PREVIEW_MODE`** (see #5).
- Bump `sw.js` cache name so clients pick up the new shell JS.

Invalidation map (write path → keys to drop): accounts/churches → `/accounts`,`/home`;
settings → `/settings`,`/home`; schedule → `/schedule`,`/checkin`; notifications →
`/notifications`; import → broad `Cache.clear()`.

---

## B. Check-in ⟂ schedule de-link (#4 + #11) — DESIGN

**Today:** check-in sessions = `scheduleRepo.getCheckInPoints()` (schedule items with
`isCheckInPoint:true`); `CheckInSession.id === scheduleItem.id`; `checkInHistory` keyed by that id.
This couples the schedule editor to the daily check-in.

**Target:** the two are unrelated. Schedule = pure plan communication. Daily check-in = an
**auto AM + PM session per camp day**, generated from `settings.checkInDays`, suiting leaders'
morning/afternoon rhythm.

**Design:**
- `checkin.service.ts`: replace schedule dependency with synthetic sessions derived from
  `settings.checkInDays`. For each day `D` emit two sessions with **stable ids** `D#am` / `D#pm`,
  labels `Mon AM` / `Mon PM`, `startTime` `08:00`/`13:00`. `getCurrentSession()` picks AM before
  12:00 (camp tz), else PM, for today; falls back to the last session. `getSessionStatus(id)`
  validates the synthetic id shape instead of reading the schedule.
- `dashboard.service.ts`: today's sessions + `checkInsDue` now come from the synthetic source.
- `schedule.ts` entity + `schedule.service.ts`: drop `isCheckInPoint` (schedule items are plain
  plan rows). `scheduleRepo.getCheckInPoints()` removed.
- Frontend: `_ciLabel` simplified (label is already `Mon AM`); the per-item check-in checkbox is
  gone from the schedule editor (#11). Check-in screen reads `/checkin/sessions` unchanged in
  shape.
- **Data note:** pre-camp has no check-in history yet, so changing session-id format orphans
  nothing live.

---

## C. Full-removal impact (#9 churches + #3 settings) — see prose assessment

Remove from churches: `code`, `self_register_slug`, `expected_count`, `youth_pastor_name`,
`contact_email` (keep `name`, separate login `username`, `contact_phone`, `contacts`).
Remove from settings: `check_in_location`, `check_in_from`, `register_base_url`. Self-registration
goes entirely (all registrants arrive via CSV): delete `RENDER.codes`, the church-home
"Registration code" card, `findByCode`/`findBySlug`, `takenCodes`.

**Safe prod migration order** (because `code`/`self_register_slug` are `unique not null`):
1. `008a`: drop those UNIQUE constraints + `DROP NOT NULL` (back-compatible).
2. Deploy code that no longer reads/writes the 8 columns.
3. `008b`: `DROP COLUMN IF EXISTS` ×8.

If Supabase migration access to the ref isn't available, ship code with columns left nullable and
hand the SQL over.

---

## D. The smaller fixes
- **#2** nav "gap below": `.app{height:100dvh}` leaves dark body bg below the bar on mobile.
  Fix: robust full-height (`100dvh`/`100svh`) so `#tabs` sits flush; verify visually.
- **#5** preview: `RENDER.home` reverts `CAMP_MODE` from `/settings`. Guard the re-fetch with
  `if(!PREVIEW_MODE)`.
- **#6** preview banner overlaps island: banner is the topmost element with no safe-area padding.
  Add `padding-top:max(8px,env(safe-area-inset-top))` (and stop the header double-padding when
  the banner shows).
- **#7** remove `#barSearch` from the header (all roles/modes).
- **#8** account rows for leadership **and** church logins: one row per account with icon actions
  — edit name · edit username · change password (`POST /accounts/users/password`) · delete — plus
  an icon **legend** at the top. New ICONS: `key`, `trash`, `at` (username), reuse `note`/add
  `edit` (pencil).
- **#10** ministry contacts: collapsible card per church (drop body on click), header shows
  `n/4 Contacts` (filled = contact with a non-empty name).
- **#11** schedule: per-day table, 10 blank rows by default, "Add row", one "Save day" that makes
  the table the **source of truth** (create/update filled rows, delete cleared ones). Columns:
  Time, Title. No location.

## Build/verify/deploy
`npm run typecheck` (clean) + `npm run test` (186+). Commit in logical groups. When green: push
`master`, then apply `008a`/`008b`. Ship passing subset on any blocker.
