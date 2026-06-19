import type { ID, ISODateString } from '../types/common';

export interface Group {
  id: ID;
  name: string;
  churchId: ID;
  zone: string;
  leaderId: string;
  camperIds: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
