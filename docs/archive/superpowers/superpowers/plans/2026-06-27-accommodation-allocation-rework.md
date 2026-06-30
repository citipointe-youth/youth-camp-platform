# Accommodation Allocation Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the real camp app's "per-church spot count" accommodation model with the original prototype's **classroom rooms + auto-filling, single-gender, partial-placement allocation** model, and move accommodation prices into Camp Settings.

**Architecture:** Remove `AccommodationBlock` and per-church `reservations` entirely. Add two new entities — `Classroom` (reusable scaffold room: name + capacity) and `RoomAllocation` (a placement row: roomId + churchId + gender + n). Allocation grouping (per church × gender, ≥75%-classroom eligibility), auto-fill, and tent auto-distribution live in a pure module shared by the service and ported verbatim into the SPA. Tent prices and classroom prices move from blocks onto `CampSettings`.

**Tech Stack:** TypeScript (strict, CommonJS emit), Express controllers → declarative router → services → repository interfaces (in-memory + Supabase Postgres). Vitest for tests. Single-file SPA (`public/index.html`). Supabase prod ref `nwfafrgojqkxylbppywo`.

## Global Constraints

- **Extensionless ESM-style imports** inside `src/` (no `.js`), `moduleResolution` Bundler in source; tsconfig still emits **CommonJS** (do not change `tsconfig`).
- **Strict TS**: `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`. Guard every indexed access.
- **RBAC only in `src/services/access-control.ts`** — never scatter role checks; but explicit `director|admin`-only gating inside a service method is acceptable where no permission verb exists (matches existing patterns).
- **Repos return deep clones** (the in-memory base already clones).
- **Validation with Zod inside services**, not controllers.
- **Verify with `npm run typecheck` + `npm run test` + reasoning/grep ONLY.** Do NOT start a localhost server or drive a browser. CSS/layout changes are flagged for the user to eyeball on-device.
- **Tent size is hardcoded 7 people/tent.** Students and leaders go in **separate** tents. Classroom rooms are **single-gender**. Eligibility rule = a church's gender-group is allocatable only when **≥75% of that church's campers are classroom-kind**; the group's count `n` = that church's classroom-kind campers of that gender.
- **Do NOT apply the Supabase migration to prod or push to `master` until the user approves** (per the chosen scope). The final task stops at a clean `typecheck`+`test` and a written diff summary.
- Church accounts must **not** see their allocated room in pre-camp or in at-camp **preview**; only in real at-camp (`SETTINGS.campMode==='at-camp' && !PREVIEW_MODE`).

---

## File Structure

**New files:**
- `src/services/accommodation-allocation.ts` — pure: `computeGroups`, `tallyAllocated`, `validateAllocations`, `tentDistribution`, `tentsFor`, `TENT_SIZE`.
- `src/services/accommodation-allocation.test.ts` — pure-module tests.
- `src/repositories/supabase/supabase.classroom.ts` — `SupabaseClassroomRepository`.
- `src/repositories/supabase/supabase.allocation.ts` — `SupabaseAllocationRepository`.
- `supabase/migrations/004_accommodation_rework.sql` — drop blocks/reservations; add classrooms/classroom_allocations; add settings prices.

**Deleted files:**
- `src/services/accommodation-occupancy.ts` + `src/services/accommodation-occupancy.test.ts` (block occupancy is gone).
- `src/repositories/supabase/supabase.accommodation.ts`.

**Modified (backend):** `src/core/entities/accommodation.ts`, `church.ts`, `settings.ts`, `index.ts`; `src/core/validation/accommodation.schema.ts`, `content.schema.ts`; `src/services/accommodation.service.ts`, `dashboard.service.ts`, `admin.service.ts`, `index.ts`; `src/api/controllers/accommodation.controller.ts`; `src/api/http/router.ts`; `src/repositories/interfaces/entity-repositories.ts`; `src/repositories/in-memory/in-memory.repositories.ts` (+ its `index.ts`); `src/repositories/supabase/index.ts`, `supabase.churches.ts`, `supabase.settings.ts`; `src/container.ts`; `src/data/seed.ts`. Test files referencing the old model.

**Modified (frontend):** `public/index.html` (`RENDER.accom`/`drawAccom`/`saveChurchAlloc`, `RENDER.adminAccom`/`saveBlock`/`addBlock`/`delBlock`, `RENDER.budget`, `RENDER.adminSettings`/`saveSettings`, church at-camp home tile, `_invalidate` cache map), `public/sw.js` (cache key bump).

---

## Task 1: New entities (Classroom, RoomAllocation) + settings prices

**Files:**
- Modify: `src/core/entities/accommodation.ts` (replace contents)
- Modify: `src/core/entities/church.ts` (remove reservations)
- Modify: `src/core/entities/settings.ts` (add prices; rename snapshot field)
- Modify: `src/core/entities/index.ts` (export check)

**Interfaces produced:**
- `Classroom { id; name: string; capacity: number; createdAt; updatedAt }`
- `RoomAllocation { id; roomId: ID; churchId: ID; gender: 'male'|'female'; n: number }`
- `CampSettings.tentPrice: number`, `CampSettings.classroomPrice: number`
- `CampDefaults.classrooms: unknown[]` (was `accommodationBlocks`)

- [ ] **Step 1: Replace `accommodation.ts`**

```ts
import type { ID, ISODateString } from '../types/common';

export type AllocationGender = 'male' | 'female';

/** A reusable classroom room (scaffold). Capacity is a head count. */
export interface Classroom {
  id: ID;
  name: string;
  capacity: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** One placement row: `n` campers of `churchId`+`gender` placed in `roomId`. */
export interface RoomAllocation {
  id: ID;
  roomId: ID;
  churchId: ID;
  gender: AllocationGender;
  n: number;
}
```

- [ ] **Step 2: Remove reservations from `church.ts`**

Delete the `AccommodationReservation` interface and the `reservations: AccommodationReservation[]` field. The `Church` interface keeps `id, name, zone, contactPhone?, contacts, createdAt, updatedAt`. Also drop the now-unused `AccommodationKind` import if present.

- [ ] **Step 3: Add prices to `settings.ts`**

In `CampSettings` add after `accommodationLocked: boolean;`:

```ts
  tentPrice: number;
  classroomPrice: number;
```

In `CampDefaults` rename `accommodationBlocks: unknown[];` to `classrooms: unknown[];`.

- [ ] **Step 4: Fix the entities barrel**

Open `src/core/entities/index.ts`. If it re-exports `AccommodationBlock` or `AccommodationReservation`, replace with `Classroom`, `RoomAllocation`, `AllocationGender`. Leave other exports untouched.

- [ ] **Step 5: Typecheck (expected to fail elsewhere)**

Run: `npm run typecheck`
Expected: FAIL — many references to `AccommodationBlock`/`reservations` across repos/services. This is the worklist for the following tasks. Do **not** try to fix them here.

- [ ] **Step 6: Commit**

```bash
git add src/core/entities
git commit -m "feat(accom): replace AccommodationBlock with Classroom + RoomAllocation entities"
```

---

## Task 2: Validation schemas (classroom, allocations, settings prices)

**Files:**
- Modify: `src/core/validation/accommodation.schema.ts` (replace contents)
- Modify: `src/core/validation/content.schema.ts:58-68` (add price fields to `UpdateSettingsSchema`)

**Interfaces produced:**
- `CreateClassroomSchema`, `UpdateClassroomSchema`, `SetAllocationsSchema`
- `SetAllocationsInput = { allocations: Record<string, Array<{ key: string; n: number }>> }`

- [ ] **Step 1: Replace `accommodation.schema.ts`**

```ts
import { z } from 'zod';

export const CreateClassroomSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1),
});
export type CreateClassroomInput = z.infer<typeof CreateClassroomSchema>;

export const UpdateClassroomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
});
export type UpdateClassroomInput = z.infer<typeof UpdateClassroomSchema>;

// Allocation map: roomId -> [{ key: "<churchId>|male|female", n }]
const AllocEntrySchema = z.object({ key: z.string().min(1), n: z.number().int().min(0) });
export const SetAllocationsSchema = z.object({
  allocations: z.record(z.string(), z.array(AllocEntrySchema)),
});
export type SetAllocationsInput = z.infer<typeof SetAllocationsSchema>;
```

- [ ] **Step 2: Add prices to `UpdateSettingsSchema`**

In `content.schema.ts`, inside `UpdateSettingsSchema` add before the closing `})`:

```ts
  tentPrice: z.number().min(0).optional(),
  classroomPrice: z.number().min(0).optional(),
```

- [ ] **Step 3: Confirm the validation barrel still compiles**

Open `src/core/validation/index.ts`; if it re-exported `CreateBlockSchema`/`SetReservationsSchema`, replace those names with `CreateClassroomSchema`, `UpdateClassroomSchema`, `SetAllocationsSchema`.

- [ ] **Step 4: Commit**

```bash
git add src/core/validation
git commit -m "feat(accom): classroom + allocation schemas; settings price fields"
```

---

## Task 3: Pure allocation module + tests (TDD)

**Files:**
- Create: `src/services/accommodation-allocation.ts`
- Test: `src/services/accommodation-allocation.test.ts`

**Interfaces produced:**
- `AllocationOccupant { churchId; churchName; gender; kind; accommodationKind?; lifecycle? }`
- `AllocationGroup { key; churchId; church; gender: 'male'|'female'; n }`
- `ClassroomLike { id; name; capacity }`, `AllocEntry { key; n }`, `AllocationMap = Record<string, AllocEntry[]>`
- `computeGroups(occupants): AllocationGroup[]`
- `tallyAllocated(map): Map<string, number>`
- `validateAllocations(map, { rooms, groups }): void` (throws `Error` with a clear message)
- `tentDistribution(occupants): TentChurch[]`, `tentsFor(count): number`, `TENT_SIZE = 7`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  computeGroups, tallyAllocated, validateAllocations,
  tentDistribution, tentsFor, TENT_SIZE,
  type AllocationOccupant, type AllocationMap,
} from './accommodation-allocation';

const occ = (over: Partial<AllocationOccupant>): AllocationOccupant => ({
  churchId: 'c1', churchName: 'Victory', gender: 'male', kind: 'youth',
  accommodationKind: 'classroom', lifecycle: 'registered', ...over,
});

describe('computeGroups (75% eligibility)', () => {
  it('emits a per-gender group only when >=75% of a church is classroom-kind', () => {
    // c1: 4 classroom (3 male, 1 female), 0 tent -> 100% eligible
    const people = [
      occ({ churchId: 'c1', gender: 'male' }),
      occ({ churchId: 'c1', gender: 'male' }),
      occ({ churchId: 'c1', gender: 'male' }),
      occ({ churchId: 'c1', gender: 'female' }),
    ];
    const groups = computeGroups(people);
    expect(groups.map((g) => g.key).sort()).toEqual(['c1|female', 'c1|male']);
    expect(groups.find((g) => g.key === 'c1|male')!.n).toBe(3);
  });

  it('excludes a church under 75% classroom', () => {
    // c2: 1 classroom, 3 tent -> 25% -> not eligible
    const people = [
      occ({ churchId: 'c2', accommodationKind: 'classroom' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
    ];
    expect(computeGroups(people)).toEqual([]);
  });

  it('ignores leaders and cancelled people in the classroom counts', () => {
    const people = [
      occ({ churchId: 'c3', kind: 'leader' }),
      occ({ churchId: 'c3', lifecycle: 'cancelled' }),
      occ({ churchId: 'c3', gender: 'male' }),
    ];
    // only the 1 valid youth counts -> 1/1 classroom -> eligible, male n=1
    const groups = computeGroups(people);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('c3|male');
    expect(groups[0]!.n).toBe(1);
  });
});

describe('tallyAllocated', () => {
  it('sums n per key across rooms', () => {
    const map: AllocationMap = {
      r1: [{ key: 'c1|male', n: 6 }],
      r2: [{ key: 'c1|male', n: 2 }, { key: 'c1|female', n: 4 }],
    };
    const t = tallyAllocated(map);
    expect(t.get('c1|male')).toBe(8);
    expect(t.get('c1|female')).toBe(4);
  });
});

describe('validateAllocations', () => {
  const groups = [
    { key: 'c1|male', churchId: 'c1', church: 'Victory', gender: 'male' as const, n: 10 },
    { key: 'c1|female', churchId: 'c1', church: 'Victory', gender: 'female' as const, n: 4 },
  ];
  const rooms = [{ id: 'r1', name: 'Room 1', capacity: 6 }];

  it('passes a valid single-gender, within-capacity map', () => {
    expect(() => validateAllocations({ r1: [{ key: 'c1|male', n: 6 }] }, { rooms, groups }))
      .not.toThrow();
  });

  it('rejects mixed genders in one room', () => {
    expect(() => validateAllocations(
      { r1: [{ key: 'c1|male', n: 3 }, { key: 'c1|female', n: 3 }] }, { rooms, groups },
    )).toThrow(/single gender/i);
  });

  it('rejects exceeding room capacity', () => {
    expect(() => validateAllocations({ r1: [{ key: 'c1|male', n: 7 }] }, { rooms, groups }))
      .toThrow(/capacity/i);
  });

  it('rejects over-allocating a group beyond its n', () => {
    const big = [{ id: 'r1', name: 'Room 1', capacity: 100 }];
    expect(() => validateAllocations({ r1: [{ key: 'c1|female', n: 5 }] }, { rooms: big, groups }))
      .toThrow(/more than available/i);
  });

  it('rejects an unknown room or group key', () => {
    expect(() => validateAllocations({ rX: [{ key: 'c1|male', n: 1 }] }, { rooms, groups }))
      .toThrow(/unknown room/i);
    expect(() => validateAllocations({ r1: [{ key: 'zzz|male', n: 1 }] }, { rooms, groups }))
      .toThrow(/unknown group/i);
  });
});

describe('tent distribution (7 per tent, leaders separate)', () => {
  it('buckets tent-kind people by church+gender and student/leader', () => {
    const people = [
      occ({ churchId: 'c1', gender: 'male', kind: 'youth', accommodationKind: 'tent' }),
      occ({ churchId: 'c1', gender: 'male', kind: 'leader', accommodationKind: 'tent' }),
      occ({ churchId: 'c1', gender: 'female', kind: 'youth', accommodationKind: 'tent' }),
    ];
    const dist = tentDistribution(people);
    const c1 = dist.find((d) => d.churchId === 'c1')!;
    expect(c1.m.stu).toBe(1);
    expect(c1.m.ld).toBe(1);
    expect(c1.f.stu).toBe(1);
  });

  it('tentsFor uses ceil over TENT_SIZE', () => {
    expect(TENT_SIZE).toBe(7);
    expect(tentsFor(0)).toBe(0);
    expect(tentsFor(7)).toBe(1);
    expect(tentsFor(8)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- accommodation-allocation`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `accommodation-allocation.ts`**

```ts
export type AllocationGender = 'male' | 'female';

export interface AllocationOccupant {
  churchId: string;
  churchName: string;
  gender: string;                 // 'male' | 'female' | other
  kind: string;                   // 'youth' | 'leader'
  accommodationKind?: string | null; // 'tent' | 'classroom' | null
  lifecycle?: string | null;      // 'cancelled' excluded
}

export interface AllocationGroup {
  key: string;        // `${churchId}|${gender}`
  churchId: string;
  church: string;
  gender: AllocationGender;
  n: number;
}

export interface ClassroomLike { id: string; name: string; capacity: number }
export interface AllocEntry { key: string; n: number }
export type AllocationMap = Record<string, AllocEntry[]>;

export const ELIGIBLE_RATIO = 0.75;
export const TENT_SIZE = 7;

interface ChurchTally {
  id: string; name: string; total: number; classroom: number;
  maleCls: number; femaleCls: number;
}

function tallyChurches(occupants: readonly AllocationOccupant[]): Map<string, ChurchTally> {
  const by = new Map<string, ChurchTally>();
  for (const o of occupants) {
    if (o.kind === 'leader') continue;          // groups are campers only
    if (o.lifecycle === 'cancelled') continue;
    let c = by.get(o.churchId);
    if (!c) { c = { id: o.churchId, name: o.churchName, total: 0, classroom: 0, maleCls: 0, femaleCls: 0 }; by.set(o.churchId, c); }
    c.total++;
    if (o.accommodationKind === 'classroom') {
      c.classroom++;
      if (o.gender === 'male') c.maleCls++; else c.femaleCls++;
    }
  }
  return by;
}

export function computeGroups(occupants: readonly AllocationOccupant[]): AllocationGroup[] {
  const groups: AllocationGroup[] = [];
  for (const c of tallyChurches(occupants).values()) {
    const eligible = c.total > 0 && c.classroom / c.total >= ELIGIBLE_RATIO;
    if (!eligible) continue;
    if (c.maleCls > 0) groups.push({ key: `${c.id}|male`, churchId: c.id, church: c.name, gender: 'male', n: c.maleCls });
    if (c.femaleCls > 0) groups.push({ key: `${c.id}|female`, churchId: c.id, church: c.name, gender: 'female', n: c.femaleCls });
  }
  return groups;
}

export function tallyAllocated(map: AllocationMap): Map<string, number> {
  const t = new Map<string, number>();
  for (const entries of Object.values(map)) {
    for (const e of entries) t.set(e.key, (t.get(e.key) ?? 0) + e.n);
  }
  return t;
}

function genderOfKey(key: string): string { return key.split('|')[1] ?? ''; }

export function validateAllocations(
  map: AllocationMap,
  ctx: { rooms: readonly ClassroomLike[]; groups: readonly AllocationGroup[] },
): void {
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  const groupByKey = new Map(ctx.groups.map((g) => [g.key, g]));
  for (const [roomId, entries] of Object.entries(map)) {
    const room = roomById.get(roomId);
    if (!room) throw new Error(`Unknown room: ${roomId}`);
    let used = 0;
    const genders = new Set<string>();
    for (const e of entries) {
      if (e.n <= 0) continue;
      if (!groupByKey.has(e.key)) throw new Error(`Unknown group: ${e.key}`);
      used += e.n;
      genders.add(genderOfKey(e.key));
    }
    if (genders.size > 1) throw new Error(`Room ${room.name} must be a single gender`);
    if (used > room.capacity) throw new Error(`Room ${room.name} over capacity (${used}/${room.capacity})`);
  }
  const allocated = tallyAllocated(map);
  for (const [key, n] of allocated) {
    const g = groupByKey.get(key);
    if (!g) throw new Error(`Unknown group: ${key}`);
    if (n > g.n) throw new Error(`Allocated more than available for ${key} (${n}/${g.n})`);
  }
}

export interface TentChurch {
  churchId: string; church: string;
  m: { stu: number; ld: number };
  f: { stu: number; ld: number };
}

export function tentDistribution(occupants: readonly AllocationOccupant[]): TentChurch[] {
  const by = new Map<string, TentChurch>();
  for (const o of occupants) {
    if (o.accommodationKind !== 'tent') continue;
    if (o.lifecycle === 'cancelled') continue;
    let c = by.get(o.churchId);
    if (!c) { c = { churchId: o.churchId, church: o.churchName, m: { stu: 0, ld: 0 }, f: { stu: 0, ld: 0 } }; by.set(o.churchId, c); }
    const g = o.gender === 'male' ? c.m : c.f;
    if (o.kind === 'leader') g.ld++; else g.stu++;
  }
  return [...by.values()];
}

export function tentsFor(count: number): number {
  return Math.ceil(count / TENT_SIZE);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- accommodation-allocation`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/services/accommodation-allocation.ts src/services/accommodation-allocation.test.ts
git commit -m "feat(accom): pure allocation module (groups, validation, tents)"
```

---

## Task 4: Repository interfaces + in-memory repos

**Files:**
- Modify: `src/repositories/interfaces/entity-repositories.ts:5,43-45`
- Modify: `src/repositories/in-memory/in-memory.repositories.ts` (replace `InMemoryAccommodationRepository`)
- Modify: `src/repositories/in-memory/index.ts` (export names)

**Interfaces produced:**
- `IClassroomRepository extends IRepository<Classroom>`
- `IAllocationRepository extends IRepository<RoomAllocation>`
- `InMemoryClassroomRepository`, `InMemoryAllocationRepository`

- [ ] **Step 1: Update interfaces**

In `entity-repositories.ts` replace the `AccommodationBlock` import with `import type { Classroom, RoomAllocation } from '../../core/entities/accommodation';` and replace the `IAccommodationRepository` block with:

```ts
export interface IClassroomRepository extends IRepository<Classroom> {}

export interface IAllocationRepository extends IRepository<RoomAllocation> {
  findByRoom(roomId: string): Promise<RoomAllocation[]>;
}
```

- [ ] **Step 2: Replace the in-memory repo**

Read `in-memory.repositories.ts` and find `InMemoryAccommodationRepository` (it extends the in-memory base, which provides `findAll/findById/save/saveMany/delete/deleteAll/init` + clone). Replace it with two repos following the exact base-class pattern used by neighbours (e.g. `InMemoryNoteRepository`):

```ts
export class InMemoryClassroomRepository extends InMemoryBaseRepository<Classroom> implements IClassroomRepository {}

export class InMemoryAllocationRepository extends InMemoryBaseRepository<RoomAllocation> implements IAllocationRepository {
  async findByRoom(roomId: string): Promise<RoomAllocation[]> {
    return (await this.findAll()).filter((a) => a.roomId === roomId);
  }
}
```

Update the imports at the top of the file: replace `AccommodationBlock` with `Classroom, RoomAllocation`, and the interface import `IAccommodationRepository` with `IClassroomRepository, IAllocationRepository`. (Match the actual base-class name in the file — confirm via grep `extends InMemory`.)

- [ ] **Step 3: Update the in-memory barrel**

In `src/repositories/in-memory/index.ts` replace any `InMemoryAccommodationRepository` export with `InMemoryClassroomRepository` and `InMemoryAllocationRepository`.

- [ ] **Step 4: Commit**

```bash
git add src/repositories/interfaces src/repositories/in-memory
git commit -m "feat(accom): classroom + allocation repository interfaces and in-memory impls"
```

---

## Task 5: Supabase repos (classroom, allocation, churches, settings)

**Files:**
- Create: `src/repositories/supabase/supabase.classroom.ts`
- Create: `src/repositories/supabase/supabase.allocation.ts`
- Delete: `src/repositories/supabase/supabase.accommodation.ts`
- Modify: `src/repositories/supabase/supabase.churches.ts` (drop reservations)
- Modify: `src/repositories/supabase/supabase.settings.ts` (add price cols)
- Modify: `src/repositories/supabase/index.ts`

**Interfaces produced:** `SupabaseClassroomRepository`, `SupabaseAllocationRepository`.

- [ ] **Step 1: Create `supabase.classroom.ts`**

```ts
import type { SqlClient } from './client';
import type { IClassroomRepository } from '../interfaces/entity-repositories';
import type { Classroom } from '../../core/entities/accommodation';

function toRoom(r: Record<string, unknown>): Classroom {
  return {
    id: r['id'] as string,
    name: r['name'] as string,
    capacity: r['capacity'] as number,
    createdAt: (r['created_at'] as Date).toISOString(),
    updatedAt: (r['updated_at'] as Date).toISOString(),
  };
}

function cols(c: Classroom): Record<string, unknown> {
  return { id: c.id, name: c.name, capacity: c.capacity, created_at: c.createdAt, updated_at: c.updatedAt };
}

const UPDATE_COLS = ['name', 'capacity', 'updated_at'] as const;

export class SupabaseClassroomRepository implements IClassroomRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<Classroom[]> {
    return (await this.sql`select * from classrooms order by name`).map(toRoom);
  }
  async findById(id: string): Promise<Classroom | null> {
    const rows = await this.sql`select * from classrooms where id = ${id}`;
    return rows[0] ? toRoom(rows[0]) : null;
  }
  async save(room: Classroom): Promise<Classroom> {
    const c = cols(room);
    await this.sql`insert into classrooms ${this.sql(c)} on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}`;
    return room;
  }
  async saveMany(rooms: Classroom[]): Promise<Classroom[]> { for (const r of rooms) await this.save(r); return rooms; }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from classrooms where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from classrooms returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 2: Create `supabase.allocation.ts`**

```ts
import type { SqlClient } from './client';
import type { IAllocationRepository } from '../interfaces/entity-repositories';
import type { RoomAllocation } from '../../core/entities/accommodation';

function toAlloc(r: Record<string, unknown>): RoomAllocation {
  return {
    id: r['id'] as string,
    roomId: r['room_id'] as string,
    churchId: r['church_id'] as string,
    gender: r['gender'] as RoomAllocation['gender'],
    n: r['n'] as number,
  };
}

function cols(a: RoomAllocation): Record<string, unknown> {
  return { id: a.id, room_id: a.roomId, church_id: a.churchId, gender: a.gender, n: a.n };
}

const UPDATE_COLS = ['room_id', 'church_id', 'gender', 'n'] as const;

export class SupabaseAllocationRepository implements IAllocationRepository {
  constructor(private sql: SqlClient) {}
  async init(): Promise<void> {}
  async findAll(): Promise<RoomAllocation[]> {
    return (await this.sql`select * from classroom_allocations`).map(toAlloc);
  }
  async findById(id: string): Promise<RoomAllocation | null> {
    const rows = await this.sql`select * from classroom_allocations where id = ${id}`;
    return rows[0] ? toAlloc(rows[0]) : null;
  }
  async findByRoom(roomId: string): Promise<RoomAllocation[]> {
    return (await this.sql`select * from classroom_allocations where room_id = ${roomId}`).map(toAlloc);
  }
  async save(a: RoomAllocation): Promise<RoomAllocation> {
    const c = cols(a);
    await this.sql`insert into classroom_allocations ${this.sql(c)} on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}`;
    return a;
  }
  async saveMany(rows: RoomAllocation[]): Promise<RoomAllocation[]> { for (const r of rows) await this.save(r); return rows; }
  async delete(id: string): Promise<boolean> {
    const rows = await this.sql`delete from classroom_allocations where id = ${id} returning id`;
    return rows.length > 0;
  }
  async deleteAll(): Promise<number> {
    const rows = await this.sql`delete from classroom_allocations returning id`;
    return rows.length;
  }
}
```

- [ ] **Step 3: Delete `supabase.accommodation.ts`**

```bash
git rm src/repositories/supabase/supabase.accommodation.ts
```

- [ ] **Step 4: Drop reservations from `supabase.churches.ts`**

Rewrite so `Church` has no reservations: `toChurch(row)` takes only the row (remove the `reservations` param and field); delete `loadReservations` and `hydrate`'s reservation join (just `rows.map(toChurch)`); in `save`, drop the `sql.begin` transaction and the reservations delete/insert — a plain upsert is enough:

```ts
async save(church: Church): Promise<Church> {
  const c = churchColumns(church);
  await this.sql`insert into churches ${this.sql(c)} on conflict (id) do update set ${this.sql(c, ...UPDATE_COLS)}`;
  return church;
}
```

Remove the now-unused `newId` and `TxClient` imports.

- [ ] **Step 5: Add price columns to `supabase.settings.ts`**

In `toSettings` add `tentPrice: (r['tent_price'] as number) ?? 0,` and `classroomPrice: (r['classroom_price'] as number) ?? 0,`. In `settingsCols` add `tent_price: s.tentPrice, classroom_price: s.classroomPrice,`. Add `'tent_price', 'classroom_price'` to `UPDATE_COLS`.

- [ ] **Step 6: Update the supabase barrel**

In `src/repositories/supabase/index.ts` replace the `SupabaseAccommodationRepository` export with `SupabaseClassroomRepository` (from `./supabase.classroom`) and `SupabaseAllocationRepository` (from `./supabase.allocation`).

- [ ] **Step 7: Commit**

```bash
git add src/repositories/supabase
git commit -m "feat(accom): supabase classroom + allocation repos; drop reservations; settings prices"
```

---

## Task 6: Accommodation service rewrite (TDD)

**Files:**
- Modify: `src/services/accommodation.service.ts` (replace contents)
- Delete: `src/services/accommodation-occupancy.ts`, `src/services/accommodation-occupancy.test.ts`
- Modify: `src/services/index.ts` (export check)
- Test: rewrite `src/services/accommodation.characterisation.test.ts`

**Interfaces produced:**
- `AccommodationService` with: `listClassrooms`, `createClassroom`, `updateClassroom`, `deleteClassroom`, `getAllocations`, `setAllocations`, `listGroups`, `getChurchRooms`.
- `makeAccommodationService(classroomRepo, allocationRepo, churchRepo, settingsRepo, personRepo)`
- `getAllocations`/`setAllocations` return `AllocationMap` (`Record<string, Array<{key,n}>>`).
- `getChurchRooms(actor, churchId)` returns `{ rooms: Array<{ name: string; gender: 'male'|'female'; n: number }> }`.

**Interfaces consumed:** Task 3 pure module; Task 4 repos; Task 2 schemas.

- [ ] **Step 1: Delete the occupancy module + its test**

```bash
git rm src/services/accommodation-occupancy.ts src/services/accommodation-occupancy.test.ts
```

- [ ] **Step 2: Rewrite the characterisation test**

Replace `src/services/accommodation.characterisation.test.ts` with tests over the new service using in-memory repos. Build a tiny harness (mirror how `person.service.test.ts` constructs repos + actors). Cover:

```ts
// pseudocode shape — adapt imports to the in-memory repos + Actor builders used elsewhere
import { describe, it, expect, beforeEach } from 'vitest';
import { makeAccommodationService } from './accommodation.service';
import { InMemoryClassroomRepository, InMemoryAllocationRepository, InMemoryChurchRepository, InMemorySettingsRepository, InMemoryPersonRepository } from '../repositories/in-memory';
// admin + director + church actors (copy the Actor factory used in other service tests)

describe('AccommodationService', () => {
  // beforeEach: seed settings singleton (accommodationLocked:false), one church 'c1',
  // 4 classroom-kind youth in c1 (3 male/1 female), create rooms via service.

  it('admin can create/list/delete classrooms', async () => { /* create Room 1 cap 6, list -> 1, delete -> 0 */ });
  it('non-admin cannot create a classroom', async () => { /* church actor -> rejects */ });
  it('director can set + get allocations (round-trips the map)', async () => {
    // setAllocations({ [room1]: [{key:'c1|male', n:3}] }) then getAllocations() deep-equals it
  });
  it('rejects an allocation that mixes genders in a room', async () => { /* expect rejects /single gender/i */ });
  it('rejects an allocation that exceeds room capacity', async () => { /* n>capacity -> rejects */ });
  it('rejects an allocation over a group\'s available count', async () => { /* n>maleCls -> rejects */ });
  it('church actor cannot read camp-wide allocations', async () => { /* getAllocations(church) -> rejects */ });
  it('getChurchRooms returns only that church\'s rooms', async () => { /* alloc c1|male to Room 1, getChurchRooms(c1) -> [{name:'Room 1',gender:'male',n:3}] */ });
  it('writes are blocked when accommodation is locked (non-admin)', async () => { /* lock, director setAllocations -> rejects */ });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test -- accommodation.characterisation`
Expected: FAIL (service has old shape / methods missing).

- [ ] **Step 4: Implement the service**

```ts
import type {
  IClassroomRepository, IAllocationRepository, IChurchRepository,
  ISettingsRepository, IPersonRepository,
} from '../repositories/interfaces/entity-repositories';
import type { Classroom, RoomAllocation, AllocationGender } from '../core/entities/accommodation';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessChurch } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { CreateClassroomSchema, UpdateClassroomSchema, SetAllocationsSchema } from '../core/validation/accommodation.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  computeGroups, validateAllocations,
  type AllocationOccupant, type AllocationGroup, type AllocationMap,
} from './accommodation-allocation';

export interface ChurchRooms {
  rooms: Array<{ name: string; gender: AllocationGender; n: number }>;
}

export interface AccommodationService {
  listClassrooms(actor: Actor): Promise<Classroom[]>;
  createClassroom(actor: Actor, input: unknown): Promise<Classroom>;
  updateClassroom(actor: Actor, id: string, input: unknown): Promise<Classroom>;
  deleteClassroom(actor: Actor, id: string): Promise<void>;
  listGroups(actor: Actor): Promise<AllocationGroup[]>;
  getAllocations(actor: Actor): Promise<AllocationMap>;
  setAllocations(actor: Actor, input: unknown): Promise<AllocationMap>;
  getChurchRooms(actor: Actor, churchId: string): Promise<ChurchRooms>;
}

export function makeAccommodationService(
  classroomRepo: IClassroomRepository,
  allocationRepo: IAllocationRepository,
  churchRepo: IChurchRepository,
  settingsRepo: ISettingsRepository,
  personRepo: IPersonRepository,
): AccommodationService {
  async function assertNotLocked(actor: Actor): Promise<void> {
    if (actor.role === 'admin') return;
    const s = await settingsRepo.getSingleton();
    if (s?.accommodationLocked) throw new ForbiddenError('Accommodation is locked. Contact admin to make changes.');
  }

  function assertDirectorOrAdmin(actor: Actor): void {
    if (actor.role !== 'admin' && actor.role !== 'director') {
      throw new ForbiddenError('Allocations are managed by directors and admins only');
    }
  }

  async function occupants(): Promise<AllocationOccupant[]> {
    const people = await personRepo.findAll();
    return people.map((p) => ({
      churchId: p.churchId ?? '',
      churchName: p.churchName,
      gender: p.gender,
      kind: p.kind,
      accommodationKind: p.accommodationKind ?? null,
      lifecycle: p.lifecycle ?? null,
    }));
  }

  function rowsToMap(rows: readonly RoomAllocation[]): AllocationMap {
    const map: AllocationMap = {};
    for (const r of rows) {
      (map[r.roomId] ??= []).push({ key: `${r.churchId}|${r.gender}`, n: r.n });
    }
    return map;
  }

  return {
    async listClassrooms(actor) {
      assertCan(actor, 'registrant:read');
      return (await classroomRepo.findAll()).sort((a, b) => a.name.localeCompare(b.name));
    },

    async createClassroom(actor, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const data = CreateClassroomSchema.parse(input);
      const now = nowISO();
      return classroomRepo.save({ id: newId('room'), name: data.name, capacity: data.capacity, createdAt: now, updatedAt: now });
    },

    async updateClassroom(actor, id, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const existing = await classroomRepo.findById(id);
      if (!existing) throw new NotFoundError('Classroom not found');
      const data = UpdateClassroomSchema.parse(input);
      return classroomRepo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async deleteClassroom(actor, id) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const ok = await classroomRepo.delete(id);
      if (!ok) throw new NotFoundError('Classroom not found');
      // Cascade: drop its allocation rows (in-memory has no FK cascade).
      const rows = await allocationRepo.findByRoom(id);
      for (const r of rows) await allocationRepo.delete(r.id);
    },

    async listGroups(actor) {
      assertDirectorOrAdmin(actor);
      return computeGroups(await occupants());
    },

    async getAllocations(actor) {
      assertDirectorOrAdmin(actor);
      return rowsToMap(await allocationRepo.findAll());
    },

    async setAllocations(actor, input) {
      assertDirectorOrAdmin(actor);
      await assertNotLocked(actor);
      const { allocations } = SetAllocationsSchema.parse(input);
      const [rooms, groups] = [await classroomRepo.findAll(), computeGroups(await occupants())];
      validateAllocations(allocations, { rooms, groups });
      // Replace-all: clear then insert non-zero rows.
      await allocationRepo.deleteAll();
      for (const [roomId, entries] of Object.entries(allocations)) {
        for (const e of entries) {
          if (e.n <= 0) continue;
          const [churchId, gender] = e.key.split('|') as [string, AllocationGender];
          await allocationRepo.save({ id: newId('alloc'), roomId, churchId, gender, n: e.n });
        }
      }
      return rowsToMap(await allocationRepo.findAll());
    },

    async getChurchRooms(actor, churchId) {
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      const [rows, rooms] = [await allocationRepo.findAll(), await classroomRepo.findAll()];
      const nameById = new Map(rooms.map((r) => [r.id, r.name]));
      return {
        rooms: rows
          .filter((r) => r.churchId === churchId && r.n > 0)
          .map((r) => ({ name: nameById.get(r.roomId) ?? 'Room', gender: r.gender, n: r.n })),
      };
    },
  };
}
```

- [ ] **Step 5: Confirm the services barrel**

Open `src/services/index.ts`; ensure it still exports `makeAccommodationService`/`AccommodationService` and no longer references the deleted occupancy module.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test -- accommodation.characterisation accommodation-allocation`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/accommodation.service.ts src/services/accommodation.characterisation.test.ts src/services/index.ts
git commit -m "feat(accom): rewrite accommodation service for classrooms + allocations"
```

---

## Task 7: Controller + router

**Files:**
- Modify: `src/api/controllers/accommodation.controller.ts` (replace contents)
- Modify: `src/api/http/router.ts:91-97`

**Interfaces consumed:** Task 6 service methods.

- [ ] **Step 1: Replace the controller**

```ts
import type { HttpRequest } from '../http/types';
import type { AccommodationService } from '../../services/accommodation.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface AccommodationControllerServices { accommodation: AccommodationService }

export function makeAccommodationController(services: AccommodationControllerServices) {
  return {
    async classrooms(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.listClassrooms(req.ctx.actor);
    },
    async createClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.createClassroom(req.ctx.actor, req.body);
    },
    async updateClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.accommodation.updateClassroom(req.ctx.actor, id, req.body);
    },
    async deleteClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.accommodation.deleteClassroom(req.ctx.actor, id);
      return { ok: true };
    },
    async groups(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.listGroups(req.ctx.actor);
    },
    async allocations(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.getAllocations(req.ctx.actor);
    },
    async setAllocations(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.setAllocations(req.ctx.actor, req.body);
    },
    async churchRooms(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.params['churchId'] ?? req.ctx.actor.churchId;
      if (!churchId) throw new BadRequestError('Missing churchId');
      return services.accommodation.getChurchRooms(req.ctx.actor, churchId);
    },
  };
}
```

- [ ] **Step 2: Replace the routes**

In `router.ts`, replace the 7 accommodation routes (lines ~91-97) with:

```ts
    { method: 'GET', path: '/accommodation/classrooms', auth: true, handler: (r) => accommodation.classrooms(r) },
    { method: 'POST', path: '/accommodation/classrooms', auth: true, handler: (r) => accommodation.createClassroom(r) },
    { method: 'PATCH', path: '/accommodation/classrooms/:id', auth: true, handler: (r) => accommodation.updateClassroom(r) },
    { method: 'DELETE', path: '/accommodation/classrooms/:id', auth: true, handler: (r) => accommodation.deleteClassroom(r) },
    { method: 'GET', path: '/accommodation/groups', auth: true, handler: (r) => accommodation.groups(r) },
    { method: 'GET', path: '/accommodation/allocations', auth: true, handler: (r) => accommodation.allocations(r) },
    { method: 'PATCH', path: '/accommodation/allocations', auth: true, handler: (r) => accommodation.setAllocations(r) },
    { method: 'GET', path: '/accommodation/church-rooms/:churchId', auth: true, handler: (r) => accommodation.churchRooms(r) },
```

(The `const accommodation = makeAccommodationController(...)` line at ~29 is unchanged.)

- [ ] **Step 3: Commit**

```bash
git add src/api
git commit -m "feat(accom): classroom + allocation HTTP routes"
```

---

## Task 8: Wire container, dashboard, admin lifecycle, seed

**Files:**
- Modify: `src/container.ts`
- Modify: `src/services/dashboard.service.ts`
- Modify: `src/services/admin.service.ts`
- Modify: `src/data/seed.ts`
- Modify: `src/services/admin.characterisation.test.ts` (snapshot field rename)

**Interfaces consumed:** Tasks 4-6.

- [ ] **Step 1: Dashboard — derive accommodation summary from people (no blocks)**

In `dashboard.service.ts`: remove the `IAccommodationRepository` import + the `computeLiveTaken` import. Change `makeDashboardService(personRepo, accommodationRepo, notifRepo, churchRepo)` to drop `accommodationRepo`. Change the `accommodationSummary` type and computation to two synthetic rows from people counts:

```ts
  accommodationSummary: Array<{ kind: string; label: string; campers: number }>;
```

```ts
    // Head counts by accommodation kind (blocks removed; capacity is no longer modelled).
    const tentN = scoped.filter((p) => p.accommodationKind === 'tent').length;
    const classroomN = scoped.filter((p) => p.accommodationKind === 'classroom').length;
    const accommodationSummary = [
      { kind: 'tent', label: 'Tent City', campers: tentN },
      { kind: 'classroom', label: 'Classrooms', campers: classroomN },
    ];
```

- [ ] **Step 2: Admin service — swap repos, snapshot classrooms, wipe allocations**

In `admin.service.ts`:
- Replace the `IAccommodationRepository` import with `IClassroomRepository, IAllocationRepository`; replace the `AccommodationBlock` type import with `Classroom`.
- Change the `makeAdminService` signature param `accommodationRepo: IAccommodationRepository` to `classroomRepo: IClassroomRepository, allocationRepo: IAllocationRepository`.
- In `reset()`'s `Promise.all`, replace `accommodationRepo.deleteAll()` with `classroomRepo.deleteAll()` and add `allocationRepo.deleteAll()`.
- In `saveDefaults()`, replace `accommodationRepo.findAll()` (the `blocks` binding) with `classroomRepo.findAll()` and write the snapshot field `classrooms` (was `accommodationBlocks`).
- In `newYear()`'s purge `Promise.all`, add `allocationRepo.deleteAll()` (allocations are transient — never restored). Replace the `replaceAll<AccommodationBlock>(accommodationRepo, defaults.accommodationBlocks ...)` line with `replaceAll<Classroom>(classroomRepo, defaults.classrooms as Classroom[])`.

- [ ] **Step 3: Container wiring**

In `container.ts`, for **both** the supabase branch and the in-memory branch:
- Import `InMemoryClassroomRepository, InMemoryAllocationRepository` and `SupabaseClassroomRepository, SupabaseAllocationRepository`; drop the `InMemoryAccommodationRepository`/`SupabaseAccommodationRepository` imports and the `AccommodationBlock` type import.
- In the `Repositories` interface replace `accommodation: IAccommodationRepository;` with `classrooms: IClassroomRepository; allocations: IAllocationRepository;` (import those interface types).
- Construct `classrooms` + `allocations` repos (json branch: `makeJsonPersistence<Classroom>('classrooms.json')` and `<RoomAllocation>('allocations.json')`), add both to the `repos` object and the `Promise.all(... .init())`.
- Update `makeAccommodationService(...)` call to `(classrooms, allocations, churches, settingsRepo, people)`.
- Update `makeDashboardService(...)` to drop the accommodation arg: `(people, notifications, churches)`.
- Update `makeAdminService(...)` to pass `classrooms, allocations` where `accommodationRepo` used to be (keep argument order consistent with the new signature from Step 2: `users, churches, people, classrooms, allocations, faqs, schedule, notifications, notes, devotionals, settings, snapshots`).

- [ ] **Step 4: Seed — classrooms + settings prices (no blocks)**

In `seed.ts`: drop the `AccommodationBlock` import and the `blocks` array + its save loop. Add classroom rooms and prices. In the `settings` object add `tentPrice: 80, classroomPrice: 120,`. After settings, seed a few rooms:

```ts
  // ----- Classroom rooms (reusable scaffold) -----
  const rooms = [
    { name: 'Room 1', capacity: 8 }, { name: 'Room 2', capacity: 8 },
    { name: 'Room 3', capacity: 8 }, { name: 'Room 4', capacity: 6 },
  ];
  for (const r of rooms) {
    await repos.classrooms.save({ id: newId('room'), name: r.name, capacity: r.capacity, createdAt: now, updatedAt: now });
  }
```

(Use `repos.classrooms` — confirm the property name matches the `Repositories` interface from Step 3.)

- [ ] **Step 5: Fix admin characterisation test**

In `admin.characterisation.test.ts`, rename any `accommodationBlocks` snapshot references to `classrooms`, and update the `makeAdminService(...)` construction to pass classroom + allocation in-memory repos in the new arg order. If it asserts on accommodation reset, point it at `classrooms`/`allocations` repos.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS (all backend references resolved). Fix any remaining `AccommodationBlock`/`reservations`/`accommodationRepo` references the compiler flags.

- [ ] **Step 7: Commit**

```bash
git add src/container.ts src/services/dashboard.service.ts src/services/admin.service.ts src/data/seed.ts src/services/admin.characterisation.test.ts
git commit -m "feat(accom): wire classrooms+allocations through container, dashboard, admin, seed"
```

---

## Task 9: Migration SQL (not applied yet)

**Files:**
- Create: `supabase/migrations/004_accommodation_rework.sql`

- [ ] **Step 1: Read `003_enable_rls.sql`** to copy its RLS-enable pattern (the API connects as superuser and bypasses RLS; new tables should match the defence-in-depth posture).

- [ ] **Step 2: Write the migration**

```sql
-- 004: Accommodation rework — replace blocks + per-church reservations with
-- classroom rooms + allocation rows; move tent/classroom prices onto settings.

drop table if exists reservations;
drop table if exists accommodation_blocks;

create table classrooms (
  id text primary key,
  name text not null,
  capacity int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table classroom_allocations (
  id text primary key,
  room_id text not null references classrooms(id) on delete cascade,
  church_id text not null,
  gender text not null,            -- male | female
  n int not null default 0
);
create index classroom_allocations_room_idx on classroom_allocations(room_id);
create index classroom_allocations_church_idx on classroom_allocations(church_id);

alter table settings add column if not exists tent_price numeric not null default 0;
alter table settings add column if not exists classroom_price numeric not null default 0;

-- Defence-in-depth: match 003 (RLS on, no anon policies; superuser API bypasses).
alter table classrooms enable row level security;
alter table classroom_allocations enable row level security;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/004_accommodation_rework.sql
git commit -m "feat(accom): migration 004 — classrooms, allocations, settings prices"
```

---

## Task 10: SPA — admin classroom management + settings prices

**Files:**
- Modify: `public/index.html` — `RENDER.adminAccom`/`saveBlock`/`addBlock`/`delBlock` (~1779-1822) and `RENDER.adminSettings`/`saveSettings` (~1891-1916, confirm via grep).

- [ ] **Step 1: Replace `RENDER.adminAccom` + helpers with room management**

Port from the demo (`camp-platform.html` `RENDER.adminAccom`/`saveRooms`/`delRoom`/`addRoom`, ~1558-1579), adapted to the real API (`/accommodation/classrooms`). Replace the `RENDER.adminAccom` body and `saveBlock`/`addBlock`/`delBlock` with:

```js
/* ===== ADMIN ACCOMMODATION (classroom rooms) ===== */
RENDER.adminAccom=async function(){
  const rooms=await api('/accommodation/classrooms');
  window._adminRooms=rooms||[];
  const rows=(rooms||[]).map(rm=>`
    <div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--line)">
      <span style="width:22px;text-align:center;flex:none">⌂</span>
      <input class="fld" id="rn_${rm.id}" value="${esc(rm.name)}" placeholder="Name" style="flex:3;min-width:0">
      <input class="fld" id="rc_${rm.id}" type="number" inputmode="numeric" min="0" value="${rm.capacity}" placeholder="Cap" style="flex:1;min-width:48px;max-width:80px;padding:6px 4px">
      <button class="btn sm" onclick="saveRoom('${rm.id}')" style="flex:none;padding:5px 10px">✓</button>
      <button class="btn red sm" onclick="delRoom('${rm.id}')" style="flex:none;padding:5px 8px">✕</button>
    </div>`).join('')||'<p class="note-hint">No classroom rooms yet.</p>';
  paint('adminAccom',`<div class="infobox">Classroom rooms have a name &amp; capacity. Tent City is auto-distributed (7 per tent) — no setup needed. Prices are set in Camp settings.</div>
    <div class="card"><h3 class="sec" style="margin-top:0">Classroom rooms</h3>${rows}</div>
    <div class="card"><div class="lbl" style="margin-top:0">Add a room</div>
      <div style="display:flex;gap:6px;align-items:flex-end">
        <div style="flex:2;min-width:110px"><label style="font-size:.72rem">Name</label><input class="fld" id="nrName" placeholder="e.g. Room 5"></div>
        <div style="flex:1;min-width:60px"><label style="font-size:.72rem">Cap</label><input class="fld" id="nrCap" type="number" inputmode="numeric" min="0" value="8"></div>
        <button class="btn" onclick="addRoom()" style="flex:none;align-self:flex-end">Add</button>
      </div></div>`,'Accommodation setup','Classroom rooms');
};
async function saveRoom(id){const el=document.getElementById('stage');const y=el?el.scrollTop:0;
  try{await api('/accommodation/classrooms/'+id,{method:'PATCH',body:{name:val('rn_'+id),capacity:Number(val('rc_'+id))||0}});toast('Saved ✓');await RENDER.adminAccom();if(el)el.scrollTop=y;}catch(e){toast(e.message);}}
async function delRoom(id){if(!confirm('Delete this room? Its allocations will be cleared.'))return;
  try{await api('/accommodation/classrooms/'+id,{method:'DELETE'});toast('Deleted');RENDER.adminAccom();}catch(e){toast(e.message);}}
async function addRoom(){if(!val('nrName')){toast('Enter a room name');return;}
  const name=val('nrName').trim();
  if((window._adminRooms||[]).some(r=>r.name.toLowerCase()===name.toLowerCase())){toast('A room named "'+name+'" already exists');return;}
  try{await api('/accommodation/classrooms',{method:'POST',body:{name,capacity:Number(val('nrCap'))||0}});toast('Room added ✓');RENDER.adminAccom();}catch(e){toast(e.message);}}
```

- [ ] **Step 2: Add tent/classroom price fields to Camp settings**

In `RENDER.adminSettings` (grep `RENDER.adminSettings=`), add two inputs (read `s.tentPrice`/`s.classroomPrice`), e.g. a row:

```js
    <div style="display:flex;gap:8px">
      <div style="flex:1"><label>△ Tent price ($/person)</label><input class="fld" id="stTent" type="number" inputmode="numeric" min="0" value="${esc(s.tentPrice??0)}"></div>
      <div style="flex:1"><label>⌂ Classroom price ($/person)</label><input class="fld" id="stClass" type="number" inputmode="numeric" min="0" value="${esc(s.classroomPrice??0)}"></div>
    </div>
```

In `saveSettings` (grep `function saveSettings` / `saveSettings=`), add to the PATCH body: `tentPrice:Number(val('stTent'))||0, classroomPrice:Number(val('stClass'))||0`.

- [ ] **Step 3: Verify (typecheck has no SPA coverage; reason + grep)**

Run: `npm run typecheck`
Expected: PASS. Then grep the SPA for stragglers: `rg "accommodation/blocks|/accommodation/held|/accommodation/reservations|saveBlock|addBlock|delBlock" public/index.html` — expect **no matches** after Task 11.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(accom-spa): admin classroom room management + settings prices"
```

---

## Task 11: SPA — allocation screen, budget, church tile, cache

**Files:**
- Modify: `public/index.html` — `RENDER.accom`/`drawAccom`/`saveChurchAlloc` (~1278-1315), `RENDER.budget`/`drawBudget` (~1249-1276), church at-camp home tile (grep `accommodation/held`, ~732), `_invalidate` map (~325), `RENDER.home` (church tile gating).
- Modify: `public/sw.js` (cache key).

- [ ] **Step 1: Replace `RENDER.accom`/`drawAccom`/`saveChurchAlloc` with the prototype allocation UI**

Port the demo's `RENDER.accom`, `accomChurches`, `addAlloc`, `removeAlloc`, `tentDist`, `drawAccom` (`camp-platform.html` ~1082-1144) with these real-API adaptations:
- Data load: `const [regs,rooms,alloc]=await Promise.all([api('/registrants'),api('/accommodation/classrooms'),api('/accommodation/allocations')]);` store on `window._accomRegs/_accomRooms/_accomAlloc`.
- `accomChurches(regs)` uses `r.kind==='camper'` in the demo; in the real DTO camper kind is `'student'|'leader'` per `/campers`, but `/registrants` rows use `kind:'youth'|'leader'` — **confirm by grep** (`rg "kind===" public/index.html` near people screens) and use whichever the registrants DTO carries. The classroom counts must count youth/students only (exclude leaders), matching the backend `computeGroups`.
- Persist via `await api('/accommodation/allocations',{method:'PATCH',body:{allocations:a}})` then re-fetch `window._accomAlloc=await api('/accommodation/allocations')`.
- **Single-gender rooms (enforce in UI):** in `drawAccom`, when building each room's "＋ Add ministry…" `<select>`, filter `availGroups` to the room's current gender if it already has entries:

```js
const roomGender = entries.length ? gByKey[entries[0].key]?.gender : null;
const addable = roomGender ? availGroups.filter(g=>g.gender===roomGender) : availGroups;
```

Use `addable` (not `availGroups`) for that room's dropdown. (`AllocationGroup.gender` must be present on the group objects — set `gender:'male'|'female'` alongside the display `'Guys'/'Girls'` label when building `groups`.) The backend also rejects mixed-gender, so this is defence-in-depth + clean UX.
- Keep the demo's "Not in a classroom allocation" remainder table and the Tent City Male/Female tables verbatim (the tent tables already match; reuse the existing `tentDist`/`tentTable` already in the SPA at ~1289/1301 — do not duplicate; delete the old `saveChurchAlloc`/per-church inputs).
- Header subtitle: `'Classrooms by ministry & gender'`.

- [ ] **Step 2: Budget reads prices from settings**

In `RENDER.budget`, replace the blocks fetch + `priceOf`:

```js
  const regs=await api('/registrants');
  window._budgetPrice={tent:Number(SETTINGS&&SETTINGS.tentPrice)||0,classroom:Number(SETTINGS&&SETTINGS.classroomPrice)||0};
```

Remove the `/accommodation/blocks` call and the `priceOf` helper. (`SETTINGS` is the global settings object populated at login / home; confirm it carries `tentPrice`/`classroomPrice` after Task 1+8 — the `/settings` endpoint returns the full `CampSettings`.)

- [ ] **Step 3: Church at-camp home tile → allocated rooms, gated to real at-camp**

Find the church accommodation tile (grep `accommodation/held`, ~732). Replace the `/held` call with `/accommodation/church-rooms/:churchId`, and only render it when in **real** at-camp:

```js
if(ACTOR.role==='church'&&ACTOR.churchId&&CAMP_MODE==='at-camp'&&!PREVIEW_MODE){
  try{const cr=await api('/accommodation/church-rooms/'+ACTOR.churchId);
    const rooms=(cr&&cr.rooms)||[];
    if(rooms.length){
      const lines=rooms.map(r=>`${esc(r.name)} — ${r.gender==='male'?'Guys':'Girls'} (${r.n})`).join('<br>');
      body+=`<div class="card"><div class="rowsb"><b>⌂ Your classroom${rooms.length>1?'s':''}</b></div><div class="sub" style="margin-top:6px">${lines}</div></div>`;
    }
  }catch(e){/* tile is best-effort; ignore */}
}
```

(Place this in the church branch of `renderHomeAtCamp`. Because `enterPreview()` sets `PREVIEW_MODE=true` and flips `CAMP_MODE` to `'at-camp'` locally, the `!PREVIEW_MODE` guard keeps the room hidden in preview; pre-camp home never reaches this at-camp renderer.)

- [ ] **Step 4: Update the `_invalidate` cache map**

In `_invalidate` (~325), map the new write paths to the GET keys they stale:
- `PATCH /accommodation/allocations` → invalidate `/accommodation/allocations`, `/accommodation/groups`, and any `/accommodation/church-rooms/*`.
- `POST|PATCH|DELETE /accommodation/classrooms*` → invalidate `/accommodation/classrooms` (and allocations, since deleting a room cascades).
Remove any old `/accommodation/blocks`/`/accommodation/reservations`/`/accommodation/held` mappings.

- [ ] **Step 5: Bump the service-worker cache**

In `public/sw.js`, change the cache constant from `camp-v2` to `camp-v3` (grep `camp-v`).

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run test`
Expected: PASS. Then:
`rg "accommodation/blocks|/accommodation/held|/accommodation/reservations|saveChurchAlloc|priceOf" public/index.html` → **no matches**.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/sw.js
git commit -m "feat(accom-spa): classroom allocation screen, settings-priced budget, at-camp church room tile"
```

---

## Task 12: Full-suite verification + remaining reference sweep

**Files:** whole repo (read-only sweep + fixes).

- [ ] **Step 1: Grep for stragglers across `src/`**

Run: `rg -n "AccommodationBlock|accommodationBlocks|IAccommodationRepository|accommodation-occupancy|reservations|setReservations|baseTaken|liveTaken" src/`
Expected: **no matches** except inside the migration file/CHANGELOG. Fix any remaining hits (likely stale tests or DTO types).

- [ ] **Step 2: Full typecheck + tests**

Run: `npm run typecheck && npm run test`
Expected: typecheck clean; vitest green. The suite count should be ≥ prior 219 minus the deleted occupancy tests plus the new allocation tests. Investigate any red test — do not delete a test to make it pass unless the behaviour it asserts was intentionally removed (blocks/reservations).

- [ ] **Step 3: Update docs**

- `CLAUDE.md` → "SPA ↔ backend contract": replace the Accommodation bullet (blocks + per-church reservations) with the classrooms + allocations + settings-prices model. Remove the "Budget prices come from blocks" note (now from settings). Note tent auto-distribution (7/tent, leaders separate) and single-gender rooms.
- `debug.md` → update the Accommodation rows in the SPA map + symptom router (`RENDER.accom`/`drawAccom`/`addAlloc`/`removeAlloc`, `RENDER.adminAccom` room management) and the backend table row (`accommodation.service.ts` + `accommodation-allocation.ts`).
- `CHANGELOG.txt` → add an entry describing the rework + the pending migration 004.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md debug.md CHANGELOG.txt
git commit -m "docs(accom): document classroom/allocation model + migration 004"
```

- [ ] **Step 5: STOP — report for approval (do NOT deploy)**

Produce a short summary for the user:
- Confirm `npm run typecheck` + `npm run test` are green (paste counts).
- State that **migration `004_accommodation_rework.sql` has NOT been applied to prod** and the branch has **not** been pushed.
- Note that this migration is **destructive** (drops `accommodation_blocks` + `reservations`); recommend the user run an audit export first (the wipe-guard convention) and confirm before applying via the Supabase tooling, then push `master` to auto-deploy.

---

## Self-Review

**Spec coverage:** Classroom rooms (T1,4,5,10) · allocations with auto-fill/partial placement/cascade ported in SPA (T11) · 75% eligibility + single-gender + capacity validation (T3 pure, T6 service, T11 UI) · tent auto-distribution 7/tent, leaders separate (T3, existing SPA tent tables) · prices → settings (T1,2,5,8,10,11) · remove blocks + per-church reservations fully incl. DB (T1,4,5,7,9) · church room visibility gated to real at-camp (T11.3) · reset/new-year: rooms = scaffold, allocations = transient (T8.2) · migration (T9) · docs (T12). All covered.

**Placeholder scan:** Each code step contains concrete code. SPA steps that say "port from demo" give the exact adapted code + the precise real-API substitutions and the single-gender filter. Two items are explicitly flagged to **confirm by grep** in-repo (registrants `kind` value; base in-memory class name) rather than guessed — these are verification instructions, not placeholders.

**Type consistency:** `AllocationMap = Record<string, Array<{key,n}>>` is the wire shape returned by `getAllocations`/`setAllocations` and consumed by the SPA. `RoomAllocation` rows are the storage shape; service converts via `rowsToMap`. `computeGroups`/`validateAllocations` signatures match between the pure module (T3), its tests, and the service (T6). `makeAccommodationService(classroomRepo, allocationRepo, churchRepo, settingsRepo, personRepo)` is consistent across T6 + container (T8.3). `makeAdminService` and `makeDashboardService` new arities are defined in T8.1/T8.2 and called in T8.3. `Repositories.classrooms`/`.allocations` names are used consistently in container + seed.
