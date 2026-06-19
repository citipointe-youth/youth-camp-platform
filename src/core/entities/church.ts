import type { ID, ISODateString } from '../types/common';
import type { ZoneName, AccommodationKind } from '../types/enums';

export interface AccommodationReservation {
  kind: AccommodationKind;
  spots: number;
  label: string;
  confirmed: boolean;
}

export interface ChurchContact {
  name: string;
  phone: string;
}

export interface Church {
  id: ID;
  name: string;
  zone: ZoneName;
  code: string;
  selfRegisterSlug: string;
  expectedCount: number;
  youthPastorName?: string;
  contactEmail?: string;
  contactPhone?: string;
  reservations: AccommodationReservation[];
  contacts: {
    male: { primary: ChurchContact; backup: ChurchContact };
    female: { primary: ChurchContact; backup: ChurchContact };
  };
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
