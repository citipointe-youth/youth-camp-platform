import type { Person } from '../../core/entities/person';
import { isCamper } from '../../core/entities/person';

/**
 * The JSON shape /registrants returns — the SPA's pre-camp My Youth screen reads
 * these fields bare. Keep these names stable.
 */
export interface RegistrantDto {
  id: string;
  firstName: string;
  lastName: string;
  kind: 'camper' | 'leader';
  paymentStatus: Person['paymentStatus'];
  blueCardCollected: boolean;
  churchId: string;
  churchName: string;
  zone: string;
  status: 'registered' | 'cancelled';
  grade: Person['grade'];
  accommodationKind: Person['accommodationKind'];
  accommodationLabel: string | null;
  mobile: string | null;
  parentGuardianName: string | null;
  parentPhone: string | null;
  gender: Person['gender'];
  medicalConditions: string[];
  dietaryRequirements: string[];
  blueCardNumber: string | null;
  blueCardExpiry: string | null;
  email: string | null;
  dateOfBirth: string | null;
  suburb: string | null;
  postcode: string | null;
  state: string | null;
  otherMedications: string | null;
  medicareNumber: string | null;
  churchUnlistedNote: string | null;
  parentRelation: string | null;
  consentMedical: boolean;
  consentMedia: boolean;
  consentSupervision: boolean;
  registrationType: string | null;
  registrationCost: number | null;
  discountCode: string | null;
  ticketNumber: string | null;
  invoiceNumber: string | null;
  accommodationKindConfidence: Person['accommodationKindConfidence'];
  discountAmount: number | null;
  amountPaid: number | null;
  feesAmount: number | null;
  taxAmount: number | null;
  needsReview: boolean;
  needsReviewReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The JSON shape /campers returns — the SPA's at-camp screens read these bare. */
export interface CamperDto {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  kind: 'student' | 'leader';
  churchId: string;
  churchName: string;
  zone: string;
  groupId: string | null;
  mobile: string | null;
  gender: Person['gender'];
  grade: Person['grade'];
  dateOfBirth: string | null;
  accommodationKind: Person['accommodationKind'];
  medicalConditions: string[];
  dietaryRequirements: string[];
  otherMedications: string | null;
  medicareNumber: string | null;
  parentGuardianName: string | null;
  parentPhone: string | null;
  parentRelation: string | null;
  consentMedical: boolean;
  blueCardNumber: string | null;
  blueCardExpiry: string | null;
  lifecycle: Person['lifecycle'];
  atCamp: boolean;
  checkInHistory: Person['checkInHistory'];
  signOutHistory: Person['signOutHistory'];
  createdAt: string;
  updatedAt: string;
}

/** Check-in roster entry the SPA reads from /checkin/status. */
export interface RosterEntry {
  camperId: string;
  firstName: string;
  lastName: string;
  church: string;
  zone: string;
  gender: Person['gender'];
  grade: Person['grade'];
  medicalFlag: boolean;
  checkedIn: boolean;
  lastEntry: 'in' | 'out' | null;
}

export function toRegistrantDto(p: Person): RegistrantDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    kind: p.kind === 'leader' ? 'leader' : 'camper',
    paymentStatus: p.paymentStatus,
    blueCardCollected: p.blueCardNumber != null,
    churchId: p.churchId,
    churchName: p.churchName,
    zone: p.zone,
    status: p.lifecycle === 'cancelled' ? 'cancelled' : 'registered',
    grade: p.grade ?? null,
    accommodationKind: p.accommodationKind ?? null,
    accommodationLabel: p.accommodationLabel ?? null,
    mobile: p.mobile ?? null,
    parentGuardianName: p.parentGuardianName ?? null,
    parentPhone: p.parentPhone ?? null,
    gender: p.gender,
    medicalConditions: p.medicalConditions,
    dietaryRequirements: p.dietaryRequirements,
    blueCardNumber: p.blueCardNumber ?? null,
    blueCardExpiry: p.blueCardExpiry ?? null,
    email: p.email ?? null,
    dateOfBirth: p.dateOfBirth ?? null,
    suburb: p.suburb ?? null,
    postcode: p.postcode ?? null,
    state: p.state ?? null,
    otherMedications: p.otherMedications ?? null,
    medicareNumber: p.medicareNumber ?? null,
    churchUnlistedNote: p.churchUnlistedNote ?? null,
    parentRelation: p.parentRelation ?? null,
    consentMedical: p.consents.medical?.granted ?? false,
    consentMedia: p.consents.media?.granted ?? false,
    consentSupervision: p.consents.supervision?.granted ?? false,
    registrationType: p.registrationType ?? null,
    registrationCost: p.registrationCost ?? null,
    discountCode: p.discountCode ?? null,
    ticketNumber: p.ticketNumber ?? null,
    invoiceNumber: p.invoiceNumber ?? null,
    accommodationKindConfidence: p.accommodationKindConfidence ?? null,
    discountAmount: p.discountAmount ?? null,
    amountPaid: p.amountPaid ?? null,
    feesAmount: p.feesAmount ?? null,
    taxAmount: p.taxAmount ?? null,
    needsReview: p.needsReview ?? false,
    needsReviewReason: p.needsReviewReason ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toCamperDto(p: Person): CamperDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    fullName: `${p.firstName} ${p.lastName}`,
    kind: p.kind === 'leader' ? 'leader' : 'student',
    churchId: p.churchId,
    churchName: p.churchName,
    zone: p.zone,
    groupId: p.groupId ?? null,
    mobile: p.mobile ?? null,
    gender: p.gender,
    grade: p.grade ?? null,
    dateOfBirth: p.dateOfBirth ?? null,
    accommodationKind: p.accommodationKind ?? null,
    medicalConditions: p.medicalConditions,
    dietaryRequirements: p.dietaryRequirements,
    otherMedications: p.otherMedications ?? null,
    medicareNumber: p.medicareNumber ?? null,
    parentGuardianName: p.parentGuardianName ?? null,
    parentPhone: p.parentPhone ?? null,
    parentRelation: p.parentRelation ?? null,
    consentMedical: p.consents.medical?.granted ?? false,
    blueCardNumber: p.blueCardNumber ?? null,
    blueCardExpiry: p.blueCardExpiry ?? null,
    lifecycle: p.lifecycle,
    atCamp: p.atCamp,
    checkInHistory: p.checkInHistory,
    signOutHistory: p.signOutHistory,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function toRosterEntry(p: Person, sessionId: string): RosterEntry {
  const sessionEntries = p.checkInHistory.filter((e) => e.sessionId === sessionId);
  const last = sessionEntries[sessionEntries.length - 1] ?? null;
  return {
    camperId: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    church: p.churchName,
    zone: p.zone,
    gender: p.gender,
    grade: p.grade ?? null,
    medicalFlag: p.medicalConditions.length > 0 || p.otherMedications != null,
    checkedIn: last?.type === 'in',
    lastEntry: last?.type ?? null,
  };
}
