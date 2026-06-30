# Youth Camp Platform — Remaining Work: Design & Implementation Plan

_Authored 2026-06-18. Companion to `DEPLOYMENT-DESIGN.md` (the original plan) and
`CHANGELOG.txt` (what's done + KNOWN RISKS). This document is the forward-looking
"what's left" plan, sequenced, with open questions for the owner._

## Status snapshot

**Done & harness-verified** (NOT yet compiler-confirmed — see Gate 0):
Phase 0 (app boots + characterisation tests) · Phase 1 Steps 1–3 (unified `Person`
model/repo/service + lifecycle, all ADDITIVE — nothing live uses them yet) · Phase 2
defects B1, A3, A4, B3, C1, C2 · Phase 4 partial (stateless auth, security headers,
login rate-limit) · Phase 3 partial (Supabase migrations + unverified `people` repo).

**Not started / deferred:** Phase 1 Step 4 (live switchover) · the rest of the Supabase
repo layer · Phase 5 (PWA) · Phase 6 (deploy/ops) · Phase F (deferred compliance).

---

## Gate 0 — Run the real toolchain FIRST (blocks everything)

Nothing below should start until this passes on a real machine:

```bash
cd youth-camp-platform-master
npm install
npm run typecheck      # expect a handful of fixes the Python harness can't catch
npm run test           # all suites incl. the new *.test.ts + characterisation files
```

Expect the **Supabase repo files to fail typecheck until `npm i postgres`** is run and
the issues in `src/repositories/supabase/README.md` are worked through. If you want a
green build before touching Supabase, temporarily exclude `src/repositories/supabase/`
from `tsconfig` (it's not wired into the container yet).

**Why this matters:** the harness proves import-resolution, enum-literal conformance and
pure-logic behaviour, but NOT structural type assignability, generics, or
`noUncheckedIndexedAccess` corners. Gate 0 converts ~28 files from "harness-verified" to
"compiler-confirmed."

---

## Step A — Phase 1 Step 4: the live `Person` switchover (BIGGEST remaining)

The unified model exists but is dormant. This activates it. **Needs the compiler + the
running SPA** — it changes response shapes and deletes live code.

> **A precise ordered patch plan now exists: `docs/STEP4-SWITCHOVER.md`.** The full
> `PersonService` surface (read + write + check-in) is already built and harness-verified;
> what remains is the wiring/deletion in that doc. The summary below is the overview;
> follow STEP4-SWITCHOVER.md for the exact steps + flagged decisions.

1. **Seed the `people` store** (`src/data/seed.ts`) instead of (or alongside) the legacy
   registrant/camper seed, so the unified path has data in `memory` mode.
2. **Repoint routes to `PersonService`:** `/registrants/*` → lifecycle-filtered registrant
   view; `/campers/*` → camper view. **Preserve the exact JSON response shapes** the SPA
   reads (bare arrays, camper `kind`, check-in roster shape) — verify against
   `public/index.html`'s `api()` calls.
3. **Wire the promotion:** `checkIn.checkIn()` + attendance sign-in/out must call
   `withCheckIn` / `withSignEvent` (from `services/person-lifecycle.ts`) so Day-1 first
   check-in flips `registered → arrived`. Remove the old `status: 'checked_in'` path.
4. **Update consumers:** `dashboard` (counts via lifecycle — also fixes B4 scoping),
   `search`, `note`, `attendance`, `import.service` (map `kind` `student/camper → youth`).
5. **Delete** the legacy `Registrant`/`Camper` entities, repos, services + their
   characterisation tests (migrate any still-valuable assertions onto `PersonService`).
6. **SPA:** grep for `'camper'`/`'student'` kind literals → `'youth'`; confirm both views.
7. Re-run Gate 0; manually smoke pre-camp AND at-camp flows.

**Risk:** highest-churn change in the project. Do it as its own branch/PR with the
characterisation tests green before and after.

---

## Step B — Finish the Supabase repository layer (Phase 3 cont.)

Prereq: Step A landed (the repos target `people`, not the split entities) + `npm i postgres`.

1. Work through `src/repositories/supabase/README.md` "Known places that need validation"
   on `supabase.people.ts` until it typechecks and round-trips against a real instance.
2. Write the remaining repos following the `people` pattern: `users`, `churches` (+ JSONB
   `contacts` + child `reservations`), `accommodation_blocks`, `zones`, `groups`, `notes`,
   `notifications`, `schedule_items` (+ `getCheckInPoints`), `devotionals`, `faqs`,
   `settings` (singleton), `defaults` (singleton JSONB snapshot).
3. `src/repositories/supabase/index.ts` barrel + a `PERSISTENCE==='supabase'` branch in
   `src/container.ts`.
4. Apply `supabase/migrations/` to a real instance (`supabase db push`); verify column
   types/constraints (KNOWN RISK R11). Smoke-test every repo method.

---

## Step C — Finish Phase 4 security (the non-blocked remainder)

1. RLS is already in migration 003 — confirm the app's superuser connection bypasses it
   and the anon key is denied.
2. Audit error responses for production (no internal leakage; the error middleware already
   returns generic 500s — confirm nothing else leaks).
3. Decide the login rate-limit store: in-memory per-instance is fine for a single host; a
   shared store (e.g. a Postgres table) is needed for a hard global limit on multi-instance.
4. Operator runbook item: **set `SESSION_SECRET`** in the deploy env (startup warns if unset).

---

## Step D — Phase 5: PWA / frontend hardening

The SPA already speaks the real API (no rewrite needed). Additive only:
add `manifest.json`, `sw.js` (network-first HTML, network-only API, cache-first assets),
icons, and a `controllerchange` auto-reload on SW update. Mirror CMS's `public/sw.js`.

---

## Step E — Phase 6: deployment & ops (needs the hosting decision, Q1 below)

Produce: process manager (systemd/PM2 or platform-native), reverse-proxy + TLS config for
the org subdomain, `.env.example`, a `SECURITY-ACTIONS.txt` runbook (set SESSION_SECRET,
lock CORS, apply migrations, set seeded-account passwords), and a CI deploy step (the
`.github/workflows/ci.yml` already runs typecheck+test+audit).

---

## Phase F — Deferred (explicitly OUT of scope unless re-prioritised)

Per the security-parity decision (D1): blue-card expiry validation/flagging, consent
enforcement, PII-specific access logging. Also: the dormant self-registration feature
(`selfRegisterSlug` exists, no route). Revisit only if the owner re-scopes compliance.

---

## OPEN QUESTIONS FOR THE OWNER (resolve before the dependent step)

These shape the work and are decisions only the owner can make. Each notes which step it
blocks.

**Q1 — Hosting (blocks Step E).** What runs the Node process behind the org domain?
  - (a) An existing VPS/cloud VM where a long-lived Node process + reverse proxy (nginx/
    Caddy) can live, or
  - (b) Static/shared hosting that can't run a backend → then a container host
    (Railway/Render/Fly) with a `camp.<org>.org` subdomain via DNS.
  This determines the entire Step E deliverable.

**Q2 — Reservations vs availability (KNOWN RISK R8, affects accommodation).** Should
  church-level held `reservations` ALSO reduce block availability (to stop over-holding),
  or only assigned occupants (current behaviour)? One-line change in
  `accommodation-occupancy.ts` if yes. Tie to finalising the per-church spot model + the
  `setReservations` capacity check (which also closes the double-booking race).

**Q3 — Restored-account passwords (KNOWN RISK R9, affects new-year rollover).** After
  `new-year`, restored church/zone accounts have no password. Preferred remediation:
  - (a) runbook step ("admin sets passwords post-rollover"), or
  - (b) a temporary-password generator that emits a reset list, or
  - (c) snapshot a password-reset token instead. (a) is simplest; (b)/(c) are more work.

**Q4 — Password hashing.** Current code keeps **scrypt** (sound; no existing hashes to
  migrate). Confirm scrypt is acceptable, or request the bcrypt + transparent-rehash port
  from CMS (only worth it if you specifically want bcrypt).

**Q5 — Demo/seed accounts in production.** The migrations seed `admin@campplatform.org`
  with a NULL password. Confirm the real admin email + that no demo church accounts should
  be seeded in prod (the in-app demo seed only runs for `PERSISTENCE=memory`, so prod is
  clean by default — just confirm the admin identity).
