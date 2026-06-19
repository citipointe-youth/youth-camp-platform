import type { ID, ISODateString } from '../types/common';

export interface FaqItem {
  id: ID;
  question: string;
  answer: string;
  order: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
