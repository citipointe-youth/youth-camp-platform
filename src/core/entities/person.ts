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
import type { Registrant } from './registrant';
import type { Camper, CheckInEntry, SignOutEvent } from './camper';

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

  // ----- lifecycle (the unification core) -----
  lifecycle: PersonLifecycle;
  atCamp: boolean; // derived convenience: lifecycle is an at-camp state

  // ----- at-camp history (child tables in Supabase, per D4) -----
  checkInHistory: CheckInEntry[];
  signOutHistory: SignOutEvent[];

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

// ---------------------------------------------------------------------------
// Mapping helpers — bridge the legacy Registrant/Camper representations to the
// unified Person while the destructive merge (Steps 2–4) is staged. These let
// the new model be introduced and unit-tested with zero behavioural change to
// the live entities.
// ---------------------------------------------------------------------------

function emptyConsents(): Person['consents'] {
  return {
    medical: { granted: false, timestamp: null },
    media: { granted: false, timestamp: null },
    supervision: { granted: false, timestamp: null },
  };
}

/** Map the legacy `camper|leader` / `student|leader` kinds onto the unified `youth|leader`. */
export function toPersonKind(kind: string): PersonKind {
  return kind === 'leader' ? 'leader' : 'youth';
}

/**
 * Map a pre-camp Registrant onto a Person. The person is in the `registered`
 * (or `cancelled`) lifecycle state — not yet at camp.
 */
export function personFromRegistrant(r: Registrant): Person {
  return {
    id: r.id,
    firstName: r.firstName,
    lastName: r.lastName,
    gender: r.gender,
    dateOfBirth: null,
    grade: r.grade ?? null,
    school: null,
    kind: toPersonKind(r.kind),
    churchId: r.churchId,
    churchName: r.churchName,
    zone: r.zone,
    groupId: null,
    mobile: null,
    email: null,
    suburb: null,
    postcode: null,
    state: null,
    medicalConditions: r.medical ? [r.medical] : [],
    dietaryRequirements: r.dietary ? [r.dietary] : [],
    otherMedications: null,
    parentGuardianName: r.parentName ?? null,
    parentPhone: r.parentPhone ?? null,
    parentRelation: null,
    blueCardNumber: null,
    blueCardExpiry: null,
    consents: emptyConsents(),
    paymentStatus: r.paymentStatus,
    accommodationKind: r.accommodationKind ?? null,
    accommodationLabel: r.accommodationLabel ?? null,
    lifecycle: r.status === 'cancelled' ? 'cancelled' : 'registered',
    atCamp: false,
    checkInHistory: [],
    signOutHistory: [],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Map an at-camp Camper onto a Person, deriving lifecycle from the camper status. */
export function personFromCamper(c: Camper): Person {
  const lifecycle: PersonLifecycle =
    c.status === 'cancelled'
      ? 'cancelled'
      : c.status === 'checked_out'
        ? 'checked_out'
        : c.status === 'departed'
          ? 'departed'
          : c.status === 'checked_in'
            ? 'arrived'
            : 'registered';
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    gender: c.gender,
    dateOfBirth: c.dateOfBirth ?? null,
    grade: c.grade ?? null,
    school: c.school ?? null,
    kind: toPersonKind(c.kind),
    churchId: c.churchId,
    churchName: c.churchName,
    zone: c.zone,
    groupId: c.groupId ?? null,
    mobile: c.mobile ?? null,
    email: c.email ?? null,
    suburb: c.suburb ?? null,
    postcode: c.postcode ?? null,
    state: c.state ?? null,
    medicalConditions: c.medicalConditions,
    dietaryRequirements: c.dietaryRequirements,
    otherMedications: c.otherMedications ?? null,
    parentGuardianName: c.parentGuardianName ?? null,
    parentPhone: c.parentPhone ?? null,
    parentRelation: c.parentRelation ?? null,
    blueCardNumber: c.blueCardNumber ?? null,
    blueCardExpiry: c.blueCardExpiry ?? null,
    consents: c.consents,
    paymentStatus: 'unpaid',
    accommodationKind: null,
    accommodationLabel: null,
    lifecycle,
    atCamp: c.atCamp,
    checkInHistory: c.checkInHistory,
    signOutHistory: c.signOutHistory,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}
