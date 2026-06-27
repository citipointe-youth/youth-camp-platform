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
