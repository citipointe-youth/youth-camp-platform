# Camp Platform — Implementation Plan: UI unification (1.1) + Phases 2–4

**Date:** 2026-06-06
**Companion to:** `docs/superpowers/specs/2026-06-06-camp-platform-improvement-analysis-design.md`
**Status of earlier phases:** Phase 0 (demo polish) and the safe Phase 1 items (1.2 remove `xlsx`, 1.7 CI) are **done and deployed**. This plan covers the remaining, heavier work.

Effort key: S ≈ <½ day · M ≈ 1–3 days · L ≈ 1–2 weeks.

---

## Stage A — 1.1 Unify the two UIs *(lead item; do before Phase 4 PWA)*

**Goal:** one UI source of truth, so a feature is written once and appears in both the offline demo and the real (backend-connected) app. Today `camp-platform-demo.html` and `public/index.html` are hand-synced and have already drifted.

**Approach (incremental, keep both shippable at every step):**
1. Extract the shared UI into `web/app.js` — all `RENDER.*` functions, components, router, helpers — written to call a global `api()` and read globals (`ACTOR`, `SETTINGS`, `CAMP_MODE`).
2. Extract the two data layers behind the same `api(path, opt)` contract:
   - `web/adapter-mock.js` — the current `MockAPI` + `_DB` + localStorage persistence (offline demo).
   - `web/adapter-http.js` — `fetch`-based calls to the Express backend (real app).
3. Create a thin shell `web/index.shell.html` (the `<head>`, styles, `#login`, screen containers, tab bar) that loads `app.js` + one adapter.
4. Build step `scripts/build-demo.mjs` (Node, zero deps) inlines `shell + adapter-mock + app.js` into the single-file `camp-platform-demo.html` (must stay openable offline / from Vercel static). `public/index.html` = shell + `adapter-http` + `app.js` (inlined or referenced).
5. Migrate **screen by screen**, diffing rendered output against the current demo to guarantee parity; keep deploying the demo after each screen.

**Files:** new `web/` dir, `scripts/build-demo.mjs`; `camp-platform-demo.html` and `public/index.html` become build outputs.
**Risks:** large refactor that can destabilise the working demo → mitigate with screen-by-screen migration, a visual parity check, and keeping the build output deployable throughout.
**Verify:** demo opens offline; the same feature shows in both surfaces; `node --check` on the built JS; manual click-through of every screen in both modes.
**Effort:** L.

---

## Stage B — Phase 2: Real data

> Open decision (from the spec): confirm **Supabase Postgres** as the datastore. This plan assumes Supabase to match your sibling youth apps and existing AU project; swapable if you prefer.

**B1 — Schema & migrations (M).** Map `src/core/entities/*` to tables under `supabase/migrations/`:
- `users, churches, registrants, campers, accommodation_blocks, zones, groups, notes, notifications, schedule_items, devotionals, faqs`
- child tables: `check_in_entries` (camperId FK), `sign_out_events` (camperId FK), `church_reservations`, `church_contacts` (or JSONB)
- singletons `settings`, `defaults` (enforce one row with a CHECK).

**B2 — Repository implementations (L).** Add `src/repositories/supabase/*` implementing every interface in `repositories/interfaces/entity-repositories.ts` with `supabase-js` (service-role key server-side). Match method signatures exactly so services don't change. Wire **only** `src/container.ts`.

**B3 — Real auth (M–L).** Replace `MockAuthProvider` + the in-memory token `Map`:
- Supabase Auth `signInWithPassword`; verify JWT in `auth.middleware`.
- **Reuse the hard-won lesson from the sibling apps:** read the role from `claims->'app_metadata'->>'app_role'` (NOT a top-level claim), and set roles by **merging** `raw_app_meta_data` (don't clobber provider keys).
- Map Supabase user → `User`/`Actor`.

**B4 — Seed/migrate script (S–M).** `src/scripts/migrate-seed.ts` loads the baseline (churches, accounts, accommodation, schedule, devotionals) so the app is usable immediately after deploy.

**B5 — Env & deploy (S).** `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` (build-time), service-role key server-side only. (Edge-function env auto-injects `SUPABASE_*` — don't `secrets set` those.)

**Verify:** `npm run typecheck` (0), `npm run test` (in-memory tests still pass — services untouched), smoke-test login as each role against Supabase, confirm RLS/scoping. **Effort:** L overall.

---

## Stage C — Phase 3: Harden for live operations

- **C1 Security (S–M):** `helmet` headers; `express-rate-limit` on `/auth/login`; strict prod CORS allowlist from `CORS_ORIGINS`; confirm the JSON body limit already set in the Express adapter.
- **C2 Tests (M):** cover the untested high-risk services — check-in, accommodation lock, notification scoping, import, dashboard — plus one API/contract test through the Express adapter (supertest). Builds on the 29 tests already added.
- **C3 Observability (S):** `/health` endpoint; structured logging (pino) with per-request IDs; surface in deploy logs for camp week.
- **C4 Bulk check-in (M):** endpoint + UI to check in a whole church/group at once, with a live progress count and undo (Category-2 item 2.4).
- **C5 Concurrency guards (M):** `updatedAt`/version check on accommodation allocation and check-in writes to prevent lost updates when two leaders act simultaneously.
- **C6 CI (done):** point the existing `.github/workflows/ci.yml` at the repo once it has a remote.

**Verify:** new tests green; load-test login rate-limit; simulate concurrent allocation writes; `/health` returns ok. **Effort:** M.

---

## Stage D — Phase 4: Delivery & reach

- **D1 Real notice delivery (M–L):** Web Push (PWA) for in-app urgent notices; optional Twilio SMS / Resend email for urgent camp-wide. The `Notification` entity already carries scope/priority/body, so this is a delivery channel on top.
- **D2 PWA (M):** web app manifest + service worker, offline shell, installable — applied to the **unified** app from Stage A (hence A precedes D). The demo is already offline-capable; this brings the real app to parity for flaky rural wifi.
- **D3 Remaining graphical polish (S–M):** microinteractions/transitions, skeleton loaders instead of "Loading…", empty-state illustrations, per-screen iconography (extends the icon set shipped in Phase 0).

**Verify:** install PWA on iOS/Android; send a test urgent notice end-to-end through each channel; Lighthouse PWA + a11y pass. **Effort:** M–L.

---

## Dependencies & recommended order
1. **Stage A (1.1)** — unify UIs (de-risks everything downstream; required before D2 PWA).
2. **Stage B (Phase 2)** — real data + auth (makes the real frontend meaningful).
3. **Stage C (Phase 3)** — harden once it's live-data-capable.
4. **Stage D (Phase 4)** — reach & polish.

## Out of scope
Multi-camp/tenant; parent self-registration portal; native apps.

## Note
This plan is phase-level. Any single stage (especially A or B) can be expanded into a granular, task-by-task implementation plan via the `writing-plans` skill when you're ready to start it.
