# Camp Platform — Production Deployment: Detailed Design & Implementation Plan

_Authored 2026-06-18. Reference implementation: `../connection-made-simple-master` (CMS) —
same hexagonal architecture, already deployed; its `CHANGELOG.txt` and `docs/ENGINEERING-REVIEW.md`
are treated as a pre-written bug list._

## 0. Decisions baked into this design

| # | Decision | Consequence |
|---|----------|-------------|
| D1 | **Security parity only** — match CMS security; camper medical/blue-card/consent are ordinary data | No consent-gating, no blue-card validation, no PII access log this phase (documented as future Phase F) |
| D2 | **Unify Registrant + Camper into one `Person` entity**; a person becomes a "camper" only at **Day-1 sign-in** | Largest refactor; check-in becomes the lifecycle transition; kind taxonomy collapses to one |
| D3 | **Supabase (Postgres), NOT Vercel**; served from the org's existing domain (long-lived Node process) | No serverless cold-start/ESM rabbit hole; keep ESM; stateless auth still adopted for multi-instance/restart resilience |
| D4 | **Hybrid DB mapping** — child tables for queried/aggregated data; JSONB for fixed-shape blobs | check_in_history + reservations = tables; church.contacts + consents + defaults snapshot = JSONB |

**Open item (does not block app-layer work):** what runs the Node process behind the org domain
(VPS + reverse proxy, vs. a container host with a `camp.` subdomain via DNS). Deferred to §7.

---

## 1. Target architecture

```
            org domain (camp.<org>.org)
                     │  TLS + reverse proxy (nginx/Caddy)  [§7 — TBD host]
                     ▼
            Node (long-lived) — npm run start
                     │
   Express ─ controllers ─ services ─ repositories(interfaces) ─ core
                                          │
                          ┌───────────────┴───────────────┐
                     in-memory/json                   supabase (NEW)
                     (dev + tests)                postgres client (pooled)
                                                         │
                                                  Supabase Postgres (Sydney, RLS)
```

Unchanged from today: the layering, the declarative route table, RBAC-in-one-file, Zod-in-services,
deep-clone repos. **Everything below either fills the `supabase/` gap, fixes a defect, or executes
the D2 unification.**

---

## 2. Domain model change — the `Person` unification (D2)

### 2.1 Why
Today `Registrant` (pre-camp) and `Camper` (at-camp) are separate entities/repos with **no promotion
path**, and two incompatible `kind` enums (`camper|leader` vs `student|leader`). The at-camp portal
only ever sees CSV-imported campers, never paid registrants. D2 collapses this.

### 2.2 The unified entity
A single `Person` table is the system of record. Lifecycle is a **status field**, not an entity type.

```ts
// core/entities/person.ts  (replaces registrant.ts + camper.ts)
export interface Person {
  id: ID;
  // identity
  firstName; lastName; gender: Gender; dateOfBirth?: string|null;
  grade?: Grade|null; school?: string|null;
  kind: 'youth' | 'leader';          // ONE taxonomy (was camper/student vs camper/leader)
  // affiliation
  churchId; churchName; zone: string; groupId?: string|null;
  // contact + care (ordinary data per D1)
  mobile?; email?; suburb?; postcode?; state?;
  medicalConditions: string[]; dietaryRequirements: string[]; otherMedications?;
  parentGuardianName?; parentPhone?; parentRelation?;
  blueCardNumber?; blueCardExpiry?;          // stored, not validated (D1)
  consents: Record<ConsentType,{granted:boolean; timestamp:ISO|null}>;  // JSONB (D4)
  // pre-camp / hub
  paymentStatus: PaymentStatus;
  accommodationKind?: AccommodationKind|null; accommodationLabel?: string|null;
  // lifecycle (the unification core)
  lifecycle: PersonLifecycle;        // see 2.3
  atCamp: boolean;                   // derived convenience = lifecycle is an at-camp state
  // at-camp history (child tables per D4)
  checkInHistory: CheckInEntry[];
  signOutHistory: SignOutEvent[];
  createdAt; updatedAt;
}
```

### 2.3 Lifecycle state machine
```
PersonLifecycle = 'registered' | 'cancelled'        // pre-camp states
                | 'arrived' | 'checked_out' | 'departed'   // at-camp states

registered ──(Day-1 first check-in)──▶ arrived         ← THE promotion event (D2)
arrived ⇄ checked_out  (sign-out / sign-in)
arrived/checked_out ──(camp end)──▶ departed
registered ──▶ cancelled  (admin)
```

- **A person is a "camper" iff `lifecycle ∈ {arrived, checked_out, departed}`.** Before Day-1
  sign-in they are a registrant only. This is enforced in **one helper** `isCamper(person)`
  (`core/entities/person.ts`) used everywhere the old code branched on entity type.
- **`checkIn.checkIn()` becomes the transition point:** the first successful `type:'in'` flips
  `lifecycle: 'registered' → 'arrived'` and sets `atCamp:true`. This is the only place promotion
  happens — no separate promotion service, no batch job, no mode-switch side effect. Matches the
  user's intent ("only become a camper after Day-1 sign-in").
- Pre-camp dashboards count `lifecycle==='registered'`; at-camp dashboards count `isCamper`.
  This **also fixes** the unscoped `totalAtCamp`/`checkInsDue` ambiguity (Audit B4).

### 2.4 Migration of existing logic
| Old | New |
|-----|-----|
| `RegistrantService` | folds into `PersonService` (pre-camp-facing methods: list/create/update/chase/breakdown/remind) |
| `CamperService` | folds into `PersonService` (at-camp-facing methods: list/get/update) |
| `IRegistrantRepository` + `ICamperRepository` | one `IPersonRepository` (findByChurch, findAtCamp, search, …) |
| `kind: 'camper'\|'student'` | `kind: 'youth'` |
| route `/registrants/*` | kept as alias → PersonService (pre-camp view); `/campers/*` → PersonService (at-camp view). **SPA needs no change** — both route families remain, backed by one service. |

> **Backwards-compat for the SPA (Audit: SPA already speaks the real API):** keep `/registrants`
> and `/campers` route paths and their response shapes. They become two *views* over `Person`
> filtered by lifecycle. This contains the refactor to the backend.

---

## 3. Defect fixes (independent of deployment — do regardless)

These are functional bugs found in the audit; fix them as part of the same effort.

| ID | Defect | Fix |
|----|--------|-----|
| **A1** | App won't start — `src/index.ts` imports missing `./data/seed` | Author `src/data/seed.ts` (accounts per CLAUDE.md); split `createAppInstance()` factory into `src/app.ts` (CMS pattern). |
| **A4** | `admin.reset` loads defaults snapshot but never restores | Define reset vs new-year semantics (CMS Phase 15 split): **Full Reset** = wipe to baseline + **restore** from JSONB snapshot; **New Year** = wipe people, keep scaffold. Implement the restore. |
| **B1** | Accommodation availability ignores reservations (`computeLiveTaken` dead code) | Route `getLiveBlocks` + dashboard through `computeLiveTaken(blocks, people)`; add live-capacity check in `setReservations` (also closes the double-booking race, §5). |
| **A3** | reset/new-year row-by-row delete → statement-timeout + per-row JSON rewrite | Add `deleteAll()`/`clear()` to repo interface; Supabase impl = `TRUNCATE … CASCADE` (CMS fix); in-memory impl = single write. |
| **B3** | Check-in "today"/"current session" mixes UTC date with server-local time | Timezone-aware date layer using `settings.timezone`; `daysUntil` currently ignores its `tz` arg — honour it. |
| **B4** | Dashboard `checkInsDue`/`totalExpected` unscoped (leaks camp-wide) | Apply `canAccessCamper` scoping; resolved naturally by §2.3 lifecycle counting. |
| **C2** | `remind` reports success but sends nothing; missing zone-leader scope | Make response honest (`queued`/`notImplemented`); add the zone filter present in `chase`. |
| **CSV** | `parseCsv` doesn't strip UTF-8 BOM (Excel/Elvanto exports) | Strip leading BOM before header parse. |

---

## 4. Persistence layer — Supabase (D3, D4)

### 4.1 Schema (hybrid mapping)
```
people                 -- unified entity; most columns relational
  ├─ check_in_history  -- child table (queried/aggregated): person_id, session_id, type, leader_id, ts
  └─ (signOutHistory   -- child table: person_id, type, leader_name, reason, parents_met, author_id, ts)
churches
  └─ reservations      -- child table (capacity math): church_id, kind, spots, label, confirmed
  └─ contacts          -- JSONB column {male:{primary,backup},female:{...}}  (fixed shape)
accommodation_blocks
zones, groups, schedule_items, devotionals, faqs, notifications
users                  -- bcrypt passwordHash
settings               -- singleton (CMS migration 003 pattern: enforced single row)
defaults               -- singleton; snapshot stored as JSONB blob (clean restore for A4)
people.consents        -- JSONB column (fixed shape, never queried individually)
```

Migrations mirror CMS's numbered set:
`001_initial_schema`, `002_seed_admin`, `003_settings_singleton`, `004_seed_users`,
`005_enable_rls` (all tables, no anon policy — Express uses the pooled superuser URL that bypasses
RLS), `006_perf_indexes` (index `check_in_history(session_id)`, `people(church_id)`,
`people(zone)`, `notifications(created_at desc)`).

### 4.2 Client (port CMS `supabase/client.ts` verbatim)
`postgres` pool **`max:5`** (CMS's single highest-impact fix — `max:1` head-of-line blocking),
`idle_timeout:10`, `connect_timeout:10`, `max_lifetime:60`, `statement_timeout:15000`, `prepare:false`.
> NB: on a long-lived host (D3) the freeze cascade is less acute than serverless but still real
> under concurrent imports/dashboards — keep the config.

### 4.3 Repositories
One Supabase impl per interface in `src/repositories/supabase/`, same method signatures (services
unchanged). Bulk writes via a ported `bulk.ts` (chunk at 1,000 rows — Postgres 65,535 bind-param
ceiling). Child-table reads hydrated into the nested `Person` shape the services expect.

### 4.4 Container wiring
`buildContainer()` gains a `PERSISTENCE==='supabase'` branch selecting Supabase repos; `memory`/`json`
unchanged for dev+tests. This stays the **only** file naming concrete repos.

---

## 5. Resilience & security port (CMS parity — D1, D3)

| Area | Action | Source |
|------|--------|--------|
| Auth | Replace in-memory `Map` token store with **stateless HMAC sessions** carrying the actor; `SESSION_SECRET` env + prod warning if unset | CMS `auth.service.ts` |
| Password | Keep scrypt **or** adopt bcrypt+`needsRehash` transparent upgrade (recommended for parity) | CMS `crypto.ts` |
| Rate limit | Port `utils/rate-limiter.ts` — 10 login attempts/IP/15min → 429 + Retry-After | CMS |
| Headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy | CMS `express-adapter.ts` |
| CORS | Lock to org domain; warn on `*` in prod (current code reflects arbitrary origin **with credentials** — fix) | Audit A6 |
| RLS | Enable on all tables (migration 005) | CMS Phase 4 |
| Crash guards | `unhandledRejection`/`uncaughtException` handlers in entrypoint | CMS `api/index.ts` |
| Concurrency | Capacity check in `setReservations`; settings/defaults singleton; check-in idempotency (ignore duplicate same-session `in`) | Audit §4 |

**Not in scope (D1, documented Phase F):** blue-card expiry validation/flagging, consent enforcement,
PII-specific access logging. Fields remain; logic deferred.

---

## 6. Frontend (light — SPA already speaks the real API)

The SPA's `api()` wrapper already handles the bare-result contract, 401, 204, Bearer token — **no
rewrite**. Work is additive hardening:
- Add `manifest.json`, `sw.js` (network-first HTML, network-only API via `API_RE`, cache-first assets),
  icons — currently absent.
- `controllerchange` auto-reload on SW update.
- Verify no SPA code branches on the removed `kind` values (`camper`/`student`) — update to `youth`.
- Confirm pre-camp vs at-camp person views read the lifecycle field correctly.

---

## 7. Deployment & ops (host TBD — finalise after org-domain check)

**Decided:** Supabase (Sydney) backend; served under the org's existing domain.
**To confirm before this section is buildable:**
- Does the org domain sit on a host that can run a **long-lived Node process** + reverse proxy
  (VPS/cloud VM), or static/shared hosting (then: container host — Railway/Render/Fly — + a
  `camp.<org>.org` **subdomain via DNS** → that host)?

Once known, this section produces: process manager (systemd/PM2 or platform-native), reverse-proxy
+ TLS config, `.env.example` (PORT, NODE_ENV=production, PERSISTENCE=supabase, DATABASE_URL,
SESSION_SECRET, CORS_ORIGINS=https://camp.<org>.org), a `SECURITY-ACTIONS.txt` runbook (set
SESSION_SECRET, lock CORS, apply migrations), and CI deploy step (the `.github/workflows/ci.yml`
already runs typecheck+test+audit).

---

## 8. Implementation plan (sequenced, each step ends green: typecheck + tests)

**Phase 0 — Make it run + safety net** (unblocks everything)
1. Author `src/data/seed.ts`; split `src/app.ts` `createAppInstance()`; slim `src/index.ts`. (A1)
2. Add characterisation tests for current behaviour of the services about to be refactored
   (registrant, camper, checkin, accommodation, admin) so the unification can't silently regress.

**Phase 1 — `Person` unification** (D2 — the backbone; do before DB so the schema targets the final shape)

> **Execution note (toolchain-less environment):** Phase 1 is staged so each step is statically
> verifiable and leaves the tree compiling, rather than a blind big-bang. Steps 2–4 (the destructive
> merge) should be done with `tsc`/`vitest` in the loop.
>
> **Verification substitute:** with no Node/npm/network available, each step is verified by the
> Python harness in `docs/verification/` (import/export resolution, enum-literal conformance,
> behavioural simulation of test assertions) + manual review against entity interfaces. This is a
> strong-but-not-complete substitute; a real `tsc`/`vitest` run remains the authoritative final gate.
>
> **Phase 0 + Step 1 verification record (run 2026-06-18):**
> - `check_imports.py` — ✓ all local named imports across 13 in-scope files resolve to real exports.
> - `check_enums.py` — ✓ all enum-typed literals valid (one `timezone` false-positive, confirmed spurious).
> - `sim_person.py` — ✓ all 28 assertions from `person.test.ts` pass against a faithful logic port.
> - required-field review — ✓ all test builders + `seed.ts` literals cover required entity fields
>   (checker shorthand/nested false-positives confirmed spurious by manual inspection).
> - **Residual risk for the real gate:** structural type assignability, generics in repo base classes,
>   `noUncheckedIndexedAccess` corners — none detectable without `tsc`.

3. **[DONE — Step 1, additive]** `core/entities/person.ts` (unified `Person`), `PERSON_KINDS` +
   `PERSON_LIFECYCLES` enums, `isCamper`/`isRegistrant` predicates, and `personFromRegistrant`/
   `personFromCamper`/`toPersonKind` bridge mappers. Unit-tested in `person.test.ts`. **Zero
   behavioural change** — old entities still live; tree compiles; Phase-0 tests unaffected.
4. **[DONE — Step 2, additive]** `IPersonRepository` + `InMemoryPersonRepository` (union of the
   registrant/camper query surface: `search`/`findByChurch`/`findByZone`/`findByGroup`/`findByKind`/
   `findByLifecycle`/`findCampers`/`findAtCamp` + bulk `deleteAll`). Wired into the container as
   `repos.people` with a `people.json` JSON-persistence path. Old repos untouched. Unit-tested in
   `repositories/in-memory/person.repository.test.ts`.
   _Verification (run 2026-06-18): `check_imports.py` ✓ (17 files); `sim_person_repo.py` ✓ (16/16
   assertions); manual: container wiring consistent across all 4 sites, `isCamper` value-import used,
   `Person` type-only import correct, base-repo `store`/`clone`/`writeToPersistence` are `protected`._
5. **[Step 3]**
   - **[DONE — additive]** `services/person-lifecycle.ts` — pure D2 transitions: `applyCheckIn`/
     `applySignOut`/`applySignIn` (first sign-in promotes `registered→arrived`; cancelled never
     auto-promoted; out→`checked_out`) + immutable `withCheckIn`/`withSignEvent` appenders.
     `services/person.service.ts` — merged `PersonService` over `repos.people` with `list` (all
     lifecycles), `listRegistrants` (pre-camp view), `listCampers` (at-camp view), `get`/`getProfile`;
     `canAccessPerson` mirrors the legacy camper RBAC. Unit-tested (`person-lifecycle.test.ts`,
     `person.service.test.ts`). Legacy services untouched.
     _Verification (run 2026-06-18): `check_imports.py` ✓ (21 files); `sim_step3.py` ✓ (23/23
     assertions); enum-literal scan ✓ (no stale camper/student/checked_in literals)._
   - **[DEFERRED to Step 4 — needs compiler/SPA]** Repoint live `/registrants` + `/campers` routes
     to `PersonService` views and wire `checkIn.checkIn()`/attendance to `withCheckIn`/`withSignEvent`.
     This is the destructive switchover (changes response shapes the SPA reads, breaks the legacy
     characterisation tests) — do with `tsc`/`vitest` + the running SPA in the loop.
6. **[Step 4]** Remove the now-dead `Registrant`/`Camper` entities, repos, and services; update the
   container, `dashboard`/`search`/`note`/`attendance`/`import` consumers, and the SPA `kind`
   references (`camper`/`student`→`youth`). Migrate the characterisation tests to the unified service.
7. Verify both pre-camp and at-camp views against the characterisation suite.

**Phase 2 — Defect fixes** (A3, A4, B1, B3, B4, C2, CSV)
8. Accommodation availability wiring + capacity check (B1, §5 race).
9. Reset/new-year semantics + restore + bulk `deleteAll` (A4, A3).
10. Timezone-aware date layer (B3); dashboard scoping (B4); honest `remind` + zone scope (C2);
    BOM-strip + batched/indexed import (CSV, C1).

**Phase 3 — Supabase persistence** (D4)
11. Migrations 001–006 (schema, seed, singleton, RLS, indexes).
12. `supabase/` repos + `client.ts` + `bulk.ts`; container branch; child-table hydration.
13. Verify tests still pass on memory; manual smoke on Supabase (login, import, check-in promotion,
    accommodation availability, reset/restore).

**Phase 4 — Security & resilience port** (§5)
14. Stateless HMAC auth + SESSION_SECRET; bcrypt+rehash; rate-limiter; security headers; CORS lock;
    crash guards.

**Phase 5 — Frontend hardening** (§6)
15. PWA (manifest/sw/icons), SW update reload.

**Phase 6 — Deploy** (§7 — after host confirmed)
16. Host/proxy/TLS/env/runbook/CI deploy.

**Phase F — Deferred (not this effort):** blue-card expiry validation, consent enforcement, PII
access logging, self-registration (the dormant `selfRegisterSlug`).

---

## 9. Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Person unification regresses pre/at-camp views | Med | Phase 0 characterisation tests; keep route shapes stable |
| Child-table hydration perf (N+1 on check-in history) | Med | Indexed joins / batch fetch; CMS `/trends` SQL-aggregation lesson |
| Host can't run Node (static-only org domain) | Med | §7 confirm early; subdomain+container fallback ready |
| Org domain DNS/TLS access delays | Low-Med | App-layer (Phases 0–5) is host-agnostic; deploy is last |
| Scrypt→bcrypt migration breaks existing logins | Low | `needsRehash` transparent upgrade (CMS-proven) |
```

