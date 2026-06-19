import type { ID, ISODateString } from '../types/common';
import type { Gender, Grade, CamperStatus, CamperKind, ConsentType } from '../types/enums';

export interface CheckInEntry {
  id: ID;
  sessionId: string;
  sessionLabel: string;
  type: 'in' | 'out';
  leaderId: string;
  timestamp: ISODateString;
}

export interface SignOutEvent {
  id: ID;
  type: 'out' | 'in';
  leaderName: string;
  reason?: string;
  parentsMet?: boolean;
  authorId: string;
  timestamp: ISODateString;
}

export interface Camper {
  id: ID;
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth?: string | null;
  grade?: Grade | null;
  school?: string | null;
  zone: string;
  groupId?: string | null;
  kind: CamperKind;
  mobile?: string | null;
  email?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  state?: string | null;
  medicalConditions: string[];
  dietaryRequirements: string[];
  otherMedications?: string | null;
  consents: Record<ConsentType, { granted: boolean; timestamp: ISODateString | null }>;
  parentGuardianName?: string | null;
  parentPhone?: string | null;
  parentRelation?: string | null;
  blueCardNumber?: string | null;
  blueCardExpiry?: string | null;
  churchId: ID;
  churchName: string;
  atCamp: boolean;
  status: CamperStatus;
  checkInHistory: CheckInEntry[];
  signOutHistory: SignOutEvent[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
