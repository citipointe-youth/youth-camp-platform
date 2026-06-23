import type { Person } from '../core/entities/person';
import type { CheckInEntry, SignOutEvent } from '../core/entities/person';
import type { PersonLifecycle } from '../core/types/enums';

/**
 * Pure lifecycle transitions for the unified Person (design D2).
 *
 * The defining rule: a person is a pre-camp *registrant* until their **Day-1 first
 * check-in**, at which point they are promoted to a *camper* (`registered → arrived`).
 * Subsequent sign-out/sign-in toggle `arrived ⇄ checked_out`. These functions are pure
 * (no I/O) so the promotion semantics can be unit-tested in isolation; the check-in /
 * attendance services apply them and persist the result.
 */

/** Apply a check-in entry, returning the lifecycle/atCamp the person should move to. */
export function applyCheckIn(
  person: Pick<Person, 'lifecycle' | 'atCamp'>,
  type: 'in' | 'out',
): { lifecycle: PersonLifecycle; atCamp: boolean } {
  if (type === 'in') {
    // First sign-in promotes a registrant to a camper (registered → arrived).
    // Cancelled people are never auto-promoted by a check-in.
    if (person.lifecycle === 'cancelled') {
      return { lifecycle: 'cancelled', atCamp: person.atCamp };
    }
    return { lifecycle: 'arrived', atCamp: true };
  }
  // type === 'out': leaving a session. Only meaningful for someone at camp.
  if (person.lifecycle === 'cancelled' || person.lifecycle === 'registered') {
    return { lifecycle: person.lifecycle, atCamp: person.atCamp };
  }
  return { lifecycle: 'checked_out', atCamp: false };
}

/** Apply a sign-out event (attendance), returning the next lifecycle/atCamp. */
export function applySignOut(
  person: Pick<Person, 'lifecycle' | 'atCamp'>,
): { lifecycle: PersonLifecycle; atCamp: boolean } {
  return applyCheckIn(person, 'out');
}

/** Apply a sign-in event (attendance return), returning the next lifecycle/atCamp. */
export function applySignIn(
  person: Pick<Person, 'lifecycle' | 'atCamp'>,
): { lifecycle: PersonLifecycle; atCamp: boolean } {
  return applyCheckIn(person, 'in');
}

/** Append a check-in entry only — never mutates lifecycle or atCamp. */
export function withCheckIn(person: Person, entry: CheckInEntry, now: string): Person {
  return {
    ...person,
    checkInHistory: [...person.checkInHistory, entry],
    updatedAt: now,
  };
}

/** Append a sign-out/sign-in event and apply the resulting transition immutably. */
export function withSignEvent(person: Person, event: SignOutEvent, now: string): Person {
  const next = applyCheckIn(person, event.type === 'in' ? 'in' : 'out');
  return {
    ...person,
    signOutHistory: [...person.signOutHistory, event],
    lifecycle: next.lifecycle,
    atCamp: next.atCamp,
    updatedAt: now,
  };
}
