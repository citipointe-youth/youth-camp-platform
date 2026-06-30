# PHASE-5-REMEDIATION-PLAN.md — ordered build steps

> Companion to `docs/PHASE-5-REMEDIATION-DESIGN.md`. Each step has its verification inline. Work
> top-down. Tick as completed. No push/deploy.

## Step 1 — B-2 SESSION_SECRET fail-fast (backend)
- [x] 1.1 `src/services/auth.service.ts`: export `assertSessionSecret()` that throws when
      `NODE_ENV==='production'` and the secret is unset/equals `INSECURE_FALLBACK`.
- [x] 1.2 `src/app.ts`: call `assertSessionSecret()` at the top of `createAppInstance()` (before
      `buildContainer`).
- [x] 1.3 `src/services/auth.service.test.ts`: 4 cases (prod+unset → throws; prod+fallback → throws;
      prod+real secret → ok; non-prod → ok). Save/restore `process.env` per case.
- [x] 1.4 Verify: `node --experimental-strip-types --check` on `auth.service.ts`, `app.ts`,
      `auth.service.test.ts`.

## Step 2 — B-1 check-in unsynced/failed banner (SPA)
- [x] 2.1 `public/index.html`: add `_checkinFailed` counter; increment it in the `drainQueue()`
      online-error branch (alongside the existing red-dot mark).
- [x] 2.2 Add a `_retryFailedCheckins()` helper: clears `_checkinFailed`, re-runs `drainQueue()`,
      toasts "Re-tap any row still showing red".
- [x] 2.3 `RENDER.checkin`: render the banner when `CHECKIN_QUEUE.length>0 || _checkinFailed>0`
      (amber "N syncing…" / red "N didn't save — tap to retry").
- [x] 2.4 Add a small CSS rule for the banner (token colours only, no new hex).
- [x] 2.5 `public/sw.js`: bump cache `camp-v5`→`camp-v6`.
- [x] 2.6 Verify: extract `<script>` and `node --check`; backtick-parity scan.

## Step 3 — B-3 cross-tab mode sync (SPA)
- [x] 3.1 `RENDER.home`: on a successful `/settings` fetch, `localStorage.setItem('ycp_campmode', …)`
      with the resolved mode (only when not previewing).
- [x] 3.2 BOOT: `window.addEventListener('storage', …)` — on `ycp_campmode` change, if logged in &&
      !PREVIEW_MODE && mode differs: update `CAMP_MODE`, mirror onto `SETTINGS`, `updateModeUI()`,
      `buildTabs()`, and `gotoTab('home')` if the current screen is gone in the new mode.
- [x] 3.3 BOOT: `document.addEventListener('visibilitychange', …)` — on visible && logged in &&
      !PREVIEW_MODE, re-fetch `/settings` and apply the same trio if mode changed.
- [x] 3.4 Verify: `node --check` on the script; confirm preview-mode guard present.

## Step 4 — B-4 cache-invalidation tuning (SPA)
- [x] 4.1 `public/index.html` `_invalidate`: `/import*` → drop `/home,/registrants,/campers,
      /accommodation,/checkin` (not full clear); `/settings` → `/settings,/checkin` (drop the
      `/schedule` clear); `/schedule` → `/schedule` only (drop the `/checkin` clear). Inline comment
      citing the schedule↔check-in de-link.
- [x] 4.2 Verify: `node --check`.

## Step 5 — M-1 / M-2 / M-3 visual (CSS)
- [x] 5.1 M-1: consolidate the two `.iconbtn` rules into one (32×32 visual, ≥44px tappable); audit
      `.tab`/`.sign-out`/`.seg button`, document any spot where 44px isn't achievable.
- [x] 5.2 M-2: `--t-micro` `.58rem`→`.7rem`; flag `--t-2xs` for eyeball.
- [x] 5.3 M-3: swap exact-match solid-fill `#ede9fe` → `var(--chip)` in `.tab.on`, `.seg`, `.bar7`,
      `.wide-nav-item:hover` (leave gradient stops/one-offs).
- [x] 5.4 Verify: `node --check`; visual delta noted for on-device eyeball.

## Step 6 — L-1 dead tokens + reset copy (CSS / copy)
- [x] 6.1 Delete the 9 confirmed-dead tokens from `:root` (`--s1/--s5/--s6/--s7`, `--r-lg`,
      `--shadow`, `--amber`, `--green`, `--ok`). Re-grep to confirm zero references first.
- [x] 6.2 `adminReset()`: sharpen the `confirm()` copy (spell out churches + accounts + scaffold);
      keep the typed gate + backend contract unchanged.
- [x] 6.3 Verify: `node --check`; re-grep the deleted tokens = 0 references.

## Step 7 — Close out
- [x] 7.1 `CHANGELOG.txt`: remediation entry under the Phase-5 section.
- [x] 7.2 `docs/PROGRAM-LOG.md`: append a Phase-5 remediation note (built vs deferred, files, handoff).
- [x] 7.3 Final sweep: `node --check` all changed `.ts` + SPA; backtick parity; deploy gotchas
      (CommonJS tsconfig; anchored `/data/`); confirm nothing pushed/deployed.
