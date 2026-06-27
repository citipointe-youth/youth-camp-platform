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
    const people = [
      occ({ churchId: 'c2', accommodationKind: 'classroom' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
      occ({ churchId: 'c2', accommodationKind: 'tent' }),
    ];
    expect(computeGroups(people)).toEqual([]);
  });

  it('includes leaders but ignores cancelled people in the classroom counts', () => {
    const people = [
      occ({ churchId: 'c3', kind: 'leader' }),       // included — leader counts toward pool
      occ({ churchId: 'c3', lifecycle: 'cancelled' }),
      occ({ churchId: 'c3', gender: 'male' }),
    ];
    const groups = computeGroups(people);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('c3|male');
    expect(groups[0]!.n).toBe(2);                     // leader + student
    expect(groups[0]!.gender).toBe('male');
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
