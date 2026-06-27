import type { ID, ISODateString } from '../types/common';
import type { ZoneName } from '../types/enums';

export interface ChurchContact {
  name: string;
  phone: string;
}

export interface Church {
  id: ID;
  name: string;
  zone: ZoneName;
  contactPhone?: string;
  contacts: {
    male: { primary: ChurchContact; backup: ChurchContact };
    female: { primary: ChurchContact; backup: ChurchContact };
  };
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
