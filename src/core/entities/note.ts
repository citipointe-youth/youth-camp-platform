import type { ID, ISODateString } from '../types/common';

export interface StudentNote {
  id: ID;
  // Null for a "general" testimony not tied to a specific student.
  camperId: ID | null;
  body: string;
  authorId: ID;
  authorName: string;
  authorChurchId?: string | null;
  sessionId?: string | null;
  /** Record category: 'note' | 'testimony' | (attendance kinds), free-form for forward compatibility. */
  category?: string | null;
  createdAt: ISODateString;
}
