# Phase 1 Step 4 — Live `Person` switchover (PATCH PLAN)

> ⚠️ **This is the destructive half of the Person unification. Do it with `tsc` +
> `vitest` + the running SPA in the loop.** The new `PersonService` surface it relies
> on is already built and harness-verified (read-side in Step 3, write/check-in side
> drafted in this step — `services/person.service.ts`, `sim_step3.py` + `sim_step4.py`
> green). What remains is repointing live wiring and deleting the legacy code, which
> changes SPA-facing JSON shapes and removes the characterisation safety net — hence
> compiler-in-the-loop only.

## Preconditions
1. `npm install && npm run typecheck && npm run test` is GREEN on the current tree
   (Known Risk R1 — the whole Phases 0–4 body is harness-verified but not yet
   compiler-confirmed). Fix anything that surfaces before starting Step 4.
2. Decide: keep the legacy `Registrant`/`Camper` route PATHS (`/registrants`,
   `/campers`) — yes, recommended, so the SPA needs minimal change; they become two
   lifecycle-filtered VIEWS over `PersonService`.

## What's already in place (no work needed)
- `core/entities/person.ts` — unified entity + lifecycle + `isCamper`/`isRegistrant`
  + `personFromRegistrant`/`personFromCamper` bridge mappers.
- `IPersonRepository` + `InMemoryPersonRepository` (`repos.people`, wired in container).
- `services/person-lifecycle.ts` — `withCheckIn`/`withSignEvent` (the D2 promotion).
- `services/person.service.ts` — full surface: list / listRegistrants / listCampers /
  get / getProfile / create / update / remove / checkIn / signEvent. **Dormant.**

## Patch steps (ordered; typecheck after each)

### S4.1 — Seed the `people` store
In `src/data/seed.ts`, also seed a few `Person` rows (or convert the existing
registrant/camper demo seed via `personFromRegistrant`/`personFromCamper`) into
`container.repos.people`, so `PERSISTENCE=memory` dev has unified data. Keep seeding
users/churches/settings as-is.

### S4.2 — Repoint the registrant routes (pre-camp view)
`registrant.controller.ts` → call `PersonService` instead of `RegistrantService`:
- `list`   → `person.listRegistrants(actor, churchId)`
- `get`    → `person.get` (returns a Person; the SPA reads the same fields)
- `create` → `person.create` (map the registrant create-body fields)
- `update` → `person.update`
- `remove` → `person.remove`
- `chase` / `breakdown` / `remind` → **port these three** onto `PersonService` (they
  currently live in `registrant.service.ts`; the logic is unchanged — filter
  `isRegistrant`, same counters; `remind` keeps the C2 fix: skip cancelled + zone
  scope). Easiest: add `chase`/`breakdown`/`remind` to `PersonService` mirroring the
  legacy methods, operating over `listRegistrants`.
Wire `makeRegistrantController` to take `{ person }` (or rename to a people controller).
**Response-shape check:** the SPA reads `/registrants` as a bare array of objects with
`id, firstName, lastName, kind, paymentStatus, blueCardCollected, churchId, churchName,
zone, status, grade, accommodationKind, accommodationLabel`. `Person` has all of these
EXCEPT `blueCardCollected` (Person uses `blueCardNumber`/`blueCardExpiry`) and `status`
(Person uses `lifecycle`). **Two options:** (a) add a thin DTO mapper that emits the
legacy field names for the pre-camp view, or (b) update the SPA to read the Person
fields. (a) is less SPA churn — recommended. Map `status: isRegistrant(p)?'registered':
(p.lifecycle==='cancelled'?'cancelled':'registered')`, and derive `blueCardCollected`
from a Person field you choose to keep (currently there's no boolean — decide: add
`blueCardCollected` to Person, OR derive from `blueCardNumber != null`).

### S4.3 — Repoint the camper routes (at-camp view) + check-in/attendance
`camper.controller.ts` → `PersonService`:
- `list` → `person.listCampers(actor, opts)`
- `get`  → `person.getProfile` (SPA profile reads `fullName`, `signOutHistory`, etc.)
- `create`/`update` → `person.create`/`update`
`checkin.controller.ts` `checkIn` → `person.checkIn(actor, camperId, entry)` — THIS is
the promotion point (Day-1 first 'in' flips registered→arrived). Remove the old
`status:'checked_in'` write path in `checkin.service.ts`.
`attendance.controller.ts` sign-in/out → `person.signEvent`.
**Response-shape check:** `/campers` is a bare array with camper `kind: 'student'|
'leader'`. Person uses `kind: 'youth'|'leader'`. Either map `youth→student` in the
camper-view DTO, OR update the SPA (see S4.6). The check-in roster shape
(`{camperId,firstName,lastName,church,zone,checkedIn,lastEntry}`) must be preserved —
port `getSessionStatus`'s roster builder to read from `repos.people` (filter `isCamper`).

### S4.4 — Migrate the other consumers
- `dashboard.service.ts` — counts over `repos.people` filtered by lifecycle (the D2
  way; also finishes B4 scoping cleanly). The D1/D3 fixes already done stay.
- `search.service.ts` — `repos.people` + `canAccessPerson`.
- `note.service.ts` / `attendance.service.ts` — point camper lookups at `repos.people`.
- `import.service.ts` — biggest: map CSV `student`/`camper` kinds → `youth`; write
  `Person` rows via `repos.people.saveMany`. The phone-dedup logic (P1 fix) ports
  directly (it's keyed on church+name+phone, entity-agnostic).
- `admin.service.ts` reset/newYear — replace `registrantRepo`+`camperRepo` deleteAll
  with `repos.people.deleteAll()`; the snapshot/restore logic is unchanged.

### S4.5 — Delete the legacy code
Remove `core/entities/registrant.ts`, `core/entities/camper.ts`,
`services/registrant.service.ts`, `services/camper.service.ts`, the
`IRegistrantRepository`/`ICamperRepository` interfaces + their in-memory impls, and the
`registrants`/`campers` repos from the container. **Migrate or delete** the
characterisation tests (`registrant.characterisation.test.ts`,
`camper.characterisation.test.ts`, `checkin.characterisation.test.ts`,
`admin.characterisation.test.ts` use camper/registrant builders) — re-point them at
`PersonService` or replace with the existing `person.service.test.ts` coverage.
NOTE: `CheckInEntry`/`SignOutEvent` currently live in `camper.ts` and are imported by
`person.ts`/`person-lifecycle.ts` — MOVE them to `person.ts` (or a new
`core/entities/attendance.ts`) before deleting `camper.ts`, and update imports.

### S4.6 — SPA (`public/index.html`)
- Grep for `'camper'`/`'student'` kind literals and `kind==='student'` → `'youth'`
  (unless you kept the camper-view DTO mapping in S4.3, in which case the SPA is
  unchanged — verify).
- Smoke-test BOTH modes: pre-camp My Youth (list/add/edit/blue-card/breakdown) and
  at-camp Check-in (roster, sign-in promotes, sign-out), Search, profile notes.

### S4.7 — Verify
`npm run typecheck && npm run test` green; manual SPA smoke per S4.6; then re-run the
Python harness (`docs/verification/`) as a secondary check.

## Decisions to make during S4 (flagged, not pre-decided)
- **`blueCardCollected`**: add a boolean to `Person`, or derive from `blueCardNumber`?
  (The pre-camp UI's blue-card tracking depends on this.)
- **Legacy field DTO vs SPA rewrite**: map Person→legacy field names in two view DTOs
  (less SPA churn, recommended) vs update the SPA to read Person fields directly.
- **`status` vs `lifecycle`**: the SPA reads registrant `status`; map it from
  `lifecycle` in the pre-camp DTO.

## Rollback
Until S4.5 deletes the legacy code, every step is reversible by reverting the
controller wiring. Do S4.1–S4.4 + S4.6 and verify GREEN before S4.5 (the irreversible
deletion) — keep the characterisation safety net until the very end.
