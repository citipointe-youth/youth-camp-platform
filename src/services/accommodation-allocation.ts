export type AllocationGender = 'male' | 'female';

export interface AllocationOccupant {
  churchId: string;
  churchName: string;
  gender: string;                 // 'male' | 'female' | other
  kind: string;                   // 'youth' | 'leader'
  accommodationKind?: string | null; // 'tent' | 'classroom' | null
  lifecycle?: string | null;      // 'cancelled' excluded
  grade?: number | null;          // PC-10: school grade (7..12), null for leaders
}

/** PC-10: school-grade bracket for the large-pool split. */
export type GradeBracket = '7-9' | '10-12';

export interface AllocationGroup {
  key: string;        // `${churchId}|${gender}` or, when split, `${churchId}|${gender}|${bracket}`
  churchId: string;
  church: string;
  gender: AllocationGender;
  n: number;
  bracket?: GradeBracket;  // present only on split sub-pools (PC-10)
}

// PC-10: a church×gender classroom pool larger than this splits into 7-9 / 10-12 sub-pools.
export const SPLIT_THRESHOLD = 50;

export function bracketOfGrade(grade: number | null | undefined): GradeBracket | null {
  if (grade == null) return null;
  if (grade >= 7 && grade <= 9) return '7-9';
  if (grade >= 10 && grade <= 12) return '10-12';
  return null;
}

export interface ClassroomLike { id: string; name: string; capacity: number }
export interface AllocEntry { key: string; n: number }
export type AllocationMap = Record<string, AllocEntry[]>;

export const ELIGIBLE_RATIO = 0.75;
export const TENT_SIZE = 7;

// Per church×gender classroom tally, broken down by grade bracket + leader count, so a
// pool over SPLIT_THRESHOLD can be split into 7-9 / 10-12 sub-pools (PC-10).
interface GenderTally {
  cls: number;          // total classroom-kind people of this gender (youth + leaders)
  youth79: number;      // classroom youth in grades 7-9
  youth1012: number;    // classroom youth in grades 10-12
  youthOther: number;   // classroom youth with no/unknown grade (kept with 7-9 when splitting)
  leaders: number;      // classroom leaders (no grade)
}
interface ChurchTally {
  id: string; name: string; total: number; classroom: number;
  male: GenderTally; female: GenderTally;
}

function newGender(): GenderTally { return { cls: 0, youth79: 0, youth1012: 0, youthOther: 0, leaders: 0 }; }

function tallyChurches(occupants: readonly AllocationOccupant[]): Map<string, ChurchTally> {
  const by = new Map<string, ChurchTally>();
  for (const o of occupants) {
    if (o.lifecycle === 'cancelled') continue;
    let c = by.get(o.churchId);
    if (!c) {
      c = { id: o.churchId, name: o.churchName, total: 0, classroom: 0, male: newGender(), female: newGender() };
      by.set(o.churchId, c);
    }
    c.total++;
    if (o.accommodationKind === 'classroom') {
      c.classroom++;
      const g = o.gender === 'male' ? c.male : c.female;
      g.cls++;
      if (o.kind === 'leader') g.leaders++;
      else {
        const b = bracketOfGrade(o.grade);
        if (b === '7-9') g.youth79++;
        else if (b === '10-12') g.youth1012++;
        else g.youthOther++;
      }
    }
  }
  return by;
}

// Build the group(s) for one church×gender classroom pool. A pool with >SPLIT_THRESHOLD
// people splits into two grade-bracket sub-pools (7-9 / 10-12); that gender's leaders divide
// evenly across the two (odd leader → the extra goes to 7-9). Youth with no/unknown grade ride
// with the 7-9 bracket. A pool at or below the threshold stays one group with the original key.
function groupsForGender(
  c: ChurchTally, gender: AllocationGender, g: GenderTally,
): AllocationGroup[] {
  if (g.cls === 0) return [];
  const base = { churchId: c.id, church: c.name, gender };
  if (g.cls <= SPLIT_THRESHOLD) {
    return [{ key: `${c.id}|${gender}`, ...base, n: g.cls }];
  }
  const ld79 = Math.ceil(g.leaders / 2);   // odd leader → 7-9
  const ld1012 = g.leaders - ld79;
  const n79 = g.youth79 + g.youthOther + ld79;
  const n1012 = g.youth1012 + ld1012;
  const out: AllocationGroup[] = [];
  if (n79 > 0) out.push({ key: `${c.id}|${gender}|7-9`, ...base, n: n79, bracket: '7-9' });
  if (n1012 > 0) out.push({ key: `${c.id}|${gender}|10-12`, ...base, n: n1012, bracket: '10-12' });
  return out;
}

export function computeGroups(occupants: readonly AllocationOccupant[]): AllocationGroup[] {
  const groups: AllocationGroup[] = [];
  for (const c of tallyChurches(occupants).values()) {
    const eligible = c.total > 0 && c.classroom / c.total >= ELIGIBLE_RATIO;
    if (!eligible) continue;
    groups.push(...groupsForGender(c, 'male', c.male));
    groups.push(...groupsForGender(c, 'female', c.female));
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
