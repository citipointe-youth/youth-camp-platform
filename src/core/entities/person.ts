import type { ID, ISODateString } from '../types/common';
import type {
  Gender,
  Grade,
  AccommodationKind,
  PaymentStatus,
  ConsentType,
  PersonKind,
  PersonLifecycle,
} from '../types/enums';

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

/** Raw Elvanto submission-metadata columns, kept verbatim for byte-for-byte export round-trip. */
export interface ElvantoMeta {
  dateSubmitted: string | null;
  submissionStatus: string | null;
  person: string | null;
  personStatus: string | null;
  todaysDate: string | null;
}

/**
 * Person — the unified pre-camp/at-camp entity (design D2).
 *
 * A single system-of-record entity replacing the separate `Registrant` (pre-camp Hub)
 * and `Camper` (at-camp Portal) entities. Lifecycle is a STATUS, not an entity type:
 * a person is a registrant until their **Day-1 first check-in**, at which point the
 * check-in service promotes them (`registered` → `arrived`) and they become a "camper".
 *
 * `kind` collapses the old mismatched taxonomies (`camper|leader` vs `student|leader`)
 * into one: `youth | leader`.
 *
 * Per design D1 (security parity only), medical / blue-card / consent fields are stored
 * as ordinary data — no validation or consent-gating in this phase.
 *
 * NOTE: Step 1 of the Phase-1 unification introduces this type additively. The repos,
 * services and routes are migrated onto it in Steps 2–4 (which require a compiler in the
 * loop). Until then, `Registrant` and `Camper` remain the live entities and the mapping
 * helpers below bridge the two representations.
 */
export interface Person {
  id: ID;

  // ----- identity -----
  firstName: string;
  lastName: string;
  gender: Gender;
  dateOfBirth?: string | null;
  grade?: Grade | null;
  school?: string | null;
  kind: PersonKind;

  // ----- affiliation -----
  churchId: ID;
  churchName: string;
  zone: string;
  groupId?: string | null;

  // ----- contact + care (ordinary data per D1) -----
  mobile?: string | null;
  email?: string | null;
  suburb?: string | null;
  postcode?: string | null;
  state?: string | null;
  medicalConditions: string[];
  dietaryRequirements: string[];
  otherMedications?: string | null;
  medicareNumber?: string | null;
  churchUnlistedNote?: string | null;
  parentGuardianName?: string | null;
  parentPhone?: string | null;
  parentRelation?: string | null;
  blueCardNumber?: string | null;
  blueCardExpiry?: string | null;
  consents: Record<ConsentType, { granted: boolean; timestamp: ISODateString | null }>;

  // ----- pre-camp / Hub -----
  paymentStatus: PaymentStatus;
  accommodationKind?: AccommodationKind | null;
  accommodationLabel?: string | null;
  registrationType?: string | null;
  registrationCost?: number | null;
  discountCode?: string | null;

  // ----- lifecycle (the unification core) -----
  lifecycle: PersonLifecycle;
  atCamp: boolean; // derived convenience: lifecycle is an at-camp state

  // ----- at-camp history (child tables in Supabase, per D4) -----
  checkInHistory: CheckInEntry[];
  signOutHistory: SignOutEvent[];

  elvantoMeta?: ElvantoMeta | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Lifecycle states that mean the person has arrived at camp (is a "camper"). */
export const AT_CAMP_LIFECYCLES: readonly PersonLifecycle[] = ['arrived', 'checked_out', 'departed'];

/** A person is a "camper" once they have arrived at camp (Day-1 sign-in or later). */
export function isCamper(person: Pick<Person, 'lifecycle'>): boolean {
  return AT_CAMP_LIFECYCLES.includes(person.lifecycle);
}

/** A person is still a pre-camp registrant (not yet checked in, not cancelled). */
export function isRegistrant(person: Pick<Person, 'lifecycle'>): boolean {
  return person.lifecycle === 'registered';
}

