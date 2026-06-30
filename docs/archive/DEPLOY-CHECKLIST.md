# DEPLOY-CHECKLIST.md — the definitive redeployment runbook

> **Rewritten 2026-06-30 (Phase 7) as the single, ordered procedure** for shipping the whole 7-phase
> Improvement Initiative back into the live app. It supersedes the earlier Phase-1/Phase-4-only
> checklist. Deployment is intended to happen **ONCE**, after Phase 7. Follow the sections in order,
> top to bottom. Nothing in this initiative has been pushed or deployed yet.
>
> **Target repo:** `citipointe-youth/my-youth-camp` → push to `master` auto-deploys to Vercel
> (https://my-youth-camp.vercel.app), `PERSISTENCE=supabase`, Supabase ref `nwfafrgojqkxylbppywo`
> (Sydney). Context: `docs/PROGRAM-SUMMARY.md`, `docs/PROGRAM-LOG.md`, `CLAUDE.md`.
>
> **Authoring caveat:** every phase ran without a project toolchain (`node_modules`/`git` absent).
> All `.ts` and the SPA `<script>` parse clean under the Playwright-bundled Node v24, backtick parity
> holds (598), and every claim in the log reconciles against the working tree — but the **full `tsc`
> + `vitest` run in §0 is mandatory and has never been executed.** Do it on a real machine first.

---

## 0. Pre-flight — MANDATORY, on a machine with the toolchain

```bash
npm install
npm run typecheck      # tsc --noEmit (strict + noUncheckedIndexedAccess + noImplicitOverride)
npm run test           # vitest run
```

- [ ] **`npm run typecheck` is clean.** Files changed/added across the initiative that this must
      cover: `src/services/budget.ts`, `checkin-sessions.ts`, `accommodation-allocation.ts`,
      `accommodation.service.ts`, `dashboard.service.ts`, `access-control.ts`, `note.service.ts`,
      `auth.service.ts`, `config/env.ts`, `core/entities/accommodation.ts`,
      `repositories/supabase/supabase.allocation.ts`, `app.ts`, `api/http/router.ts`,
      `api/controllers/{note,search,settings}.controller.ts`.
- [ ] **`npm run test` is green.** New/extended suites to expect: `budget.test.ts`,
      `checkin-sessions.test.ts`, `note.service.test.ts`, `settings.controller.test.ts`,
      `auth.service.test.ts` (SESSION_SECRET fail-fast), `accommodation-allocation.test.ts`,
      `accommodation.characterisation.test.ts` (**C-1 3-part-key round-trip**),
      `dashboard.service.test.ts` (**H-2 12:30 case**), `access-control.test.ts` (firstAid/church
      first-aid matrix). The prior baseline was 202 tests; this initiative only adds.
- [ ] If typecheck flags a removed field: `unpaidCount`/`perChurchBreakdown.unpaid` were removed
      from `PreCampDashboard` (PC-3). None expected.

**Do not proceed past this section until both commands are clean/green.**

---

## 1. Supabase migrations — apply IN ORDER, before pushing

The original prod DB is already migrated through **`012`**. This initiative adds **exactly one** new
migration. Apply it to the production Supabase project (ref `nwfafrgojqkxylbppywo`) **before** the
`git push`, so the deployed code lands on a schema that already has the column.

- [ ] **`supabase/migrations/013_allocation_bracket.sql`** — the only new migration post-`010`.
      `alter table classroom_allocations add column if not exists bracket text;`
      Additive, idempotent, backward-compatible (existing rows get `bracket = null` = original 2-part
      key behaviour). This is what makes the **C-1** PC-10 split-allocation persistence fix work; the
      code is inert without it (split allocations would still silently drop).
- [ ] **No other migrations.** Phase 4 first-aid reuses `StudentNote.category` — no schema change.
      Tent/classroom-price columns are intentionally left in place (deprecated, unused). After this,
      the **next free migration number is `014`.**

Apply via the Supabase SQL editor or migration tooling against the production project, then confirm
the column exists:
```sql
select column_name from information_schema.columns
where table_name = 'classroom_allocations' and column_name = 'bracket';
```

---

## 2. Service worker — cache name is already bumped

- [ ] `public/sw.js` cache name is **`camp-v7`** (verified). Across the initiative it stepped
      v3→v4 (P1) →v5 (P4) →v6 (P5) →**v7 (P6)**. The bump is what forces clients to evict the old
      shell; without it the zone fix and all SPA changes never reach users.
- [ ] **Ship `sw.js` together with `public/index.html`** in the same push. The `controllerchange`
      listener in `index.html` auto-reloads open clients when the new SW activates.
- [ ] `API_RE` already covers every backend prefix the SPA calls (incl. `export`, `notes`, `search`).
      No change needed — but if you add a new top-level API route, add it here **and** bump the cache.

---

## 3. Environment / secrets (Vercel project env vars)

No env-var *changes* are required by this initiative, but the **B-2 fail-fast now enforces** what was
previously only advisory. Confirm before pushing:

- [ ] **`SESSION_SECRET`** is set to 32+ random bytes in the Vercel production env. As of Phase 5 the
      app **refuses to start in production** (`assertSessionSecret()` in `app.ts`) if this is unset or
      equals the insecure dev fallback — a misconfigured deploy will 500 on cold start rather than
      serve forgeable tokens. (Prod already sets it; verify it survived.)
- [ ] **`PERSISTENCE=supabase`** and **`DATABASE_URL`** = the Supabase **transaction-pooler** string
      (port 6543), not the IPv6-only direct host.
- [ ] **`NODE_ENV=production`** and **`CORS_ORIGINS`** locked to the exact site URL (not `*`).
- [ ] Do **not** set `JWT_SECRET` — it was removed as dead/misleading; session signing uses
      `SESSION_SECRET` only.

---

## 4. Do-NOT-regress guards (verify before push — neither is caught by tsc/vitest)

- [ ] **`tsconfig.json` still emits CommonJS** — `"module": "CommonJS"`, `"moduleResolution": "Node"`.
      Switching back to ESNext/Bundler makes `@vercel/node` crash with *"Cannot use import statement
      outside a module."* (Verified intact.)
- [ ] **`.gitignore` `/data/` rule still anchored** (leading slash). An unanchored `data/` also matches
      `src/data/`, silently dropping `src/data/seed.ts` from git → git auto-deploy fails with *"Cannot
      find module './data/seed'."* (Verified intact.)

---

## 5. Commit & push (the deploy)

The authoring env is **not** a git repo — initialise/stage/commit on your side, in a clone of the real
`citipointe-youth/my-youth-camp`.

- [ ] Copy the changed tree over your clone (or apply your diff). Changed surface: `public/index.html`,
      `public/sw.js`, the `src/**` files listed in §0, `supabase/migrations/013_allocation_bracket.sql`,
      `SECURITY-ACTIONS.md`, and the `docs/**` deliverables.
- [ ] Commit on a branch or directly to `master` per your workflow. Suggested message names this the
      **Improvement Initiative** (avoid colliding with the original CHANGELOG's 2026-06-22 "Phase 6:
      Deployment" — see `PROGRAM-SUMMARY.md §4`).
- [ ] **Migration `013` is applied (§1) before this push.**
- [ ] `git push origin master` → Vercel auto-deploys. No need to poll Vercel or curl prod to confirm
      it shipped.

---

## 6. Post-deploy smoke checks (per role + first-aid)

Open the live site once after deploy; the SW `controllerchange` auto-reload should pull fresh code
(hard-refresh once if you don't see `camp-v7` behaviour). Then walk these — ideally on a real phone
**and** a laptop, since CSS/layout changes can't be proven without a browser:

**Engineering maturity (Phase 1/2):**
- [ ] **Type scale & width:** resize 360→1440px — text scales up on laptop, the content column widens
      smoothly (no fixed 460px strip mid-range), grids gain columns, the 980px sidebar switches in.
      Nothing clipped/overlapping.
- [ ] **Icons:** no emoji anywhere; no blank SVGs (preview banner, search "Call", Student Info,
      first-day rows, budget rows, accommodation labels).
- [ ] **White header** at every width; **populated desktop sidebars** for church and zoneLeader.

**Per role:**
- [ ] **admin** — at-camp sidebar = Home, Check In, Search, Notices, Accommodation Allocations, Admin
      Settings. **Budget**: grand-total card; expand a church → CAMPERS then LEADERS rows
      (count×price = line); church + grand totals reconcile; Export CSV downloads; a registrant with
      no Cost shows "Cost not recorded". **Data screen** order: Upload, Save Defaults, Compliance
      Export, Close-Out, Factory Reset.
- [ ] **admin — New Year guard (S1):** attempt a New-Year rollover with **no saved defaults** → "Save
      your setup first" modal, **no data purged**; run Save Defaults, then the rollover proceeds.
- [ ] **director — zone notice (Phase 6 prod-defect fix):** the notice composer's zone dropdown lists
      **Black** (not Green), and a Black-zone notice reaches Black-zone churches.
- [ ] **church** — sees own campers only; **church first-aid read:** can see its own church's first-aid
      records but not another church's, and cannot create them.
- [ ] **zoneLeader** — zone-scoped roster + can read notes / send zone notices.

**Accommodation & check-in correctness:**
- [ ] **Accommodation split (C-1, the migration-013 gate):** a church×gender classroom pool **>50**
      shows two groups (Yr 7–9 / Yr 10–12); allocate into a split sub-pool, **reload the page, and
      confirm the allocation persisted** (this is exactly what was silently lost before `013`). Tent
      City headings show student/leader tent totals; room cards wrap.
- [ ] **Check-in sessions (AC-1):** first camp day has only a PM session; last day only AM.
- [ ] **Dashboard session (H-2):** between **12:00 and 13:00**, the at-camp dashboard's current
      session and "still to check in" count agree with the check-in screen (both show PM). Worth a
      spot-check if deploying around midday; otherwise trust the 12:30 test.
- [ ] **Check-in sync banner (B-1):** with the device offline, tap a check-in → "N syncing…"; back
      online it drains; force a failure → "N didn't save — tap to retry" banner appears (the loss is
      now visible, not silent).
- [ ] **Two-tab mode switch (B-3):** open two tabs; switch camp mode in one → the other picks it up.

**First-aid (Phase 4):**
- [ ] Log in as a **firstAid** account → lands on **Search** (tabs: Search · Records · Schedule; no
      Medical Watch). Search a student → **Student Info**: medical alert (calm amber) → consent →
      **leader contacts** (primary+secondary, bordered call buttons showing the number) → Medicare
      (tap-to-reveal, audited) → dietary → **Log first-aid action** → recent logs → parent (bottom).
- [ ] Log an action (Problem / Treatment / First-aider required / Brought-by optional) → it appears
      under "recent logs" and in the **Records** tab.
- [ ] As **admin/zoneLeader**: Testimonies & Student Notes → Record filter has **First-aid**; rows show
      Problem/Treatment; CSV export includes them.

**Security (R9):**
- [ ] `GET /settings` (unauthenticated) returns **no** `lastTempPasswords` array — only a
      `pendingTempPasswordCount`. Quick check: `curl -s https://my-youth-camp.vercel.app/settings | grep -c lastTempPasswords` → `0`.

---

## 7. Outstanding owner decisions (resolve before or just after shipping)

All of these are **non-deploy-blocking**; the hard gates (C-1, H-2, R9) are fixed.

- **From Phase 5 — B-1 check-in queue durability (deferred):** the optimistic queue is now *visible*
  on failure (banner) but still drops on a 4xx and is lost on tab close — it is **not** persisted to
  storage. A leader could still believe a child is checked in when the server has no record. Decide
  whether to invest in true durability (persist the queue + retry across reloads) as a fast follow-up.
- **From Phase 3/5 — L-3 visual (deferred):** `.statband` wraps but doesn't step columns at the
  intermediate breakpoint. Minor; bundle into a future visual pass if you do one.
- **From Phase 6 — Z1 / T1 (CLOSED, FYI only):** zones stay a fixed code+enum set (a new/extra zone
  needs a developer: enum + migration) and timezone stays fixed at Australia/Brisbane. These are
  **deliberate platform constraints**, not open work — listed so the decision is on record.
- **Phase 5 leftover to confirm, not decide:** the first-aid RBAC tests and the C-1/H-2 regression
  tests were *written* but only proven green by §0 — make sure §0 actually ran them.
