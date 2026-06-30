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

describe('computeGroups — PC-10 large-pool grade-bracket split (>50)', () => {
  // helper: make n classroom youth of a given gender + grade for church c1
  const youths = (n: number, gender: 'male' | 'female', grade: number): AllocationOccupant[] =>
    Array.from({ length: n }, () => occ({ churchId: 'c1', gender, kind: 'youth', grade, accommodationKind: 'classroom' }));

  it('a gender pool at exactly 50 stays a single group', () => {
    const people = youths(50, 'male', 8);
    const groups = computeGroups(people);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('c1|male');
    expect(groups[0]!.n).toBe(50);
    expect(groups[0]!.bracket).toBeUndefined();
  });

  it('a gender pool at 51 splits into 7-9 / 10-12 sub-pools', () => {
    const people = [...youths(30, 'male', 8), ...youths(21, 'male', 11)];
    const groups = computeGroups(people).filter((g) => g.gender === 'male');
    expect(groups.map((g) => g.key).sort()).toEqual(['c1|male|10-12', 'c1|male|7-9']);
    expect(groups.find((g) => g.bracket === '7-9')!.n).toBe(30);
    expect(groups.find((g) => g.bracket === '10-12')!.n).toBe(21);
  });

  it('odd leader count: the extra leader goes to the 7-9 bracket', () => {
    // 51 total male classroom: 30 youth 7-9, 16 youth 10-12, 5 leaders → split, leaders ceil(5/2)=3 to 7-9, 2 to 10-12
    const people = [
      ...youths(30, 'male', 8),
      ...youths(16, 'male', 11),
      ...Array.from({ length: 5 }, () => occ({ churchId: 'c1', gender: 'male', kind: 'leader', grade: null, accommodationKind: 'classroom' })),
    ];
    const groups = computeGroups(people).filter((g) => g.gender === 'male');
    expect(groups.find((g) => g.bracket === '7-9')!.n).toBe(30 + 3);
    expect(groups.find((g) => g.bracket === '10-12')!.n).toBe(16 + 2);
    // total preserved
    expect(groups.reduce((s, g) => s + g.n, 0)).toBe(51);
  });

  it('one gender over 50 splits; the other under 50 stays single', () => {
    const people = [
      ...youths(30, 'male', 8), ...youths(25, 'male', 11), // 55 male → split
      ...youths(10, 'female', 9),                          // 10 female → single
    ];
    const groups = computeGroups(people);
    const male = groups.filter((g) => g.gender === 'male');
    const female = groups.filter((g) => g.gender === 'female');
    expect(male.map((g) => g.bracket).sort()).toEqual(['10-12', '7-9']);
    expect(female).toHaveLength(1);
    expect(female[0]!.key).toBe('c1|female');
    expect(female[0]!.bracket).toBeUndefined();
  });

  it('youth with no/unknown grade ride with the 7-9 bracket when splitting', () => {
    const people = [
      ...youths(40, 'male', 8),
      ...youths(8, 'male', 11),
      ...Array.from({ length: 4 }, () => occ({ churchId: 'c1', gender: 'male', kind: 'youth', grade: null, accommodationKind: 'classroom' })),
    ]; // 52 total → split; 4 ungraded ride 7-9
    const groups = computeGroups(people).filter((g) => g.gender === 'male');
    expect(groups.find((g) => g.bracket === '7-9')!.n).toBe(40 + 4);
    expect(groups.find((g) => g.bracket === '10-12')!.n).toBe(8);
  });

  it('all-leaders pool over 50 splits leaders evenly (no youth)', () => {
    const people = Array.from({ length: 51 }, () =>
      occ({ churchId: 'c1', gender: 'female', kind: 'leader', grade: null, accommodationKind: 'classroom' }));
    const groups = computeGroups(people).filter((g) => g.gender === 'female');
    expect(groups.find((g) => g.bracket === '7-9')!.n).toBe(26); // ceil(51/2)
    expect(groups.find((g) => g.bracket === '10-12')!.n).toBe(25);
  });

  it('split sub-pools still pass single-gender validation (gender derived from key index 1)', () => {
    const people = [...youths(30, 'male', 8), ...youths(21, 'male', 11)];
    const groups = computeGroups(people);
    const rooms = [{ id: 'r1', name: 'R1', capacity: 30 }];
    expect(() => validateAllocations({ r1: [{ key: 'c1|male|7-9', n: 30 }] }, { rooms, groups })).not.toThrow();
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
