import type { ID, ISODateString } from '../types/common';

export interface StudentNote {
  id: ID;
  camperId: ID;
  body: string;
  authorId: ID;
  authorName: string;
  authorChurchId?: string | null;
  sessionId?: string | null;
  /** Record category: 'note' | 'testimony' | (attendance kinds), free-form for forward compatibility. */
  category?: string | null;
  createdAt: ISODateString;
}
