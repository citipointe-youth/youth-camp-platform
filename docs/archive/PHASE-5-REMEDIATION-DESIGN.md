# PHASE-5-REMEDIATION-DESIGN.md — design for the accepted Phase-5 items

> **Context:** `docs/PHASE-5-SIXHATS-REVIEW.md` surfaced a set of open issues; the owner chose which
> to build now (see that doc's "Owner decisions (locked 2026-06-30)" table). This is the **design**
> (what & why) for those accepted items. The ordered build steps are in
> `docs/PHASE-5-REMEDIATION-PLAN.md`.
> **Date:** 2026-06-30.
> **Already done in Phase 5 proper (not repeated here):** C-1 (migration `013` + bracket
> persistence), H-1 (round-trip test), H-2 (shared current-session helper), JWT_SECRET removal.
> **Constraints:** no npm/dev-server/browser; verify by reasoning + `node --check`
> (`--experimental-strip-types` for TS) + written tests; preserve CommonJS `tsconfig` + anchored
> `/data/`; **no push/deploy** (Phase 7 ships).

---

## Build order & rationale

Security/correctness first, then UX, then perf, then visual/cleanup — so the riskiest changes land
and verify while context is fresh, and the purely-cosmetic churn is last (and isolated).

1. **B-2** SESSION_SECRET fail-fast (backend, security)
2. **B-1** check-in unsynced/failed banner (SPA, data-trust)
3. **B-3** cross-tab mode sync (SPA, UX)
4. **B-4** cache-invalidation tuning (SPA, perf)
5. **M-1 / M-2 / M-3** visual (CSS)
6. **L-1** dead-token deletion + **reset copy** (CSS / copy)

---

## B-2 — SESSION_SECRET fail-fast

**Problem.** `auth.service.ts:18-27` falls back to an in-source constant `INSECURE_FALLBACK` when
`SESSION_SECRET` is unset and only `console.error`s in production. A constant anyone can read from the
source signs forgeable tokens for **any role**.

**Design.**
- Add a single exported guard `assertSessionSecret()` in `auth.service.ts` that throws when
  `process.env['NODE_ENV'] === 'production'` **and** the effective secret is unset or equals
  `INSECURE_FALLBACK`. Keep the existing `console.error` for the non-fatal (non-prod) case.
- Call it from the **composition path** `createAppInstance()` (`src/app.ts`) — the single function
  both `src/index.ts` (local/server) and `api/index.ts` (Vercel serverless) go through. This means a
  misconfigured serverless deploy fails the cold-start init (surfaced by `api/index.ts`'s existing
  `getApp().catch` → 500), and a misconfigured server fails to boot (surfaced by `index.ts`'s
  `main().catch` → exit 1). One call site covers both.
- **Why not throw at module load** (the top-level `if` in `auth.service.ts`)? A throw at import time
  is harder to test and would also fire in any tooling that merely imports the module. A named
  function called from the known startup path is testable and explicit.

**Contract change.** In production with no `SESSION_SECRET`, the app now **refuses to start** instead
of starting insecurely. Non-production is unchanged (dev fallback still works, with the warning).
Prod already sets the var, so this is defence-in-depth — no behaviour change for a correct deploy.

**Files.** `src/services/auth.service.ts` (export `assertSessionSecret`), `src/app.ts` (call it
before building routes). **Test:** `src/services/auth.service.test.ts` — add cases: throws when
`NODE_ENV=production` + secret unset; throws when it equals the fallback; does **not** throw when a
real secret is set; does **not** throw outside production. (Save/restore `process.env` around each.)

**Risk.** Low. The only way to regress a correct prod deploy is to remove the env var, which is
exactly what we want to catch.

---

## B-1 — Check-in unsynced / failed banner (banner only)

**Problem.** `drainQueue()` (index.html ~L1192) hard-drops an entry on any online error (red dot
only); the queue is in-memory so a tab close loses pending entries. The owner chose **banner only**:
make the state *visible*, keep current behaviour.

**Design.**
- Track two counts derived from existing state, no new persistence:
  - **unsynced** = `CHECKIN_QUEUE.length` (entries still waiting to drain — pending or offline).
  - **failed** = a new in-memory counter `_checkinFailed`, incremented in the `catch` branch where an
    online error currently drops the entry (the same line that marks the red dot). Reset to 0 at the
    start of a user-initiated drain cycle that empties the queue cleanly, and surfaced until then.
- Render a compact banner inside `RENDER.checkin` (it already re-renders after every drain via
  `await RENDER.checkin()`), shown only when `unsynced>0 || failed>0`:
  - `unsynced>0`: amber "**N syncing…**" (informational — they will drain).
  - `failed>0`: red "**N didn't save — tap to retry**", where tapping re-queues the failed entries.
    Because we keep the "no persistence" decision, *retry* means: the failed entries that are still
    represented in `_lastRoster` as not-in can simply be re-tapped; to keep it honest and simple, the
    retry action **re-runs `drainQueue()`** (a no-op if empty) and clears the failed counter, with a
    toast telling the user to re-tap any row still showing red. (We do **not** silently reconstruct
    lost entries — that would over-promise given no persistence.)
- Add a tiny CSS class for the banner (reuse existing token colours, no new hex).

**Contract change.** Purely additive UI: a banner appears when there is unsynced/failed state. No
change to when entries drain or drop. Honest about the limitation (the red banner tells the user to
re-tap), which is the point of the "banner only" choice.

**Files.** `public/index.html` (`drainQueue` failed-counter; `RENDER.checkin` banner markup; a small
CSS rule), `public/sw.js` (cache bump `camp-v5`→`camp-v6` so the new SPA ships).

**Risk.** Low. Self-contained in the check-in screen; the banner derives from existing state. Eyeball
on device (animated states, offline→online transition).

---

## B-3 — Cross-tab mode sync

**Problem.** `CAMP_MODE` is a global; `RENDER.home` re-syncs from `/settings` only on home
navigation. A second tab (or a tab not on home) keeps stale pre-camp/at-camp nav after an admin mode
switch until the user navigates home. No cross-tab signalling.

**Design.**
- On a successful `/settings` fetch in `RENDER.home`, write the resolved `campMode` (+ a timestamp) to
  `localStorage` under a key like `ycp_campmode`. (This is the natural cross-tab channel; the
  `storage` event fires in *other* tabs of the same origin.)
- In BOOT, add a `window.addEventListener('storage', …)` that, when `ycp_campmode` changes and the
  user is logged in and **not** in `PREVIEW_MODE`, updates `CAMP_MODE`, mirrors it onto `SETTINGS`,
  and calls `updateModeUI()` + `buildTabs()` — the same trio `RENDER.home` already uses. If the user
  is currently *on* an at-camp-only / pre-camp-only screen that no longer exists in the new mode,
  re-navigate home (`gotoTab('home')`) so they don't sit on a dead screen.
- Also re-sync on `visibilitychange`→visible (a tab brought to the foreground re-checks `/settings`
  via the same path `RENDER.home` uses) so a backgrounded tab corrects on focus even if it missed the
  storage event. Keep it cheap: only when logged in and not previewing.

**Contract change.** Additive. Writes one new `localStorage` key (`ycp_campmode`); never blocks. The
`PREVIEW_MODE` guard is preserved everywhere (preview must not snap out).

**Files.** `public/index.html` (`RENDER.home` writes the key; BOOT adds the two listeners).

**Risk.** Low. Read-only mismatch corrected; writes are server-authoritative regardless. Watch the
preview-mode interaction (must not drop a previewing user) — explicitly guarded.

---

## B-4 — Cache-invalidation tuning

**Problem.** `_invalidate` (index.html ~L495) over-clears: a `/settings` write also drops `/schedule`
+ `/checkin`, and any `/import*` write clears the **entire** cache. Causes re-fetch churn.

**Design.** Tighten the mappings to what genuinely goes stale, keeping `/home` (the aggregate) always
cleared:
- `/import*`: instead of `Cache.clear()`, drop the resources an import actually changes —
  `/home`, `/registrants`, `/campers`, `/accommodation` (groups/allocations depend on the people
  set), `/checkin` (roster derives from people). Leave unrelated caches (`/faq`, `/devotional`,
  `/notifications`, `/schedule`) intact. *(Still broad, but bounded and justified.)*
- `/settings`: keep `/settings`; drop `/checkin` **only** because check-in sessions derive from
  `settings.checkInDays` — that link is real, so **keep** it. Drop the **`/schedule`** clear:
  schedule is independent of settings (the de-link is documented in CLAUDE.md — "the schedule is
  unrelated to check-in"). So `/settings` → `Cache.del('/settings','/checkin')`.
- `/schedule`: a schedule write does **not** affect `/checkin` (de-linked). So
  `/schedule` → `Cache.del('/schedule')` only (drop the `/checkin` clear).
- Everything else unchanged.

**Contract change.** Behavioural only in that fewer caches are dropped per write — correctness is
preserved because each removed clear corresponds to a dependency that no longer exists (the
schedule↔check-in de-link) or never existed (import touching FAQ/devotionals). `/home` still always
clears, so the aggregate view never goes stale.

**Files.** `public/index.html` (`_invalidate`).

**Risk.** Low-medium — the failure mode of *under*-invalidation is a stale screen for ≤30 s (the
cache TTL). Mitigated by keeping `/home` always-clear and only removing clears tied to severed/absent
dependencies. Documented inline so a future reader sees the reasoning.

---

## M-1 / M-2 / M-3 — visual

**M-1 (touch targets).** `.iconbtn` has two competing rules: `:156` (`min-width/height:44px`) and
`:174` (`width/height:32px`). The `min-*` wins so the hit area is ~44px, but the declarations
contradict. **Design:** consolidate into one `.iconbtn` rule — visual box 32×32 (the intended look)
but guaranteed ≥44px tappable via padding or an explicit `min-width/min-height:44px` with the icon
centered; remove the duplicate. Audit `.tab`, `.sign-out`, `.seg button` for the ≥44px primary-touch
minimum and bump the ones used as primary actions (without breaking the bottom-nav layout — `.tab`
height is constrained by the tab bar, so document where 44px isn't achievable and ensure the tap
*row* is ≥44px).

**M-2 (type floor).** `--t-micro:.58rem` ≈ 9.3px at the 16px phone root — below the ~11px legibility
floor. **Design:** raise `--t-micro` to `.7rem` (≈11.2px @16px) — it's used on `.tab .tb` badge,
`.mode-badge`, `.hero .k`, tile badges, all of which stay legible larger. Check `--t-2xs:.66rem`
(≈10.6px) too; nudge to `.7rem` if it reads small on device (flag for eyeball rather than force).

**M-3 (token discipline).** Replace solid-fill hardcoded hex that duplicate `:root` tokens — chiefly
`#ede9fe` (= `--chip`/`--tint-2`) used as a solid background in `.tab.on` (`:93`), `.seg` (`:202`),
`.bar7` (`:119`), `.wide-nav-item:hover`, etc. **Design:** swap solid-fill duplicates for their
token (`var(--chip)`); leave gradient stops and one-off shades alone (defensible). Scope: only the
exact-match solid fills, to keep the change low-risk and reviewable.

**Contract change.** Visual only; values chosen to preserve the current look (±~1px type, identical
colours via token). **All need an on-device eyeball** (the brief defers layout verification to the
device).

**Files.** `public/index.html` (CSS block). **Risk:** low but visual — hence eyeball.

---

## L-1 — delete genuinely-dead tokens

**Problem.** The Phase-3 dead-token list drifted; several are now used. Verified zero-reference (only
their own `:root` definition, no `var(--x)` anywhere): **`--s1`, `--s5`, `--s6`, `--s7`, `--r-lg`,
`--shadow`, `--amber`, `--green`, `--ok`**. Keep the now-used ones: `--s2/--s3/--s4`, `--r-sm`, `--r`,
`--shadow-sm`, `--tint-2` (and `--amber`/`--green` palette note: confirm no JS reference before
deletion — done: none).

**Design.** Delete only the nine confirmed-dead tokens from `:root`. Do not touch any used token. This
removes "defined-but-unused" noise without churning live styles.

**Contract change.** None visible — deleted tokens have no references.

**Files.** `public/index.html` (`:root`). **Risk:** very low (greps confirm zero references).

---

## Reset confirmation copy

**Problem.** `adminReset()` (index.html ~L2574) confirms with "wipe ALL data and every non-admin
account" — accurate but could be blunter about *churches* specifically (the red-hat note).

**Design.** Sharpen the `confirm()` copy to spell out scope: wipes **every church, every account
(except this admin), all registrants, notes, and settings-scaffold** and cannot be undone. Keep the
existing typed-confirmation gate (`I understand this cannot be undone`) and the `force:true` +
`confirmWipe` backend contract **unchanged** — copy only.

**Contract change.** None functional; clearer warning text.

**Files.** `public/index.html` (`adminReset` confirm string). **Risk:** none (string change).

---

## Verification strategy (whole sub-phase)

- Backend (B-2): `node --experimental-strip-types --check` on every changed `.ts`; new
  `auth.service.test.ts` cases written for the real `vitest` run.
- SPA (B-1/B-3/B-4/M-*/L-1/reset): `node --check` on the `<script>` body (extract + check), and a
  backtick-parity scan on `index.html` to confirm no template structure was broken. `sw.js` cache
  bumped so the new SPA ships.
- Full `tsc --noEmit` + `vitest` remain gated in `DEPLOY-CHECKLIST §0` (no project `node_modules`).
- Deploy gotchas re-confirmed (CommonJS tsconfig; anchored `/data/`). Nothing pushed/deployed.
- **On-device eyeball list:** M-1/M-2/M-3 visual deltas; the check-in unsynced/failed banner
  (offline→online); cross-tab mode switch (two tabs); the reset confirmation copy.
