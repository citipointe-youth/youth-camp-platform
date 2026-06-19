# ⚠️ Supabase repository layer — UNVERIFIED SCAFFOLDING

**Do not assume this code works.** Everything in this folder was authored in an
environment with **no Node toolchain and no live Postgres** — it could not be
compiled (`tsc`), tested (`vitest`), or run against a database. It is a faithful
port of the proven `connection-made-simple` Supabase layer, adapted to the camp
platform's unified `Person` model, but it is a **starting point, not a finished
implementation**.

## Before this layer can be used

1. **Install the driver:** `npm i postgres` (add `postgres` to dependencies; it is
   not yet in package.json). The client also expects `DATABASE_URL` + `PERSISTENCE`
   in `src/config/env.ts` (added).
2. **Land Phase 1 Step 4 first.** This layer targets the unified `people` table. The
   live app still uses the separate `registrant`/`camper` repos until the Step-4
   switchover. Wiring Supabase before Step 4 will not match the running services.
3. **Run the real gate:** `npm run typecheck` — expect to fix a handful of issues the
   harness cannot catch (see below).
4. **Apply the migrations** (`supabase/migrations/`) to a real instance and smoke-test
   each repo method against it.

## Known places that need compiler/DB validation

- **`sql.begin` / transaction typing.** `save`/`saveMany` use `this.sql.begin(tx => …)`.
  The `postgres` library's `tx` callback type and the `tx(obj)` / `tx(rows)` helper
  overloads must be checked against the installed version — these are the least
  certain lines.
- **`on conflict do update set ${tx(cols, ...keys)}` helper form.** CMS spelled the
  update set out explicitly; the helper form here (`PERSON_UPDATE_COLS`) is a
  convenience that MUST be confirmed against the `postgres` API — if it doesn't
  type/behave, fall back to the explicit `col = excluded.col` form CMS uses.
- **`where x in ${sql(ids)}`** with an empty array throws in some driver versions —
  guarded with an early return in `loadHistories`, but verify other call sites.
- **Date/JSONB round-tripping.** `date` columns come back as `Date`; JSONB
  (`consents`, church `contacts`, defaults `snapshot`) round-trips as objects — the
  mappers assume this; confirm.
- **`deleteAll` returning a count.** `delete … returning id` gives a count but is
  slower than `truncate … cascade`; for the admin full-reset path prefer truncate
  (which returns no count — adjust the interface usage accordingly).

## What exists here

- `client.ts` — pooled `postgres` client (max:5, timeouts) — ported.
- `bulk.ts` — `chunk()` for the 65,535 bind-param ceiling — ported.
- `supabase.people.ts` — **reference implementation**: the unified `people` repo with
  JSONB `consents` and child-table hydration (`check_in_history`, `sign_out_history`).
  Follow this pattern for the rest.

## Still TO WRITE (one repo per interface, following supabase.people.ts)

`users`, `churches` (+ JSONB contacts + child `reservations`), `accommodation_blocks`,
`zones`, `groups`, `notes`, `notifications`, `schedule_items` (+ `getCheckInPoints`),
`devotionals`, `faqs`, `settings` (singleton), `defaults` (singleton, JSONB snapshot).
Then a `src/repositories/supabase/index.ts` barrel and a `PERSISTENCE==='supabase'`
branch in `src/container.ts` selecting these implementations.
