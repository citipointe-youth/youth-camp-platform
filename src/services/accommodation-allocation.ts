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
    if (o.lifecycle === 'cancelled') continue;
    let c = by.get(o.churchId);
    if (!c) {
      c = { id: o.churchId, name: o.churchName, total: 0, classroom: 0, maleCls: 0, femaleCls: 0 };
      by.set(o.churchId, c);
    }
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
    if (!c) {
      c = { churchId: o.churchId, church: o.churchName, m: { stu: 0, ld: 0 }, f: { stu: 0, ld: 0 } };
      by.set(o.churchId, c);
    }
    const g = o.gender === 'male' ? c.m : c.f;
    if (o.kind === 'leader') g.ld++; else g.stu++;
  }
  return [...by.values()];
}

export function tentsFor(count: number): number {
  return Math.ceil(count / TENT_SIZE);
}
