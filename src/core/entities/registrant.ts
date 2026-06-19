import type { ID, ISODateString } from '../types/common';
import type {
  Gender,
  Grade,
  AccommodationKind,
  PaymentStatus,
  RegistrantStatus,
  RegistrantKind,
} from '../types/enums';

export interface Registrant {
  id: ID;
  firstName: string;
  lastName: string;
  gender: Gender;
  kind: RegistrantKind;
  grade?: Grade | null;
  accommodationKind?: AccommodationKind | null;
  accommodationLabel?: string | null;
  dietary?: string | null;
  medical?: string | null;
  paymentStatus: PaymentStatus;
  blueCardCollected: boolean;
  parentName?: string | null;
  parentPhone?: string | null;
  churchId: ID;
  churchName: string;
  zone: string;
  status: RegistrantStatus;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
