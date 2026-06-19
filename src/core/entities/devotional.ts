import type { ID, ISODateString } from '../types/common';

export interface Devotional {
  id: ID;
  day: string;
  verse: string;
  reference: string;
  reflection: string;
  prayer: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
