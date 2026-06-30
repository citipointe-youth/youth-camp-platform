import type { ID, ISODateString } from '../types/common';

export type AllocationGender = 'male' | 'female';

/**
 * PC-10 grade bracket. A church×gender classroom pool over the split threshold is
 * divided into 7-9 / 10-12 sub-pools, and allocation rows for those sub-pools carry
 * the bracket so the 3-part group key (`churchId|gender|bracket`) survives persistence.
 * (Defined here in core — entities import from no other layer; the allocation service
 * re-exports a structurally identical `GradeBracket`.)
 */
export type AllocationBracket = '7-9' | '10-12';

/** A reusable classroom room (scaffold). Capacity is a head count. */
export interface Classroom {
  id: ID;
  name: string;
  capacity: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * One placement row: `n` campers of `churchId`+`gender` placed in `roomId`.
 * `bracket` is set only for PC-10 split sub-pools (`7-9` / `10-12`); for a non-split
 * church×gender pool it is null/absent. Persisting it keeps the 3-part group key
 * (`churchId|gender|bracket`) intact through a save/load round-trip (C-1).
 */
export interface RoomAllocation {
  id: ID;
  roomId: ID;
  churchId: ID;
  gender: AllocationGender;
  n: number;
  bracket?: AllocationBracket | null;
}
