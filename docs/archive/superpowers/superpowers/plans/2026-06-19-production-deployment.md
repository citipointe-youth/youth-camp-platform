# Youth Camp Platform — Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the dormant Person unification, write all Supabase repository implementations, harden security, add Vercel deployment config, and push a fully working app that auto-deploys to Vercel backed by Supabase (Sydney).

**Architecture:** Hexagonal TS/Express backend (services → repo interfaces → concrete impls) with a unified `Person` entity replacing separate `Registrant`/`Camper` entities. Supabase (ap-southeast-2) is the persistence layer for production; in-memory stays for dev/tests. Vercel hosts the Express app via a serverless entry point.

**Tech Stack:** TypeScript 5, Express, Zod, `postgres` (Supabase pooler), Vitest, Vercel Node runtime.

## Global Constraints

- Run `npm run typecheck && npm run test` after every task — both must stay green.
- Never change the JSON shapes that `/registrants`, `/campers`, or `/checkin/status` return — the SPA reads them bare.
- `kind` in the SPA: `/registrants` uses `'camper'|'leader'`; `/campers` uses `'student'|'leader'`. Person internally uses `'youth'|'leader'`. Map at the DTO boundary, not inside services.
- `blueCardCollected` in the SPA is derived: `blueCardNumber != null`.
- No new fields on `Person` or DB schema — work with what exists in `src/core/entities/person.ts` and `supabase/migrations/001_initial_schema.sql`.
- All Supabase repos go in `src/repositories/supabase/`. Follow the pattern in `supabase.people.ts` exactly (SqlClient tagged template, `init()` no-op, `hydrate()` helper).
- `src/container.ts` is the ONLY file that names concrete repository classes.
- Test files stay in the same directory as the file they test.
- Commit after every task using `git commit`.

---

## File Structure

### Phase A — Person Switchover

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/api/dto/person.dto.ts` | Map Person → legacy DTO shapes the SPA reads |
| Modify | `src/data/seed.ts` | Also seed `repos.people` from the existing demo rows |
| Modify | `src/services/person.service.ts` | Add `chase`, `breakdown`, `remind` methods |
| Modify | `src/api/controllers/registrant.controller.ts` | Wire to PersonService + toRegistrantDto |
| Modify | `src/api/controllers/camper.controller.ts` | Wire to PersonService + toCamperDto |
| Modify | `src/api/controllers/checkin.controller.ts` | `checkIn` → `person.checkIn()` (D2 promotion) |
| Modify | `src/api/controllers/attendance.controller.ts` | `signIn/Out` → `person.signEvent()` |
| Modify | `src/services/checkin.service.ts` | Roster builder reads `repos.people` |
| Modify | `src/services/dashboard.service.ts` | Counts via lifecycle over `repos.people` |
| Modify | `src/services/search.service.ts` | Reads `repos.people` |
| Modify | `src/services/note.service.ts` | Camper lookup via `repos.people` |
| Modify | `src/services/import.service.ts` | Map kinds → `'youth'`; write `Person` via `repos.people.saveMany` |
| Modify | `src/services/admin.service.ts` | reset/newYear use `repos.people.deleteAll()` |
| Modify | `src/container.ts` | Remove legacy registrant/camper repos+services; add `person` service |
| Delete | `src/core/entities/registrant.ts` | Superseded by Person |
| Delete | `src/core/entities/camper.ts` | Superseded by Person |
| Delete | `src/services/registrant.service.ts` | Superseded |
| Delete | `src/services/camper.service.ts` | Superseded |
| Delete | `src/services/attendance.service.ts` | Logic absorbed into PersonService.signEvent |
| Delete | `src/repositories/interfaces/` (registrant + camper) | Superseded |
| Delete | `src/repositories/in-memory/in-memory.repositories.ts` (registrant/camper classes) | Superseded |
| Delete | `src/core/validation/registrant.schema.ts` | Move needed fields to person schema |
| Delete | `src/core/validation/camper.schema.ts` | Superseded |
| Delete | `src/services/registrant.characterisation.test.ts` | Services removed |
| Delete | `src/services/camper.characterisation.test.ts` | Services removed |
| Delete | `src/services/checkin.characterisation.test.ts` | Rewrite against PersonService |

### Phase B — Supabase Repository Layer

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `package.json` | Add `postgres` dependency |
| Modify | `src/repositories/supabase/client.ts` | Remove stale comment, no logic change |
| Modify | `src/repositories/supabase/supabase.people.ts` | Fix 2 implicit-`any` params |
| Create | `src/repositories/supabase/supabase.users.ts` | IUserRepository over `users` table |
| Create | `src/repositories/supabase/supabase.churches.ts` | IChurchRepository + child reservations |
| Create | `src/repositories/supabase/supabase.accommodation.ts` | IAccommodationRepository |
| Create | `src/repositories/supabase/supabase.zones.ts` | IZoneRepository |
| Create | `src/repositories/supabase/supabase.groups.ts` | IGroupRepository |
| Create | `src/repositories/supabase/supabase.notes.ts` | INoteRepository |
| Create | `src/repositories/supabase/supabase.notifications.ts` | INotificationRepository |
| Create | `src/repositories/supabase/supabase.schedule.ts` | IScheduleRepository |
| Create | `src/repositories/supabase/supabase.devotionals.ts` | IDevotionalRepository |
| Create | `src/repositories/supabase/supabase.faqs.ts` | IFaqRepository |
| Create | `src/repositories/supabase/supabase.settings.ts` | ISettingsRepository (singleton) |
| Create | `src/repositories/supabase/supabase.defaults.ts` | ISnapshotRepository (singleton JSONB) |
| Create | `src/repositories/supabase/index.ts` | Re-exports all Supabase repo classes |
| Modify | `src/container.ts` | Add `PERSISTENCE==='supabase'` branch |

### Phase C — Security & Quality

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/index.ts` | Add `unhandledRejection` + `uncaughtException` crash guards |
| Modify | `src/api/middleware/error.middleware.ts` | Confirm no stack traces leak in production |
| Create | `.env.example` | Annotated env var reference |
| Create | `SECURITY-ACTIONS.md` | Operator first-deploy checklist |

### Phase D — Frontend Hardening

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `public/index.html` | Register SW + `controllerchange` auto-reload |

### Phase E — Vercel Deployment

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `vercel.json` | Route all requests to Express; serve `public/` as static |
| Create | `api/index.ts` | Thin Vercel entry: import `createAppInstance`, export handler |
| Modify | `src/api/http/router.ts` | Add `POST /setup` first-time admin password endpoint |

---

## Task 1: DTO Mappers + Seed Update

**Files:**
- Create: `src/api/dto/person.dto.ts`
- Modify: `src/data/seed.ts`

**Interfaces:**
- Produces: `toRegistrantDto(p: Person): RegistrantDto`, `toCamperDto(p: Person): CamperDto`, `toRosterEntry(p: Person, sessionId: string): RosterEntry` — used by Tasks 3, 4, 5.

- [ ] **Step 1: Create `src/api/dto/person.dto.ts`**

```typescript
import type { Person } from '../core/entities/person';
import { isCamper } from '../core/entities/person';

/**
 * The JSON shape /registrants returns — matches the SPA's pre-camp My Youth screen.
 * IMPORTANT: keep these field names stable; the SPA reads them bare.
 */
export interface RegistrantDto {
  id: string;
  firstName: string;
  lastName: string;
  kind: 'camper' | 'leader';           // legacy: 'camper' (not 'youth')
  paymentStatus: Person['paymentStatus'];
  blueCardCollected: boolean;           // derived: blueCardNumber != null
  churchId: string;
  churchName: string;
  zone: string;
  status: 'registered' | 'cancelled';  // legacy field mapped from lifecycle
  grade: Person['grade'];
  accommodationKind: Person['accommodationKind'];
  accommodationLabel: string | null;
  // write-round-trip fields (SPA sends these on create/update)
  mobile: string | null;
  parentGuardianName: string | null;
  parentPhone: string | null;
  gender: Person['gender'];
  medicalConditions: string[];
  dietaryRequirements: string[];
  blueCardNumber: string | null;
  blueCardExpiry: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The JSON shape /campers returns — matches the SPA's at-camp screens. */
export interface CamperDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  kind: 'student' | 'leader';          // legacy: 'student' (not 'youth')
  churchId: string;
  churchName: string;
  zone: string;
  groupId: string | null;
  mobile: string | null;
  grade: Person['grade'];
  medicalConditions: string[];
  dietaryRequirements: string[];
  parentGuardianName: string | null;
  parentPhone: string | null;
  blueCardNumber: string | null;
  blueCardExpiry: string | null;
  lifecycle: Person['lifecycle'];
  atCamp: boolean;
  checkInHistory: Person['checkInHistory'];
  signOutHistory: Person['signOutHistory'];
  createdAt: string;
  updatedAt: string;
}

/** Check-in roster entry shape the SPA reads from /checkin/status. */
export interface RosterEntry {
  camperId: string;
  firstName: string;
  lastName: string;
  church: string;
  zone: string;
  checkedIn: boolean;
  lastEntry: 'in' | 'out' | null;
}

export function toRegistrantDto(p: Person): RegistrantDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    kind: p.kind === 'leader' ? 'leader' : 'camper',
    paymentStatus: p.paymentStatus,
    blueCardCollected: p.blueCardNumber != null,
    churchId: p.churchId,
    churchName: p.churchName,
    zone: p.zone,
    status: p.lifecycle === 'cancelled' ? 'cancelled' : 'registered',
    grade: p.grade ?? null,
    accommodationKind: p.accommodationKind ?? null,
    accommodationLabel: p.accommodationLabel ?? null,
    mobile: p.mobile ?? null,
    parentGuardianName: p.parentGuardianName ?? null,
    parentPhone: p.parentPhone ?? null,
    gender: p.gender,
    medicalConditions: p.medicalConditions,
    dietaryRequirements: p.dietaryRequirements,
    blueCardNumber: p.blueCardNumber ?? null,
    blueCardExpiry: p.blueCardExpiry ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toCamperDto(p: Person): CamperDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`,
    kind: p.kind === 'leader' ? 'leader' : 'student',
    churchId: p.churchId,
    churchName: p.churchName,
    zone: p.zone,
    groupId: p.groupId ?? null,
    mobile: p.mobile ?? null,
    grade: p.grade ?? null,
    medicalConditions: p.medicalConditions,
    dietaryRequirements: p.dietaryRequirements,
    parentGuardianName: p.parentGuardianName ?? null,
    parentPhone: p.parentPhone ?? null,
    blueCardNumber: p.blueCardNumber ?? null,
    blueCardExpiry: p.blueCardExpiry ?? null,
    lifecycle: p.lifecycle,
    atCamp: p.atCamp,
    checkInHistory: p.checkInHistory,
    signOutHistory: p.signOutHistory,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toRosterEntry(p: Person, sessionId: string): RosterEntry {
  const sessionEntries = p.checkInHistory.filter((e) => e.sessionId === sessionId);
  const last = sessionEntries[sessionEntries.length - 1] ?? null;
  return {
    camperId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    church: p.churchName,
    zone: p.zone,
    checkedIn: last?.type === 'in',
    lastEntry: last?.type ?? null,
  };
}
```

- [ ] **Step 2: Update `src/data/seed.ts` to also populate `repos.people`**

Open `src/data/seed.ts`. After the existing `await repos.registrants.saveMany(registrants)` and `await repos.campers.saveMany(campers)` calls, add:

```typescript
import { personFromRegistrant, personFromCamper } from '../core/entities/person';

// Inside seedAll, after registrants and campers are seeded:
const people = [
  ...registrants.map(personFromRegistrant),
  ...campers.map(personFromCamper),
];
await repos.people.saveMany(people);
```

- [ ] **Step 3: Run tests to confirm seed change doesn't break anything**

```
npm run test
```

Expected: all tests pass (324+).

- [ ] **Step 4: Commit**

```
git add src/api/dto/person.dto.ts src/data/seed.ts
git commit -m "feat(A1): DTO mappers + seed people store from existing demo data"
```

---

## Task 2: Extend PersonService with chase/breakdown/remind

**Files:**
- Modify: `src/services/person.service.ts`

**Interfaces:**
- Consumes: `PersonService` interface defined in `src/services/person.service.ts:30-50`, `isRegistrant` from `src/core/entities/person.ts`, `blueCardCollected` derived as `blueCardNumber != null`.
- Produces: `PersonService.chase(actor)`, `PersonService.breakdown(actor)`, `PersonService.remind(actor, ids)` — consumed by Task 3.

- [ ] **Step 1: Add the three method signatures to the `PersonService` interface (lines 30–50 of `person.service.ts`)**

Add to the `PersonService` interface:

```typescript
chase(actor: Actor): Promise<ChaseResult[]>;
breakdown(actor: Actor): Promise<RegistrantBreakdown[]>;
remind(actor: Actor, ids: string[]): Promise<{ sent: number }>;
```

Also add the two return-type interfaces above the `PersonService` interface block:

```typescript
export interface RegistrantBreakdown {
  churchId: string;
  churchName: string;
  zone: string;
  total: number;
  campers: number;
  leaders: number;
  unpaid: number;
  depositPaid: number;
  paid: number;
  noBlueCard: number;
}

export interface ChaseResult {
  churchId: string;
  churchName: string;
  registrantId: string;
  firstName: string;
  lastName: string;
  reason: 'unpaid' | 'no_blue_card' | 'both';
}
```

- [ ] **Step 2: Implement the three methods inside `makePersonService` (after the existing `signEvent` method)**

```typescript
async chase(actor) {
  assertCan(actor, 'reminder:send');
  const all = await repo.findAll();
  const results: ChaseResult[] = [];
  for (const p of all) {
    if (!isRegistrant(p)) continue;
    if (actor.role === 'church' && p.churchId !== actor.churchId) continue;
    if (actor.role === 'zoneLeader' && actor.zone && p.zone !== actor.zone) continue;
    const unpaid = p.paymentStatus === 'unpaid';
    const noBlue = p.kind === 'leader' && p.blueCardNumber == null;
    if (unpaid || noBlue) {
      results.push({
        churchId: p.churchId,
        churchName: p.churchName,
        registrantId: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        reason: unpaid && noBlue ? 'both' : unpaid ? 'unpaid' : 'no_blue_card',
      });
    }
  }
  return results;
},

async breakdown(actor) {
  assertCan(actor, 'registrant:read');
  const all = await repo.findAll();
  const map = new Map<string, RegistrantBreakdown>();
  for (const p of all) {
    if (!isRegistrant(p)) continue;
    if (actor.role === 'church' && p.churchId !== actor.churchId) continue;
    if (actor.role === 'zoneLeader' && actor.zone && p.zone !== actor.zone) continue;
    let entry = map.get(p.churchId);
    if (!entry) {
      entry = { churchId: p.churchId, churchName: p.churchName, zone: p.zone,
        total: 0, campers: 0, leaders: 0, unpaid: 0, depositPaid: 0, paid: 0, noBlueCard: 0 };
      map.set(p.churchId, entry);
    }
    entry.total++;
    if (p.kind === 'youth') entry.campers++;
    if (p.kind === 'leader') entry.leaders++;
    if (p.paymentStatus === 'unpaid') entry.unpaid++;
    if (p.paymentStatus === 'deposit') entry.depositPaid++;
    if (p.paymentStatus === 'paid') entry.paid++;
    if (p.kind === 'leader' && p.blueCardNumber == null) entry.noBlueCard++;
  }
  return Array.from(map.values()).sort((a, b) => a.zone.localeCompare(b.zone));
},

async remind(actor, ids) {
  assertCan(actor, 'reminder:send');
  if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestError('No IDs provided');
  let count = 0;
  for (const id of ids) {
    const p = await repo.findById(id);
    if (!p || !isRegistrant(p)) continue;
    if (actor.role === 'church' && p.churchId !== actor.churchId) continue;
    if (actor.role === 'zoneLeader' && actor.zone && p.zone !== actor.zone) continue;
    count++;
  }
  return { sent: count };
},
```

- [ ] **Step 3: Run tests**

```
npm run typecheck && npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```
git add src/services/person.service.ts
git commit -m "feat(A2): add chase/breakdown/remind to PersonService"
```

---

## Task 3: Repoint Registrant Controller to PersonService

**Files:**
- Modify: `src/api/controllers/registrant.controller.ts`

**Interfaces:**
- Consumes: `PersonService` (Task 2), `toRegistrantDto` from `src/api/dto/person.dto.ts` (Task 1).
- Produces: Same HTTP contract as before — `/registrants` returns `RegistrantDto[]`.

- [ ] **Step 1: Rewrite `src/api/controllers/registrant.controller.ts`**

Replace the entire file:

```typescript
import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import { toRegistrantDto } from '../dto/person.dto';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface RegistrantControllerServices {
  person: PersonService;
}

export function makeRegistrantController(services: RegistrantControllerServices) {
  const { person } = services;

  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.query['churchId'];
      const people = await person.listRegistrants(req.ctx.actor, churchId);
      return people.map(toRegistrantDto);
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return toRegistrantDto(await person.get(req.ctx.actor, id));
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as Record<string, unknown>;
      const p = await person.create(req.ctx.actor, {
        firstName: b['firstName'] as string,
        lastName: b['lastName'] as string,
        gender: b['gender'] as 'male' | 'female' | 'other',
        kind: b['kind'] === 'leader' ? 'leader' : 'youth',
        grade: (b['grade'] as Person['grade']) ?? null,
        churchId: b['churchId'] as string,
        churchName: b['churchName'] as string,
        zone: b['zone'] as string,
        paymentStatus: (b['paymentStatus'] as Person['paymentStatus']) ?? 'unpaid',
        accommodationKind: (b['accommodationKind'] as Person['accommodationKind']) ?? null,
        accommodationLabel: (b['accommodationLabel'] as string) ?? null,
        parentGuardianName: (b['parentGuardianName'] as string) ?? null,
        parentPhone: (b['parentPhone'] as string) ?? null,
        mobile: (b['mobile'] as string) ?? null,
      });
      return toRegistrantDto(p);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const b = req.body as Record<string, unknown>;
      // Map the SPA's blueCardCollected boolean back to blueCardNumber.
      // If the SPA is toggling blueCardCollected ON, preserve any existing number
      // or set a placeholder; toggling OFF clears it.
      const existing = await person.get(req.ctx.actor, id);
      let blueCardNumber = existing.blueCardNumber;
      if ('blueCardCollected' in b) {
        blueCardNumber = b['blueCardCollected'] ? (existing.blueCardNumber ?? 'collected') : null;
      }
      if ('blueCardNumber' in b) {
        blueCardNumber = (b['blueCardNumber'] as string | null) ?? null;
      }
      const patch: Partial<import('../../core/entities/person').Person> = {
        ...(b['firstName'] !== undefined && { firstName: b['firstName'] as string }),
        ...(b['lastName'] !== undefined && { lastName: b['lastName'] as string }),
        ...(b['gender'] !== undefined && { gender: b['gender'] as 'male' | 'female' | 'other' }),
        ...(b['kind'] !== undefined && { kind: b['kind'] === 'leader' ? 'leader' : 'youth' }),
        ...(b['grade'] !== undefined && { grade: b['grade'] as Person['grade'] }),
        ...(b['paymentStatus'] !== undefined && { paymentStatus: b['paymentStatus'] as Person['paymentStatus'] }),
        ...(b['accommodationKind'] !== undefined && { accommodationKind: b['accommodationKind'] as Person['accommodationKind'] }),
        ...(b['accommodationLabel'] !== undefined && { accommodationLabel: b['accommodationLabel'] as string }),
        ...(b['mobile'] !== undefined && { mobile: b['mobile'] as string }),
        ...(b['parentGuardianName'] !== undefined && { parentGuardianName: b['parentGuardianName'] as string }),
        ...(b['parentPhone'] !== undefined && { parentPhone: b['parentPhone'] as string }),
        ...(b['blueCardExpiry'] !== undefined && { blueCardExpiry: b['blueCardExpiry'] as string }),
        blueCardNumber,
      };
      return toRegistrantDto(await person.update(req.ctx.actor, id, patch));
    },

    async remove(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await person.remove(req.ctx.actor, id);
      return { ok: true };
    },

    async chase(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return person.chase(req.ctx.actor);
    },

    async breakdown(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return person.breakdown(req.ctx.actor);
    },

    async remind(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const body = req.body as { ids?: string[] };
      return person.remind(req.ctx.actor, body.ids ?? []);
    },
  };
}
```

Add the `Person` type import at the top of the file:
```typescript
import type { Person } from '../../core/entities/person';
```

- [ ] **Step 2: Run typecheck**

```
npm run typecheck
```

Fix any errors. Expected: only supabase scaffolding errors (4 known).

- [ ] **Step 3: Run tests**

```
npm run test
```

Expected: all pass.

- [ ] **Step 4: Commit**

```
git add src/api/controllers/registrant.controller.ts
git commit -m "feat(A3): repoint registrant controller to PersonService"
```

---

## Task 4: Repoint Camper, CheckIn, and Attendance Controllers

**Files:**
- Modify: `src/api/controllers/camper.controller.ts`
- Modify: `src/api/controllers/checkin.controller.ts`
- Modify: `src/api/controllers/attendance.controller.ts`

**Interfaces:**
- Consumes: `PersonService.checkIn`, `PersonService.signEvent`, `PersonService.listCampers`, `toCamperDto`, `toRosterEntry` (Task 1).
- Produces: Same HTTP contracts as before for `/campers`, `/checkin/status`, `/attendance/sign-in`, `/attendance/sign-out`.

- [ ] **Step 1: Rewrite `src/api/controllers/camper.controller.ts`**

```typescript
import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import { toCamperDto } from '../dto/person.dto';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface CamperControllerServices {
  person: PersonService;
}

export function makeCamperController(services: CamperControllerServices) {
  const { person } = services;

  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const { zone, churchId, q } = req.query as Record<string, string | undefined>;
      const people = await person.listCampers(req.ctx.actor, { zone, churchId, q });
      return people.map(toCamperDto);
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const profile = await person.getProfile(req.ctx.actor, id);
      return { ...toCamperDto(profile), fullName: profile.fullName, age: profile.age, lastSignOut: profile.lastSignOut };
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      const b = req.body as Record<string, unknown>;
      const patch: Partial<import('../../core/entities/person').Person> = {
        ...(b['mobile'] !== undefined && { mobile: b['mobile'] as string }),
        ...(b['groupId'] !== undefined && { groupId: b['groupId'] as string }),
        ...(b['medicalConditions'] !== undefined && { medicalConditions: b['medicalConditions'] as string[] }),
        ...(b['dietaryRequirements'] !== undefined && { dietaryRequirements: b['dietaryRequirements'] as string[] }),
        ...(b['blueCardNumber'] !== undefined && { blueCardNumber: b['blueCardNumber'] as string }),
        ...(b['blueCardExpiry'] !== undefined && { blueCardExpiry: b['blueCardExpiry'] as string }),
      };
      return toCamperDto(await person.update(req.ctx.actor, id, patch));
    },
  };
}
```

- [ ] **Step 2: Rewrite `src/api/controllers/checkin.controller.ts`**

Read the current file first, then replace the `checkIn` handler to call `person.checkIn()`. The `getStatus` handler needs to be updated to build the roster from `repos.people`. Open the file and update the `checkIn` method:

```typescript
// In the checkin controller, change the checkIn handler to:
async checkIn(req: HttpRequest) {
  if (!req.ctx) throw new UnauthorizedError();
  const b = req.body as { camperId: string; sessionId: string; sessionLabel: string; type: 'in' | 'out'; leaderId: string; timestamp?: string };
  if (!b.camperId) throw new BadRequestError('Missing camperId');
  await services.person.checkIn(req.ctx.actor, b.camperId, {
    sessionId: b.sessionId,
    sessionLabel: b.sessionLabel,
    type: b.type,
    leaderId: b.leaderId,
    timestamp: b.timestamp ?? new Date().toISOString(),
  });
  return { ok: true };
},
```

The `getStatus` handler calls `checkIn.getSessionStatus()` which builds the roster — update `checkin.service.ts` in the next step to use `repos.people`.

- [ ] **Step 3: Rewrite `src/api/controllers/attendance.controller.ts`**

```typescript
import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface AttendanceControllerServices {
  person: PersonService;
}

export function makeAttendanceController(services: AttendanceControllerServices) {
  const { person } = services;

  return {
    async signIn(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as { camperId: string; leaderName?: string; authorId?: string };
      if (!b.camperId) throw new BadRequestError('Missing camperId');
      await person.signEvent(req.ctx.actor, b.camperId, {
        type: 'in',
        leaderName: b.leaderName ?? req.ctx.actor.firstName ?? 'Staff',
        authorId: b.authorId ?? req.ctx.actor.id,
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    },

    async signOut(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as { camperId: string; reason?: string; parentsMet?: boolean; leaderName?: string; authorId?: string };
      if (!b.camperId) throw new BadRequestError('Missing camperId');
      await person.signEvent(req.ctx.actor, b.camperId, {
        type: 'out',
        leaderName: b.leaderName ?? req.ctx.actor.firstName ?? 'Staff',
        reason: b.reason,
        parentsMet: b.parentsMet,
        authorId: b.authorId ?? req.ctx.actor.id,
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    },
  };
}
```

- [ ] **Step 4: Update `src/services/checkin.service.ts` roster builder**

Read the current `getSessionStatus` method. Find where it calls `camperRepo.findAll()` or similar to build the roster. Replace with `personRepo.findCampers()` and use `toRosterEntry` from the DTO:

The `makeCheckInService` factory signature changes from `(scheduleRepo, camperRepo, settingsRepo)` to `(scheduleRepo, personRepo, settingsRepo)`. Update the import and parameter name. Build the roster using `toRosterEntry(p, sessionId)` from `src/api/dto/person.dto.ts`.

```typescript
// Updated factory signature:
import type { IPersonRepository } from '../repositories/interfaces/entity-repositories';
import { toRosterEntry } from '../api/dto/person.dto';

export function makeCheckInService(
  scheduleRepo: IScheduleRepository,
  personRepo: IPersonRepository,
  settingsRepo: ISettingsRepository,
): CheckInService {
  // ... existing getCurrentSession logic unchanged ...

  return {
    // ... getCurrentSession unchanged ...

    async getSessionStatus(actor, sessionId) {
      assertCan(actor, 'checkin:read');
      const people = await personRepo.findCampers();
      const visible = people.filter(p => canAccessPerson(actor, p));
      const roster = visible.map(p => toRosterEntry(p, sessionId));
      const checkedInCount = roster.filter(r => r.checkedIn).length;
      const session = await scheduleRepo.findById(sessionId);
      return {
        session: session ?? null,
        roster,
        checkedInCount,
        totalCount: roster.length,
      };
    },
  };
}
```

- [ ] **Step 5: Run typecheck + tests**

```
npm run typecheck && npm run test
```

Expected: all pass (fix any type errors from the controller rewrites before proceeding).

- [ ] **Step 6: Commit**

```
git add src/api/controllers/camper.controller.ts src/api/controllers/checkin.controller.ts src/api/controllers/attendance.controller.ts src/services/checkin.service.ts
git commit -m "feat(A4): repoint camper/checkin/attendance controllers to PersonService"
```

---

## Task 5: Migrate Remaining Service Consumers

**Files:**
- Modify: `src/services/dashboard.service.ts`
- Modify: `src/services/search.service.ts`
- Modify: `src/services/note.service.ts`
- Modify: `src/services/import.service.ts`
- Modify: `src/services/admin.service.ts`

**Interfaces:**
- Consumes: `IPersonRepository` from `src/repositories/interfaces/entity-repositories.ts`, `isCamper`/`isRegistrant` from `src/core/entities/person.ts`.

- [ ] **Step 1: Update `src/services/dashboard.service.ts`**

Read the current file. Replace all `camperRepo` and `registrantRepo` references with `personRepo: IPersonRepository`. Count registrants via `p.lifecycle === 'registered'`, campers via `isCamper(p)`. The factory signature changes from `(registrantRepo, camperRepo, accommodationRepo, notifications, scheduleRepo, churches)` to `(personRepo, accommodationRepo, notifications, scheduleRepo, churches)`.

Key counts to update:
```typescript
// Pre-camp home:
const allPeople = await personRepo.findAll();
const registrants = allPeople.filter(isRegistrant);
const totalRegistrants = registrants.length;
const noBlueCardCount = registrants.filter(p => p.kind === 'leader' && p.blueCardNumber == null).length;

// At-camp home:
const campers = await personRepo.findCampers();
const scopedCampers = campers.filter(p => canAccessPerson(actor, p));
const totalAtCamp = scopedCampers.filter(p => p.atCamp).length;
```

- [ ] **Step 2: Update `src/services/search.service.ts`**

Replace `camperRepo: ICamperRepository` with `personRepo: IPersonRepository`. The search call becomes `personRepo.search(query)` filtered through `canAccessPerson`. The response shape `{ camper, contacts[] }` stays unchanged — map the matched person to a `CamperDto` using `toCamperDto` for the `camper` field.

- [ ] **Step 3: Update `src/services/note.service.ts`**

Replace the camper existence check (`camperRepo.findById(camperId)`) with `personRepo.findById(camperId)`. The `StudentNote.camperId` field still refers to the person's id — no schema change.

- [ ] **Step 4: Update `src/services/import.service.ts`**

Read the current file. The import service currently writes `Camper` rows via `camperRepo`. Replace with `Person` rows via `personRepo.saveMany`. Map CSV `kind` values: `'student'` → `'youth'`, `'camper'` → `'youth'`, `'leader'` → `'leader'`. The phone-dedup index logic (church+name+phone) ports directly.

Key change: factory becomes `makeImportService(personRepo: IPersonRepository, churchRepo: IChurchRepository)`.

When creating a new Person from CSV:
```typescript
const person: Person = {
  id: newId('person'),
  firstName: row.firstName,
  lastName: row.lastName,
  gender: (row.gender as Person['gender']) ?? 'male',
  kind: row.kind === 'leader' ? 'leader' : 'youth',
  churchId: church.id,
  churchName: church.name,
  zone: church.zone,
  // ... all other fields default/null ...
  mobile: row.mobile ?? null,
  lifecycle: 'registered',
  atCamp: false,
  paymentStatus: 'unpaid',
  checkInHistory: [],
  signOutHistory: [],
  medicalConditions: [],
  dietaryRequirements: [],
  consents: { medical: { granted: false, timestamp: null }, media: { granted: false, timestamp: null }, supervision: { granted: false, timestamp: null } },
  createdAt: nowISO(),
  updatedAt: nowISO(),
};
```

- [ ] **Step 5: Update `src/services/admin.service.ts`**

In `reset()` and `newYear()`, replace:
```typescript
await registrantRepo.deleteAll();
await camperRepo.deleteAll();
```
with:
```typescript
await personRepo.deleteAll();
```

Update the `makeAdminService` factory to take `personRepo: IPersonRepository` instead of the two separate repos.

- [ ] **Step 6: Run typecheck + tests**

```
npm run typecheck && npm run test
```

Expected: all pass. Fix any errors before proceeding.

- [ ] **Step 7: Commit**

```
git add src/services/dashboard.service.ts src/services/search.service.ts src/services/note.service.ts src/services/import.service.ts src/services/admin.service.ts
git commit -m "feat(A5): migrate dashboard/search/note/import/admin consumers to PersonService"
```

---

## Task 6: Delete Legacy Code and Rewire Container

**Files:**
- Modify: `src/container.ts` — remove legacy repos/services; add `person` service
- Delete: legacy entity, service, validation, and test files

**Interfaces:**
- Produces: Updated `Services` interface with `person: PersonService` replacing `registrant: RegistrantService`, `camper: CamperService`, `attendance: AttendanceService`.

- [ ] **Step 1: Delete legacy files**

```
git rm src/core/entities/registrant.ts
git rm src/core/entities/camper.ts
git rm src/services/registrant.service.ts
git rm src/services/camper.service.ts
git rm src/services/attendance.service.ts
git rm src/core/validation/registrant.schema.ts
git rm src/core/validation/camper.schema.ts
git rm src/services/registrant.characterisation.test.ts
git rm src/services/camper.characterisation.test.ts
git rm src/services/checkin.characterisation.test.ts
```

- [ ] **Step 2: Update `src/container.ts`**

Remove all imports and references to: `InMemoryRegistrantRepository`, `InMemoryCamperRepository`, `IRegistrantRepository`, `ICamperRepository`, `Registrant`, `Camper`, `makeRegistrantService`, `makeCamperService`, `makeAttendanceService`, `RegistrantService`, `CamperService`, `AttendanceService`.

Remove `registrants` and `campers` from the `Repositories` interface; remove `registrant`, `camper`, `attendance` from `Services`.

Add to `Services`:
```typescript
person: PersonService;
```

Add import:
```typescript
import { makePersonService, type PersonService } from './services/person.service';
```

In `buildContainer()`, remove the `registrants`, `campers`, `registrantSvc`, `camper`, `attendance` constructions. Add:
```typescript
const personSvc = makePersonService(people);
```

Update service wiring for `checkIn`, `search`, `note`, `dashboard`, `importSvc`, `admin` to pass `people` instead of the removed repos.

Update `services` object:
```typescript
const services: Services = {
  auth,
  settings,
  person: personSvc,
  accommodation: accommodationSvc,
  checkIn,
  notification,
  search,
  note,
  schedule,
  content,
  importService: importSvc,
  account,
  dashboard,
  admin,
  users,
};
```

- [ ] **Step 3: Update `src/api/http/router.ts`**

Read the router file. Update `makeRegistrantController` and `makeCamperController` to receive `{ person: services.person }` instead of `{ registrant: services.registrant }` / `{ camper: services.camper }`. Remove `makeAttendanceController` registration if it was wired separately; the new attendance controller takes `{ person }`.

- [ ] **Step 4: Update barrel files**

Check `src/services/index.ts`, `src/core/validation/index.ts`, `src/core/entities/index.ts` — remove exports for deleted files.

- [ ] **Step 5: Run typecheck**

```
npm run typecheck
```

Fix all errors. This step will surface missing imports and stale references. Common fixes:
- Any file still importing from `registrant.ts` or `camper.ts` — update to import from `person.ts`
- `CheckInEntry` and `SignOutEvent` are imported from `camper.ts` throughout — move them to `person.ts` (add them to `src/core/entities/person.ts` and update all importers)

- [ ] **Step 6: Run tests**

```
npm run test
```

Expected: all characterisation tests for the deleted services are gone; remaining tests pass.

- [ ] **Step 7: Commit**

```
git add -A
git commit -m "feat(A6): delete legacy Registrant/Camper entities and rewire container to PersonService"
```

---

## Task 7: Phase A Smoke Test

**Files:** none — verification only.

- [ ] **Step 1: Start dev server**

```
npm run dev
```

Expected: server starts on http://localhost:4200 with no errors.

- [ ] **Step 2: Login as church user and verify pre-camp view**

Visit http://localhost:4200 → login with `victory` / `demo1234`. Verify:
- Pre-camp home loads with registrant counts
- My Youth tab shows registrant list
- Add a registrant → it appears in the list
- Edit a registrant's payment status → change persists

- [ ] **Step 3: Verify at-camp flow**

Login as `admin` / `demo1234` → switch to at-camp mode via Admin console. Then login as `victory`:
- Check-in tab shows roster
- Check in a person → they appear as checked in
- Sign them out and back in via the sign-out flow

- [ ] **Step 4: Final test run**

```
npm run typecheck && npm run test
```

Expected: both green.

- [ ] **Step 5: Commit**

```
git add -A
git commit -m "chore: Phase A complete — Person unification live, all tests green"
```

---

## Task 8: Add postgres Dependency and Fix Supabase Scaffolding

**Files:**
- Modify: `package.json`
- Modify: `src/repositories/supabase/supabase.people.ts` (fix 2 implicit-`any` params)

- [ ] **Step 1: Install postgres**

```
npm install postgres
```

- [ ] **Step 2: Fix implicit-`any` params in `supabase.people.ts`**

Open `src/repositories/supabase/supabase.people.ts`. Find lines 188 and 199 (the two `r` and `tx` parameters with implicit `any`). Add explicit types:

Line ~188: `for (const r of ciRows)` — `r` is already typed from the query result; if the error is on a `.map` or arrow function, type it as `Record<string, unknown>`.

Line ~199/211: The `tx` parameter in `sql.begin(async (tx) => {})` — type it as `SqlClient`:
```typescript
await this.sql.begin(async (tx: SqlClient) => {
```

- [ ] **Step 3: Remove the stale comment from `src/repositories/supabase/client.ts`**

Remove the `⚠️ UNVERIFIED SCAFFOLDING` comment header. The scaffolding is now being verified.

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

Expected: 0 errors (all 4 prior errors resolved).

- [ ] **Step 5: Run tests**

```
npm run test
```

Expected: all pass (tests still run on in-memory; postgres package is a new dep but not exercised).

- [ ] **Step 6: Commit**

```
git add package.json package-lock.json src/repositories/supabase/
git commit -m "chore(B0): add postgres dep and fix Supabase scaffolding typecheck"
```

---

## Task 9: Supabase Users and Churches Repositories

**Files:**
- Create: `src/repositories/supabase/supabase.users.ts`
- Create: `src/repositories/supabase/supabase.churches.ts`

**Interfaces:**
- Consumes: `IUserRepository`, `IChurchRepository` from `src/repositories/interfaces/entity-repositories.ts`; `SqlClient` from `./client`.
- Produces: `SupabaseUserRepository`, `SupabaseChurchRepository` — consumed by Task 15.

- [ ] **Step 1: Read the User and Church entity interfaces**

Read `src/core/entities/user.ts` and `src/core/entities/church.ts` to confirm field names.

- [ ] **Step 2: Create `src/repositories/supabase/supabase.users.ts`**

```typescript
import type { SqlClient } from './client';
import type { IUserRepository } from '../interfaces/entity-repositories';
import type { User } from '../../core/entities/user';

function toUser(row: Record<string, unknown>): User {
  return {
    id: row['id'] as string,
    firstName: row['first_name'] as string,
    lastName: row['last_name'] as string,
    username: row['username'] as string,
    mobile: (row['mobile'] as string | null) ?? undefined,
    role: row['role'] as User['role'],
    churchId: (row['church_id'] as string | null) ?? undefined,
    churchName: (row['church_name'] as string | null) ?? undefined,
    zone: (row['zone'] as string | null) ?? undefined,
    status: row['status'] as User['status'],
    passwordHash: (row['password_hash'] as string | null) ?? undefined,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function userColumns(u: User): Record<string, unknown> {
  return {
    id: u.id,
    first_name: u.firstName,
    last_name: u.lastName,
    username: u.username,
    mobile: u.mobile ?? null,
    role: u.role,
    church_id: u.churchId ?? null,
    church_name: u.churchName ?? null,
    zone: u.zone ?? null,
    status: u.status,
    password_hash: u.passwordHash ?? null,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

const UPDATE_COLS = ['first_name','last_name','username','mobile','role','church_id','church_name','zone','status','password_hash','updated_at'] as const;

export class SupabaseUserRepository implements IUserRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  async findAll(): Promise<User[]> {
    const rows = await this.sql`select * from users order by last_name, first_name`;
    return rows.map(toUser);
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.sql`select * from users where id = ${id}`;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const rows = await this.sql`select * from users where lower(username) = lower(${username})`;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findByRole(role: string): Promise<User[]> {
    const rows = await this.sql`select * from users where role = ${role} order by last_name`;
    return rows.map(toUser);
  }

  async save(user: User): Promise<User> {
    await this.sql`
      insert into users ${this.sql(userColumns(user))}
      on conflict (id) do update set ${this.sql(userColumns(user), ...UPDATE_COLS)}
    `;
    return user;
  }

  async saveMany(users: User[]): Promise<User[]> {
    if (users.length === 0) return [];
    for (const u of users) await this.save(u);
    return users;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from users where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from users where role != 'admin' returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 3: Create `src/repositories/supabase/supabase.churches.ts`**

```typescript
import type { SqlClient } from './client';
import type { IChurchRepository } from '../interfaces/entity-repositories';
import type { Church } from '../../core/entities/church';

function toChurch(row: Record<string, unknown>, reservations: Church['reservations']): Church {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    zone: row['zone'] as string,
    code: row['code'] as string,
    selfRegisterSlug: row['self_register_slug'] as string,
    expectedCount: row['expected_count'] as number,
    youthPastorName: (row['youth_pastor_name'] as string | null) ?? undefined,
    contactEmail: (row['contact_email'] as string | null) ?? undefined,
    contactPhone: (row['contact_phone'] as string | null) ?? undefined,
    contacts: (row['contacts'] as Church['contacts']) ?? {},
    reservations,
    createdAt: (row['created_at'] as Date).toISOString(),
    updatedAt: (row['updated_at'] as Date).toISOString(),
  };
}

function churchColumns(c: Church): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    zone: c.zone,
    code: c.code,
    self_register_slug: c.selfRegisterSlug,
    expected_count: c.expectedCount,
    youth_pastor_name: c.youthPastorName ?? null,
    contact_email: c.contactEmail ?? null,
    contact_phone: c.contactPhone ?? null,
    contacts: c.contacts ?? {},
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

const UPDATE_COLS = ['name','zone','code','self_register_slug','expected_count','youth_pastor_name','contact_email','contact_phone','contacts','updated_at'] as const;

export class SupabaseChurchRepository implements IChurchRepository {
  constructor(private sql: SqlClient) {}

  async init(): Promise<void> {}

  private async loadReservations(churchIds: string[]): Promise<Map<string, Church['reservations']>> {
    const map = new Map<string, Church['reservations']>();
    if (churchIds.length === 0) return map;
    const rows = await this.sql`select * from reservations where church_id in ${this.sql(churchIds)}`;
    for (const r of rows) {
      const cid = r['church_id'] as string;
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push({
        id: r['id'] as string,
        churchId: cid,
        kind: r['kind'] as 'tent' | 'classroom',
        spots: r['spots'] as number,
        label: r['label'] as string,
        confirmed: r['confirmed'] as boolean,
      });
    }
    return map;
  }

  private async hydrate(rows: readonly Record<string, unknown>[]): Promise<Church[]> {
    const ids = rows.map(r => r['id'] as string);
    const resMap = await this.loadReservations(ids);
    return rows.map(r => toChurch(r, resMap.get(r['id'] as string) ?? []));
  }

  async findAll(): Promise<Church[]> {
    return this.hydrate(await this.sql`select * from churches order by zone, name`);
  }

  async findById(id: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where id = ${id}`;
    return rows[0] ? (await this.hydrate(rows))[0] ?? null : null;
  }

  async findByZone(zone: string): Promise<Church[]> {
    return this.hydrate(await this.sql`select * from churches where zone = ${zone} order by name`);
  }

  async findBySlug(slug: string): Promise<Church | null> {
    const rows = await this.sql`select * from churches where self_register_slug = ${slug}`;
    return rows[0] ? (await this.hydrate(rows))[0] ?? null : null;
  }

  async save(church: Church): Promise<Church> {
    await this.sql.begin(async (tx: SqlClient) => {
      await tx`
        insert into churches ${tx(churchColumns(church))}
        on conflict (id) do update set ${tx(churchColumns(church), ...UPDATE_COLS)}
      `;
      await tx`delete from reservations where church_id = ${church.id}`;
      if (church.reservations.length > 0) {
        await tx`insert into reservations ${tx(church.reservations.map(r => ({
          id: r.id, church_id: r.churchId, kind: r.kind, spots: r.spots, label: r.label, confirmed: r.confirmed,
        })))}`;
      }
    });
    return church;
  }

  async saveMany(churches: Church[]): Promise<Church[]> {
    for (const c of churches) await this.save(c);
    return churches;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from churches where id = ${id} returning id`;
    return rows.length > 0;
  }

  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from churches returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```
git add src/repositories/supabase/supabase.users.ts src/repositories/supabase/supabase.churches.ts
git commit -m "feat(B1): Supabase users and churches repositories"
```

---

## Task 10: Supabase Accommodation, Zones, and Groups Repositories

**Files:**
- Create: `src/repositories/supabase/supabase.accommodation.ts`
- Create: `src/repositories/supabase/supabase.zones.ts`
- Create: `src/repositories/supabase/supabase.groups.ts`

- [ ] **Step 1: Read entity interfaces**

Read `src/core/entities/accommodation.ts`, `src/core/entities/zone.ts`, `src/core/entities/group.ts` to confirm field names.

- [ ] **Step 2: Create `src/repositories/supabase/supabase.accommodation.ts`**

```typescript
import type { SqlClient } from './client';
import type { IAccommodationRepository } from '../interfaces/entity-repositories';
import type { AccommodationBlock } from '../../core/entities/accommodation';

function toBlock(r: Record<string, unknown>): AccommodationBlock {
  return {
    id: r['id'] as string,
    kind: r['kind'] as AccommodationBlock['kind'],
    name: r['name'] as string,
    price: r['price'] as number,
    capacity: r['capacity'] as number,
    baseTaken: r['base_taken'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function blockCols(b: AccommodationBlock): Record<string, unknown> {
  return { id: b.id, kind: b.kind, name: b.name, price: b.price, capacity: b.capacity, base_taken: b.baseTaken, created_at: b.createdAt, updated_at: b.updatedAt };
}

const UPDATE_COLS = ['kind','name','price','capacity','base_taken','updated_at'] as const;

export class SupabaseAccommodationRepository implements IAccommodationRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async findAll(): Promise<AccommodationBlock[]> {
    return (await this.sql`select * from accommodation_blocks order by kind, name`).map(toBlock);
  }
  async findById(id: string): Promise<AccommodationBlock | null> {
    const rows = await this.sql`select * from accommodation_blocks where id = ${id}`;
    return rows[0] ? toBlock(rows[0]) : null;
  }
  async save(block: AccommodationBlock): Promise<AccommodationBlock> {
    await this.sql`insert into accommodation_blocks ${this.sql(blockCols(block))} on conflict (id) do update set ${this.sql(blockCols(block), ...UPDATE_COLS)}`;
    return block;
  }
  async saveMany(blocks: AccommodationBlock[]): Promise<AccommodationBlock[]> {
    for (const b of blocks) await this.save(b);
    return blocks;
  }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from accommodation_blocks where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from accommodation_blocks returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 3: Create `src/repositories/supabase/supabase.zones.ts`**

```typescript
import type { SqlClient } from './client';
import type { IZoneRepository } from '../interfaces/entity-repositories';
import type { Zone } from '../../core/entities/zone';

function toZone(r: Record<string, unknown>): Zone {
  return { id: r['id'] as string, name: r['name'] as string, color: (r['color'] as string | null) ?? undefined };
}

export class SupabaseZoneRepository implements IZoneRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<Zone[]> { return (await this.sql`select * from zones order by name`).map(toZone); }
  async findById(id: string): Promise<Zone | null> { const rows = await this.sql`select * from zones where id = ${id}`; return rows[0] ? toZone(rows[0]) : null; }
  async save(zone: Zone): Promise<Zone> {
    await this.sql`insert into zones ${this.sql({ id: zone.id, name: zone.name, color: zone.color ?? null })} on conflict (id) do update set name = excluded.name, color = excluded.color`;
    return zone;
  }
  async saveMany(zones: Zone[]): Promise<Zone[]> { for (const z of zones) await this.save(z); return zones; }
  async delete(id: string): Promise<boolean> { const rows = await this.sql`delete from zones where id = ${id} returning id`; return rows.length > 0; }
  async deleteAll(): Promise<number> { const rows = await this.sql`delete from zones returning id`; return rows.length; }
}
```

- [ ] **Step 4: Create `src/repositories/supabase/supabase.groups.ts`**

```typescript
import type { SqlClient } from './client';
import type { IGroupRepository } from '../interfaces/entity-repositories';
import type { Group } from '../../core/entities/group';

function toGroup(r: Record<string, unknown>): Group {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    churchId: (r['church_id'] as string | null) ?? undefined,
    zone: (r['zone'] as string | null) ?? undefined,
    leaderId: (r['leader_id'] as string | null) ?? undefined,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function groupCols(g: Group): Record<string, unknown> {
  return { id: g.id, name: g.name, church_id: g.churchId ?? null, zone: g.zone ?? null, leader_id: g.leaderId ?? null, created_at: g.createdAt, updated_at: g.updatedAt };
}

export class SupabaseGroupRepository implements IGroupRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<Group[]> { return (await this.sql`select * from groups order by name`).map(toGroup); }
  async findById(id: string): Promise<Group | null> { const rows = await this.sql`select * from groups where id = ${id}`; return rows[0] ? toGroup(rows[0]) : null; }
  async findByChurch(churchId: string): Promise<Group[]> { return (await this.sql`select * from groups where church_id = ${churchId} order by name`).map(toGroup); }
  async save(group: Group): Promise<Group> {
    const cols = groupCols(group);
    await this.sql`insert into groups ${this.sql(cols)} on conflict (id) do update set ${this.sql(cols, 'name','church_id','zone','leader_id','updated_at')}`;
    return group;
  }
  async saveMany(groups: Group[]): Promise<Group[]> { for (const g of groups) await this.save(g); return groups; }
  async delete(id: string): Promise<boolean> { const rows = await this.sql`delete from groups where id = ${id} returning id`; return rows.length > 0; }
  async deleteAll(): Promise<number> { const rows = await this.sql`delete from groups returning id`; return rows.length; }
}
```

- [ ] **Step 5: Run typecheck + tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 6: Commit**

```
git add src/repositories/supabase/supabase.accommodation.ts src/repositories/supabase/supabase.zones.ts src/repositories/supabase/supabase.groups.ts
git commit -m "feat(B2): Supabase accommodation, zones, groups repositories"
```

---

## Task 11: Supabase Notes and Notifications Repositories

**Files:**
- Create: `src/repositories/supabase/supabase.notes.ts`
- Create: `src/repositories/supabase/supabase.notifications.ts`

- [ ] **Step 1: Read entity interfaces**

Read `src/core/entities/note.ts` and `src/core/entities/notification.ts`.

- [ ] **Step 2: Create `src/repositories/supabase/supabase.notes.ts`**

```typescript
import type { SqlClient } from './client';
import type { INoteRepository } from '../interfaces/entity-repositories';
import type { StudentNote } from '../../core/entities/note';

function toNote(r: Record<string, unknown>): StudentNote {
  return {
    id: r['id'] as string,
    camperId: r['camper_id'] as string,
    body: r['body'] as string,
    authorId: r['author_id'] as string,
    authorName: r['author_name'] as string,
    authorChurchId: (r['author_church_id'] as string | null) ?? undefined,
    sessionId: (r['session_id'] as string | null) ?? undefined,
    category: (r['category'] as StudentNote['category']) ?? undefined,
    createdAt: (r['created_at'] as Date).toISOString(),
  };
}

export class SupabaseNoteRepository implements INoteRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async findAll(): Promise<StudentNote[]> {
    return (await this.sql`select * from notes order by created_at desc`).map(toNote);
  }
  async findById(id: string): Promise<StudentNote | null> {
    const rows = await this.sql`select * from notes where id = ${id}`;
    return rows[0] ? toNote(rows[0]) : null;
  }
  async findByCamper(camperId: string): Promise<StudentNote[]> {
    return (await this.sql`select * from notes where camper_id = ${camperId} order by created_at desc`).map(toNote);
  }
  async findRecent(limit = 50): Promise<StudentNote[]> {
    return (await this.sql`select * from notes order by created_at desc limit ${limit}`).map(toNote);
  }
  async save(note: StudentNote): Promise<StudentNote> {
    await this.sql`insert into notes ${this.sql({
      id: note.id, camper_id: note.camperId, body: note.body,
      author_id: note.authorId, author_name: note.authorName,
      author_church_id: note.authorChurchId ?? null,
      session_id: note.sessionId ?? null,
      category: note.category ?? null,
      created_at: note.createdAt,
    })} on conflict (id) do update set body = excluded.body, category = excluded.category`;
    return note;
  }
  async saveMany(notes: StudentNote[]): Promise<StudentNote[]> { for (const n of notes) await this.save(n); return notes; }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from notes where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from notes returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 3: Create `src/repositories/supabase/supabase.notifications.ts`**

```typescript
import type { SqlClient } from './client';
import type { INotificationRepository } from '../interfaces/entity-repositories';
import type { Notification } from '../../core/entities/notification';

function toNotif(r: Record<string, unknown>): Notification {
  return {
    id: r['id'] as string,
    scope: r['scope'] as Notification['scope'],
    zone: (r['zone'] as string | null) ?? undefined,
    churchId: (r['church_id'] as string | null) ?? undefined,
    priority: r['priority'] as Notification['priority'],
    title: r['title'] as string,
    body: r['body'] as string,
    senderId: (r['sender_id'] as string | null) ?? undefined,
    senderName: (r['sender_name'] as string | null) ?? undefined,
    senderRole: (r['sender_role'] as string | null) ?? undefined,
    audienceEstimate: (r['audience_estimate'] as number | null) ?? undefined,
    expiresAt: r['expires_at'] ? (r['expires_at'] as Date).toISOString() : undefined,
    createdAt: (r['created_at'] as Date).toISOString(),
  };
}

export class SupabaseNotificationRepository implements INotificationRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async findAll(): Promise<Notification[]> {
    return (await this.sql`select * from notifications order by created_at desc`).map(toNotif);
  }
  async findById(id: string): Promise<Notification | null> {
    const rows = await this.sql`select * from notifications where id = ${id}`;
    return rows[0] ? toNotif(rows[0]) : null;
  }
  async findActive(): Promise<Notification[]> {
    return (await this.sql`select * from notifications where expires_at is null or expires_at > now() order by created_at desc`).map(toNotif);
  }
  async save(n: Notification): Promise<Notification> {
    await this.sql`insert into notifications ${this.sql({
      id: n.id, scope: n.scope, zone: n.zone ?? null, church_id: n.churchId ?? null,
      priority: n.priority, title: n.title, body: n.body,
      sender_id: n.senderId ?? null, sender_name: n.senderName ?? null, sender_role: n.senderRole ?? null,
      audience_estimate: n.audienceEstimate ?? null,
      expires_at: n.expiresAt ?? null,
      created_at: n.createdAt,
    })} on conflict (id) do update set title = excluded.title, body = excluded.body`;
    return n;
  }
  async saveMany(ns: Notification[]): Promise<Notification[]> { for (const n of ns) await this.save(n); return ns; }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from notifications where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from notifications returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 4: Run typecheck + tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 5: Commit**

```
git add src/repositories/supabase/supabase.notes.ts src/repositories/supabase/supabase.notifications.ts
git commit -m "feat(B3): Supabase notes and notifications repositories"
```

---

## Task 12: Supabase Schedule, Devotionals, and FAQs Repositories

**Files:**
- Create: `src/repositories/supabase/supabase.schedule.ts`
- Create: `src/repositories/supabase/supabase.devotionals.ts`
- Create: `src/repositories/supabase/supabase.faqs.ts`

- [ ] **Step 1: Read entity interfaces**

Read `src/core/entities/schedule.ts`, `src/core/entities/devotional.ts`, `src/core/entities/content.ts`.

- [ ] **Step 2: Create `src/repositories/supabase/supabase.schedule.ts`**

```typescript
import type { SqlClient } from './client';
import type { IScheduleRepository } from '../interfaces/entity-repositories';
import type { ScheduleItem } from '../../core/entities/schedule';

function toItem(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r['id'] as string,
    day: r['day'] as string,
    startTime: r['start_time'] as string,
    endTime: (r['end_time'] as string | null) ?? undefined,
    title: r['title'] as string,
    location: (r['location'] as string | null) ?? undefined,
    type: r['type'] as ScheduleItem['type'],
    isCheckInPoint: r['is_check_in_point'] as boolean,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function itemCols(s: ScheduleItem): Record<string, unknown> {
  return { id: s.id, day: s.day, start_time: s.startTime, end_time: s.endTime ?? null, title: s.title, location: s.location ?? null, type: s.type, is_check_in_point: s.isCheckInPoint, created_at: s.createdAt, updated_at: s.updatedAt };
}

const UPDATE_COLS = ['day','start_time','end_time','title','location','type','is_check_in_point','updated_at'] as const;

export class SupabaseScheduleRepository implements IScheduleRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async findAll(): Promise<ScheduleItem[]> {
    return (await this.sql`select * from schedule_items order by day, start_time`).map(toItem);
  }
  async findById(id: string): Promise<ScheduleItem | null> {
    const rows = await this.sql`select * from schedule_items where id = ${id}`;
    return rows[0] ? toItem(rows[0]) : null;
  }
  async findByDay(day: string): Promise<ScheduleItem[]> {
    return (await this.sql`select * from schedule_items where day = ${day} order by start_time`).map(toItem);
  }
  async getCheckInPoints(): Promise<ScheduleItem[]> {
    return (await this.sql`select * from schedule_items where is_check_in_point = true order by day, start_time`).map(toItem);
  }
  async save(item: ScheduleItem): Promise<ScheduleItem> {
    const cols = itemCols(item);
    await this.sql`insert into schedule_items ${this.sql(cols)} on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}`;
    return item;
  }
  async saveMany(items: ScheduleItem[]): Promise<ScheduleItem[]> { for (const i of items) await this.save(i); return items; }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from schedule_items where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from schedule_items returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 3: Create `src/repositories/supabase/supabase.devotionals.ts`**

```typescript
import type { SqlClient } from './client';
import type { IDevotionalRepository } from '../interfaces/entity-repositories';
import type { Devotional } from '../../core/entities/devotional';

function toDev(r: Record<string, unknown>): Devotional {
  return {
    id: r['id'] as string,
    day: r['day'] as string,
    verse: r['verse'] as string,
    reference: r['reference'] as string,
    reflection: r['reflection'] as string,
    prayer: r['prayer'] as string,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function devCols(d: Devotional): Record<string, unknown> {
  return { id: d.id, day: d.day, verse: d.verse, reference: d.reference, reflection: d.reflection, prayer: d.prayer, created_at: d.createdAt, updated_at: d.updatedAt };
}

const UPDATE_COLS = ['day','verse','reference','reflection','prayer','updated_at'] as const;

export class SupabaseDevotionalRepository implements IDevotionalRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<Devotional[]> { return (await this.sql`select * from devotionals order by day`).map(toDev); }
  async findById(id: string): Promise<Devotional | null> { const rows = await this.sql`select * from devotionals where id = ${id}`; return rows[0] ? toDev(rows[0]) : null; }
  async findByDay(day: string): Promise<Devotional | null> { const rows = await this.sql`select * from devotionals where day = ${day}`; return rows[0] ? toDev(rows[0]) : null; }
  async save(d: Devotional): Promise<Devotional> {
    const cols = devCols(d);
    await this.sql`insert into devotionals ${this.sql(cols)} on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}`;
    return d;
  }
  async saveMany(ds: Devotional[]): Promise<Devotional[]> { for (const d of ds) await this.save(d); return ds; }
  async delete(id: string): Promise<boolean> { const rows = await this.sql`delete from devotionals where id = ${id} returning id`; return rows.length > 0; }
  async deleteAll(): Promise<number> { const rows = await this.sql`delete from devotionals returning id`; return rows.length; }
}
```

- [ ] **Step 4: Create `src/repositories/supabase/supabase.faqs.ts`**

```typescript
import type { SqlClient } from './client';
import type { IFaqRepository } from '../interfaces/entity-repositories';
import type { FaqItem } from '../../core/entities/content';

function toFaq(r: Record<string, unknown>): FaqItem {
  return {
    id: r['id'] as string,
    question: r['question'] as string,
    answer: r['answer'] as string,
    order: r['order'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function faqCols(f: FaqItem): Record<string, unknown> {
  return { id: f.id, question: f.question, answer: f.answer, order: f.order, created_at: f.createdAt, updated_at: f.updatedAt };
}

export class SupabaseFaqRepository implements IFaqRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<FaqItem[]> { return (await this.sql`select * from faqs order by "order"`).map(toFaq); }
  async findById(id: string): Promise<FaqItem | null> { const rows = await this.sql`select * from faqs where id = ${id}`; return rows[0] ? toFaq(rows[0]) : null; }
  async save(f: FaqItem): Promise<FaqItem> {
    const cols = faqCols(f);
    await this.sql`insert into faqs ${this.sql(cols)} on conflict (id) do update set ${this.sql(cols, 'question','answer','"order"','updated_at')}`;
    return f;
  }
  async saveMany(fs: FaqItem[]): Promise<FaqItem[]> { for (const f of fs) await this.save(f); return fs; }
  async delete(id: string): Promise<boolean> { const rows = await this.sql`delete from faqs where id = ${id} returning id`; return rows.length > 0; }
  async deleteAll(): Promise<number> { const rows = await this.sql`delete from faqs returning id`; return rows.length; }
}
```

- [ ] **Step 5: Run typecheck + tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 6: Commit**

```
git add src/repositories/supabase/supabase.schedule.ts src/repositories/supabase/supabase.devotionals.ts src/repositories/supabase/supabase.faqs.ts
git commit -m "feat(B4): Supabase schedule, devotionals, FAQs repositories"
```

---

## Task 13: Supabase Settings and Defaults (Singleton) Repositories

**Files:**
- Create: `src/repositories/supabase/supabase.settings.ts`
- Create: `src/repositories/supabase/supabase.defaults.ts`

- [ ] **Step 1: Read entity interfaces**

Read `src/core/entities/settings.ts` to confirm `CampSettings` and `CampDefaults` shapes.

- [ ] **Step 2: Create `src/repositories/supabase/supabase.settings.ts`**

The `settings` table has a singleton row with `id = 'settings'` (enforced by a check constraint in migration 001). The `save` method uses `INSERT ... ON CONFLICT DO UPDATE`.

```typescript
import type { SqlClient } from './client';
import type { ISettingsRepository } from '../interfaces/entity-repositories';
import type { CampSettings } from '../../core/entities/settings';

function toSettings(r: Record<string, unknown>): CampSettings {
  return {
    id: r['id'] as string,
    campName: r['camp_name'] as string,
    year: r['year'] as number,
    startDate: r['start_date'] as string,
    endDate: r['end_date'] as string,
    timezone: r['timezone'] as string,
    checkInLocation: r['check_in_location'] as string,
    checkInFrom: r['check_in_from'] as string,
    checkInBanner: (r['check_in_banner'] as string | null) ?? undefined,
    registerBaseUrl: r['register_base_url'] as string,
    checkInDays: r['check_in_days'] as string[],
    accommodationLocked: r['accommodation_locked'] as boolean,
    campMode: r['camp_mode'] as CampSettings['campMode'],
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function settingsCols(s: CampSettings): Record<string, unknown> {
  return {
    id: 'settings',
    camp_name: s.campName,
    year: s.year,
    start_date: s.startDate,
    end_date: s.endDate,
    timezone: s.timezone,
    check_in_location: s.checkInLocation,
    check_in_from: s.checkInFrom,
    check_in_banner: s.checkInBanner ?? null,
    register_base_url: s.registerBaseUrl,
    check_in_days: s.checkInDays,
    accommodation_locked: s.accommodationLocked,
    camp_mode: s.campMode,
    created_at: s.createdAt,
    updated_at: s.updatedAt,
  };
}

const UPDATE_COLS = ['camp_name','year','start_date','end_date','timezone','check_in_location','check_in_from','check_in_banner','register_base_url','check_in_days','accommodation_locked','camp_mode','updated_at'] as const;

export class SupabaseSettingsRepository implements ISettingsRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async get(): Promise<CampSettings | null> {
    const rows = await this.sql`select * from settings where id = 'settings'`;
    return rows[0] ? toSettings(rows[0]) : null;
  }

  async save(settings: CampSettings): Promise<CampSettings> {
    const cols = settingsCols(settings);
    await this.sql`insert into settings ${this.sql(cols)} on conflict (id) do update set ${this.sql(cols, ...UPDATE_COLS)}`;
    return settings;
  }
}
```

- [ ] **Step 3: Create `src/repositories/supabase/supabase.defaults.ts`**

The `defaults` table stores the entire `CampDefaults` blob as a single JSONB column.

```typescript
import type { SqlClient } from './client';
import type { ISnapshotRepository } from '../interfaces/entity-repositories';
import type { CampDefaults } from '../../core/entities/settings';

export class SupabaseSnapshotRepository implements ISnapshotRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}

  async get(): Promise<CampDefaults | null> {
    const rows = await this.sql`select snapshot from defaults where id = 'defaults'`;
    return rows[0] ? (rows[0]['snapshot'] as CampDefaults) : null;
  }

  async save(defaults: CampDefaults): Promise<CampDefaults> {
    await this.sql`
      insert into defaults (id, snapshot) values ('defaults', ${this.sql.json(defaults)})
      on conflict (id) do update set snapshot = excluded.snapshot
    `;
    return defaults;
  }

  async delete(): Promise<void> {
    await this.sql`delete from defaults where id = 'defaults'`;
  }
}
```

- [ ] **Step 4: Run typecheck + tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 5: Commit**

```
git add src/repositories/supabase/supabase.settings.ts src/repositories/supabase/supabase.defaults.ts
git commit -m "feat(B5): Supabase settings and defaults singleton repositories"
```

---

## Task 14: Supabase Barrel and Container Wiring

**Files:**
- Create: `src/repositories/supabase/index.ts`
- Modify: `src/container.ts`

- [ ] **Step 1: Create `src/repositories/supabase/index.ts`**

```typescript
export { SupabasePersonRepository } from './supabase.people';
export { SupabaseUserRepository } from './supabase.users';
export { SupabaseChurchRepository } from './supabase.churches';
export { SupabaseAccommodationRepository } from './supabase.accommodation';
export { SupabaseZoneRepository } from './supabase.zones';
export { SupabaseGroupRepository } from './supabase.groups';
export { SupabaseNoteRepository } from './supabase.notes';
export { SupabaseNotificationRepository } from './supabase.notifications';
export { SupabaseScheduleRepository } from './supabase.schedule';
export { SupabaseDevotionalRepository } from './supabase.devotionals';
export { SupabaseFaqRepository } from './supabase.faqs';
export { SupabaseSettingsRepository } from './supabase.settings';
export { SupabaseSnapshotRepository } from './supabase.defaults';
```

- [ ] **Step 2: Add the Supabase branch to `src/container.ts`**

At the top of `container.ts`, add the import:
```typescript
import { getSqlClient } from './repositories/supabase/client';
import {
  SupabasePersonRepository, SupabaseUserRepository, SupabaseChurchRepository,
  SupabaseAccommodationRepository, SupabaseZoneRepository, SupabaseGroupRepository,
  SupabaseNoteRepository, SupabaseNotificationRepository, SupabaseScheduleRepository,
  SupabaseDevotionalRepository, SupabaseFaqRepository, SupabaseSettingsRepository,
  SupabaseSnapshotRepository,
} from './repositories/supabase';
```

In `buildContainer()`, replace the existing `const useJson = env.PERSISTENCE === 'json'` block with:

```typescript
const useSupabase = env.PERSISTENCE === 'supabase';
const useJson = env.PERSISTENCE === 'json';

let users: IUserRepository;
let churches: IChurchRepository;
let people: IPersonRepository;
let accommodationRepo: IAccommodationRepository;
let zones: IZoneRepository;
let groups: IGroupRepository;
let notes: INoteRepository;
let notifications: INotificationRepository;
let scheduleRepo: IScheduleRepository;
let devotionals: IDevotionalRepository;
let faqs: IFaqRepository;
let settingsRepo: ISettingsRepository;
let snapshots: ISnapshotRepository;

if (useSupabase) {
  const sql = getSqlClient();
  users = new SupabaseUserRepository(sql);
  churches = new SupabaseChurchRepository(sql);
  people = new SupabasePersonRepository(sql);
  accommodationRepo = new SupabaseAccommodationRepository(sql);
  zones = new SupabaseZoneRepository(sql);
  groups = new SupabaseGroupRepository(sql);
  notes = new SupabaseNoteRepository(sql);
  notifications = new SupabaseNotificationRepository(sql);
  scheduleRepo = new SupabaseScheduleRepository(sql);
  devotionals = new SupabaseDevotionalRepository(sql);
  faqs = new SupabaseFaqRepository(sql);
  settingsRepo = new SupabaseSettingsRepository(sql);
  snapshots = new SupabaseSnapshotRepository(sql);
} else {
  users = new InMemoryUserRepository(useJson ? makeJsonPersistence<User>('users.json') : undefined);
  churches = new InMemoryChurchRepository(useJson ? makeJsonPersistence<Church>('churches.json') : undefined);
  people = new InMemoryPersonRepository(useJson ? makeJsonPersistence<Person>('people.json') : undefined);
  accommodationRepo = new InMemoryAccommodationRepository(useJson ? makeJsonPersistence<AccommodationBlock>('accommodation.json') : undefined);
  zones = new InMemoryZoneRepository(useJson ? makeJsonPersistence<Zone>('zones.json') : undefined);
  groups = new InMemoryGroupRepository(useJson ? makeJsonPersistence<Group>('groups.json') : undefined);
  notes = new InMemoryNoteRepository(useJson ? makeJsonPersistence<StudentNote>('notes.json') : undefined);
  notifications = new InMemoryNotificationRepository(useJson ? makeJsonPersistence<Notification>('notifications.json') : undefined);
  scheduleRepo = new InMemoryScheduleRepository(useJson ? makeJsonPersistence<ScheduleItem>('schedule.json') : undefined);
  devotionals = new InMemoryDevotionalRepository(useJson ? makeJsonPersistence<Devotional>('devotionals.json') : undefined);
  faqs = new InMemoryFaqRepository(useJson ? makeJsonPersistence<FaqItem>('faqs.json') : undefined);
  settingsRepo = new InMemorySettingsRepository(useJson ? makeJsonPersistence<CampSettings>('settings.json') : undefined);
  snapshots = new InMemorySnapshotRepository(useJson ? makeJsonPersistence<CampDefaults>('snapshots.json') : undefined);
}
```

Remove the `Repositories` interface's `registrants` and `campers` fields (already done in Task 6). The `repos` object stays the same minus those two.

- [ ] **Step 3: Run typecheck + tests**

```
npm run typecheck && npm run test
```

Expected: 0 errors, all tests pass. The Supabase path is new dead code until `PERSISTENCE=supabase` is set.

- [ ] **Step 4: Commit**

```
git add src/repositories/supabase/index.ts src/container.ts
git commit -m "feat(B6): Supabase barrel and container PERSISTENCE=supabase branch"
```

---

## Task 15: Security Hardening and Operator Docs

**Files:**
- Modify: `src/index.ts`
- Modify: `src/api/middleware/error.middleware.ts`
- Create: `.env.example`
- Create: `SECURITY-ACTIONS.md`

- [ ] **Step 1: Add crash guards to `src/index.ts`**

Open `src/index.ts`. After the existing imports, add before the main startup call:

```typescript
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] Unhandled promise rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[fatal] Uncaught exception:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Audit `src/api/middleware/error.middleware.ts`**

Open the file. Confirm the production error handler returns generic messages (no stack traces, no internal paths). The shape must be:

```typescript
// In production (NODE_ENV === 'production'), ensure:
if (process.env.NODE_ENV === 'production') {
  // Only return: { code: string, message: string } — no stack, no details
  res.status(status).json({ code: err.code ?? 'INTERNAL_ERROR', message: 'An error occurred' });
} else {
  // Dev: include message + stack for debugging
  res.status(status).json({ code: err.code ?? 'INTERNAL_ERROR', message: err.message, stack: err.stack });
}
```

Adjust the existing handler to match this pattern if it doesn't already.

- [ ] **Step 3: Create `.env.example`**

```bash
# Youth Camp Platform — environment variables
# Copy to .env and fill in values before running

# Required in all environments
PORT=4200
NODE_ENV=development          # use 'production' on server

# Persistence mode: 'memory' (dev/test) | 'json' (local file) | 'supabase' (production)
PERSISTENCE=memory

# Required when PERSISTENCE=supabase
DATABASE_URL=                  # Supabase pooled connection string (port 6543)
                               # Format: postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres

# Required in production — tokens are forgeable without this
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
SESSION_SECRET=

# Lock CORS in production — comma-separated origins
# Example: https://youth-camp-platform.vercel.app
CORS_ORIGINS=*                 # WARNING: '*' logs a startup warning in production

# Only when PERSISTENCE=json
DATA_DIR=./data
```

- [ ] **Step 4: Create `SECURITY-ACTIONS.md`**

```markdown
# Security Actions — First Deploy Checklist

Complete these steps IN ORDER before telling anyone the app URL.

## 1. Set SESSION_SECRET
In Vercel Environment Variables, set SESSION_SECRET to 64+ random hex chars.
Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Without this, anyone can forge auth tokens.

## 2. Lock CORS
Set CORS_ORIGINS to your exact Vercel URL (e.g. `https://youth-camp-platform.vercel.app`).
Never leave this as `*` in production.

## 3. Set the admin password
After first deploy, visit https://<your-url>/setup
Enter your chosen admin username and password.
This endpoint is permanently disabled once any password is set.

## 4. Confirm RLS is active
In Supabase → SQL Editor, run:
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
All tables should show rowsecurity = true.

Test that the anon key cannot read data:
  curl https://<supabase-url>/rest/v1/users -H "apikey: <anon-key>"
Expected: 401 or empty result (not user rows).

## 5. Verify migrations applied
In Supabase → Table Editor, confirm these tables exist:
  users, churches, people, check_in_history, sign_out_history,
  reservations, accommodation_blocks, zones, groups, notes,
  notifications, schedule_items, devotionals, faqs, settings, defaults

## 6. After new-year rollover
After running POST /admin/new-year, restored church/zone accounts have no password.
Go to Admin → Accounts and set a new password for each church/zone account before
telling leaders to log in.
```

- [ ] **Step 5: Run tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 6: Commit**

```
git add src/index.ts src/api/middleware/error.middleware.ts .env.example SECURITY-ACTIONS.md
git commit -m "feat(C): crash guards, production error sanitization, .env.example, security runbook"
```

---

## Task 16: SW Registration and /setup Endpoint

**Files:**
- Modify: `public/index.html`
- Modify: `src/api/http/router.ts`

**Interfaces:**
- Produces: `POST /setup { username, password }` → `{ ok: true }` — one-time admin password bootstrap; permanently disabled once admin has a password.

- [ ] **Step 1: Add SW registration to `public/index.html`**

Find the closing `</body>` tag in `public/index.html`. Just before it, add:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW available — reload to activate it
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
            next.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });
    });
  }
</script>
```

Also add to `public/sw.js`, inside the `install` event listener before `self.skipWaiting()`:

```javascript
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
```

- [ ] **Step 2: Add `POST /setup` to the router**

Read `src/api/http/router.ts` to understand the route registration pattern. Add a `/setup` route that:
1. Checks that the admin user has no `passwordHash` (first-run guard)
2. Sets the admin username + hashes the password
3. Returns `{ ok: true }` on success, `409` if already set

The handler should be added directly in the router (not a separate controller — it's a one-off). Example:

```typescript
// In router.ts, add this route alongside the others:
{ method: 'POST', path: '/setup', handler: async (req) => {
  const body = req.body as { username?: string; password?: string };
  if (!body.username || !body.password) throw new BadRequestError('username and password required');
  if (body.password.length < 8) throw new BadRequestError('Password must be at least 8 characters');

  const admin = await services.users.findByRole('admin').then(a => a[0]);
  if (!admin) throw new NotFoundError('No admin account found — run migrations first');
  if (admin.passwordHash) {
    // Already set — return 409 so this endpoint is effectively disabled
    const { ForbiddenError } = await import('../../core/errors/app-error');
    throw new ForbiddenError('Admin password already set');
  }

  const { hashPassword } = await import('../../utils/crypto');
  const hash = await hashPassword(body.password);
  await services.users.save({ ...admin, username: body.username, passwordHash: hash });
  return { ok: true };
}},
```

Adjust the import paths to match the existing router style.

- [ ] **Step 3: Run typecheck + tests**

```
npm run typecheck && npm run test
```

- [ ] **Step 4: Commit**

```
git add public/index.html public/sw.js src/api/http/router.ts
git commit -m "feat(D+E): SW registration with auto-reload, /setup first-run endpoint"
```

---

## Task 17: Vercel Configuration

**Files:**
- Create: `vercel.json`
- Create: `api/index.ts`

**Interfaces:**
- Consumes: `createAppInstance()` from `src/app.ts`.
- Produces: A Vercel-deployable Express handler; static files from `public/` served at root.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "version": 2,
  "builds": [
    { "src": "api/index.ts", "use": "@vercel/node" },
    { "src": "public/**", "use": "@vercel/static" }
  ],
  "routes": [
    { "src": "/sw.js", "dest": "/public/sw.js" },
    { "src": "/manifest.json", "dest": "/public/manifest.json" },
    { "src": "/icons/(.*)", "dest": "/public/icons/$1" },
    {
      "src": "/(auth|home|settings|admin|registrants|accommodation|campers|checkin|attendance|notes|search|notifications|schedule|faq|devotional|import|accounts|health|setup)(.*)",
      "dest": "/api/index.ts"
    },
    { "src": "/(.*)", "dest": "/public/index.html" }
  ]
}
```

- [ ] **Step 2: Create `api/index.ts`**

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';
import { createAppInstance } from '../src/app';

// Cache the Express app across warm invocations (Vercel reuses the module).
let appPromise: Promise<Express> | undefined;

function getApp(): Promise<Express> {
  if (!appPromise) {
    appPromise = createAppInstance().catch((err) => {
      // Reset so the next cold start retries.
      appPromise = undefined;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getApp();
  // Delegate to Express — it handles the request/response directly.
  app(req as never, res as never);
}
```

- [ ] **Step 3: Install `@vercel/node` as a dev dependency**

```
npm install --save-dev @vercel/node
```

- [ ] **Step 4: Run typecheck**

```
npm run typecheck
```

Expected: 0 errors. The `api/index.ts` file uses Vercel types; the imports resolve.

- [ ] **Step 5: Run tests**

```
npm run test
```

- [ ] **Step 6: Commit and push**

```
git add vercel.json api/index.ts package.json package-lock.json
git commit -m "feat(E): Vercel entry point and routing config"
git push origin main
```

Vercel auto-deploys on push. Wait for the deployment to complete (check the Vercel dashboard).

---

## Task 18: Verify Live Deployment

- [ ] **Step 1: Check deploy status**

```
vercel ls
```

Or check the Vercel dashboard. Wait for status = Ready.

- [ ] **Step 2: Set admin password via /setup**

```
curl -X POST https://<your-project>.vercel.app/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-chosen-password>"}'
```

Expected response: `{"ok":true}`

- [ ] **Step 3: Smoke test login**

Visit `https://<your-project>.vercel.app` → login with `admin` / `<your-chosen-password>`.

- [ ] **Step 4: Verify pre-camp flow**

- Create a church account (Admin → Accounts → Add)
- Login as the church → add a registrant
- Set payment status, blue card

- [ ] **Step 5: Verify at-camp flow**

- Switch to at-camp mode (Admin → Mode)
- Login as church → check in a registrant → they appear as arrived

- [ ] **Step 6: Verify /setup is now disabled**

```
curl -X POST https://<your-project>.vercel.app/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"anythingelse"}'
```

Expected: `409` response. The endpoint is permanently disabled.

- [ ] **Step 7: Final commit**

```
git add -A
git commit -m "chore: production deployment verified — Phase A-E complete"
git push origin main
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Person unification switchover (A1–A7) | Tasks 1–7 |
| `blueCardCollected` derived from `blueCardNumber != null` | Task 1 (toRegistrantDto) |
| SPA kind literals preserved (`camper`/`student`) | Task 1 (DTO mappers) |
| chase/breakdown/remind ported | Task 2 |
| Supabase repos for all 13 entity types | Tasks 8–14 |
| `postgres` dependency | Task 8 |
| Container `PERSISTENCE=supabase` branch | Task 14 |
| Crash guards | Task 15 |
| Production error sanitization | Task 15 |
| `.env.example` | Task 15 |
| Security runbook | Task 15 |
| SW registration + auto-reload | Task 16 |
| `/setup` first-run endpoint | Task 16 |
| `vercel.json` | Task 17 |
| Vercel entry point | Task 17 |
| Live smoke test | Task 18 |
| Post-rollover password runbook | Task 15 (SECURITY-ACTIONS.md) |

### Type Consistency Check

- `toRegistrantDto` returns `RegistrantDto` → registrant controller uses `RegistrantDto` — ✓
- `toCamperDto` returns `CamperDto` → camper controller uses `CamperDto` — ✓
- `toRosterEntry` returns `RosterEntry` → checkin service uses `RosterEntry` — ✓
- `PersonService.chase` returns `ChaseResult[]` → same type defined in Task 2 and consumed in Task 3 — ✓
- `SupabasePersonRepository` implements `IPersonRepository` → Task 14 container wires it — ✓
- All 13 Supabase repos implement their respective `I*Repository` interface — ✓
- `createAppInstance()` returns `Express` → `api/index.ts` types it as `Express` — ✓
