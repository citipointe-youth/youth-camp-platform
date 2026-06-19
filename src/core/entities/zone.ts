import type { ID, ISODateString } from '../types/common';

export interface Zone {
  id: ID;
  name: string;
  label: string;
  colorHex: string;
  leaderIds: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
