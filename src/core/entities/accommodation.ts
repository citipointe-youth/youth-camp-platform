import type { ID, ISODateString } from '../types/common';
import type { AccommodationKind } from '../types/enums';

export interface AccommodationBlock {
  id: ID;
  kind: AccommodationKind;
  name: string;
  price: number;
  capacity: number;
  baseTaken: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
