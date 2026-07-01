import type { IPersonRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import { isCamper, isRegistrant } from '../core/entities/person';
import type { CheckInEntry, SignOutEvent } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { assertCan, canAccessChurch } from './access-control';
import { NotFoundError, BadRequestError } from '../core/errors/app-error';
import { ageFromDob, nowISO } from '../utils/date';
import { newId } from '../utils/id';
import { withCheckIn, withSignEvent } from './person-lifecycle';

/**
 * PersonService — the unified registrant + camper service (design D2), operating
 * over the single `people` store. It exposes a pre-camp ("registrant") view and an
 * at-camp ("camper") view, both filtered by lifecycle. The /registrants and /campers
 * routes are lifecycle-filtered DTO views over this service (Phase 1 complete).
 * RBAC reuses the canonical helpers in access-control.ts; person scoping reads
 * churchId/zone (the only fields the camper/registrant access rules use).
 */

export interface PersonProfile extends Person {
  fullName: string;
  age: number | null;
  lastSignOut: string | null;
}

export interface ChaseResult {
  churchId: string;
  churchName: string;
  registrantId: string;
  firstName: string;
  lastName: string;
  reason: 'unpaid' | 'no_blue_card' | 'both';
}

export interface RegistrantBreakdown {
  churchId: string;
  churchName: string;
  zone: string;
  total: number;
  campers: number;
  leaders: number;
  unpaid: number;
  depositPaid: number;
  paid: number;
  noBlueCard: number;
}

export interface PersonService {
  /** All people the actor may see (any lifecycle), role-scoped. */
  list(actor: Actor, opts?: { zone?: string; churchId?: string; q?: string }): Promise<Person[]>;
  /** Pre-camp view: lifecycle === 'registered'. */
  listRegistrants(actor: Actor, churchId?: string): Promise<Person[]>;
  /** At-camp view: lifecycle ∈ {arrived, checked_out, departed}. */
  listCampers(actor: Actor, opts?: { zone?: string; churchId?: string; q?: string }): Promise<Person[]>;
  get(actor: Actor, id: string): Promise<Person>;
  getProfile(actor: Actor, id: string): Promise<PersonProfile>;
  buildProfile(person: Person): PersonProfile;

  // ----- Step 4 write surface (dormant until the live switchover wires routes) -----
  /** Create a pre-camp registrant (lifecycle 'registered'). */
  create(actor: Actor, input: { firstName: string; lastName: string; gender: Person['gender']; kind?: Person['kind']; grade?: Person['grade'] | null; churchId: string; churchName: string; zone: string; paymentStatus?: Person['paymentStatus']; accommodationKind?: Person['accommodationKind']; accommodationLabel?: string | null; parentGuardianName?: string | null; parentPhone?: string | null; mobile?: string | null; medicalConditions?: string[]; dietaryRequirements?: string[] }): Promise<Person>;
  update(actor: Actor, id: string, patch: Partial<Person>): Promise<Person>;
  remove(actor: Actor, id: string): Promise<void>;
  /** Apply a check-in entry — first 'in' promotes registered → arrived (Day-1 sign-in). */
  checkIn(actor: Actor, personId: string, entry: Omit<CheckInEntry, 'id'>): Promise<Person>;
  /** Apply a sign-out/sign-in attendance event. */
  signEvent(actor: Actor, personId: string, event: Omit<SignOutEvent, 'id'>): Promise<Person>;
  /** Find unpaid / no-blue-card leaders for chasing, scoped by actor role. */
  chase(actor: Actor): Promise<ChaseResult[]>;
  /** Per-church registrant counts (total, payment, blue card), scoped by actor role. */
  breakdown(actor: Actor): Promise<RegistrantBreakdown[]>;
  /** Log a reminder send for the given registrant IDs (scoped, skips cancelled). */
  remind(actor: Actor, ids: string[]): Promise<{ sent: number }>;
  /** All at-camp persons with at least one medical flag, scoped by actor role. */
  listMedicalWatch(actor: Actor): Promise<Person[]>;
}

/** True if the actor may access a person, by role + church/zone (mirrors canAccessCamper). */
export function canAccessPerson(actor: Actor, person: Pick<Person, 'churchId' | 'zone'>): boolean {
  switch (actor.role) {
    case 'admin':
    case 'director':
    case 'firstAid':
      return true;
    case 'zoneLeader':
      return actor.zone != null && person.zone === actor.zone;
    case 'church':
      return actor.churchId === person.churchId;
    default:
      return false;
  }
}

export function makePersonService(repo: IPersonRepository): PersonService {
  function buildProfile(person: Person): PersonProfile {
    const lastSignOut =
      person.signOutHistory
        .filter((e) => e.type === 'out')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp ?? null;
    return {
      ...person,
      fullName: `${person.firstName} ${person.lastName}`,
      age: person.dateOfBirth ? ageFromDob(person.dateOfBirth) : null,
      lastSignOut,
    };
  }

  async function scopedAll(
    actor: Actor,
    opts: { zone?: string; churchId?: string; q?: string },
  ): Promise<Person[]> {
    let results: Person[];
    if (opts.q) {
      results = await repo.search(opts.q);
    } else if (opts.zone) {
      results = await repo.findByZone(opts.zone);
    } else if (opts.churchId) {
      results = await repo.findByChurch(opts.churchId);
    } else {
      results = await repo.findAll();
    }
    return results.filter((p) => canAccessPerson(actor, p));
  }

  async function getOwned(actor: Actor, id: string): Promise<Person> {
    const p = await repo.findById(id);
    if (!p) throw new NotFoundError('Person not found');
    if (!canAccessPerson(actor, p)) throw new NotFoundError('Person not found');
    return p;
  }

  return {
    buildProfile,

    async list(actor, opts = {}) {
      assertCan(actor, 'camper:read');
      return scopedAll(actor, opts);
    },

    async listRegistrants(actor, churchId) {
      assertCan(actor, 'registrant:read');
      // Preserve the legacy churchId fast-path access check (registrant.service.list).
      if (churchId) {
        const items = await repo.findByChurch(churchId);
        const zone = items[0]?.zone;
        // canAccessChurch matches the old registrant behaviour incl. the empty-church
        // edge (zone undefined -> zoneLeader denied).
        if (!canAccessChurch(actor, churchId, zone)) {
          return [];
        }
        return items.filter(isRegistrant);
      }
      const all = await scopedAll(actor, {});
      return all.filter(isRegistrant);
    },

    async listCampers(actor, opts = {}) {
      assertCan(actor, 'camper:read');
      const all = await scopedAll(actor, opts);
      return all.filter(isCamper);
    },

    async get(actor, id) {
      assertCan(actor, 'camper:read');
      return getOwned(actor, id);
    },

    async getProfile(actor, id) {
      assertCan(actor, 'camper:read');
      const p = await getOwned(actor, id);
      return buildProfile(p);
    },

    // ----- Step 4 write surface (dormant; wired to routes during the switchover) ---

    async create(actor, input) {
      assertCan(actor, 'registrant:write');
      if (!canAccessPerson(actor, { churchId: input.churchId, zone: input.zone })) {
        throw new BadRequestError('Cannot create a person outside your scope');
      }
      const now = nowISO();
      const person: Person = {
        id: newId('person'),
        firstName: input.firstName,
        lastName: input.lastName,
        gender: input.gender,
        dateOfBirth: null,
        grade: input.grade ?? null,
        school: null,
        kind: input.kind ?? 'youth',
        churchId: input.churchId,
        churchName: input.churchName,
        zone: input.zone,
        groupId: null,
        mobile: input.mobile ?? null,
        email: null,
        suburb: null,
        postcode: null,
        state: null,
        medicalConditions: input.medicalConditions ?? [],
        dietaryRequirements: input.dietaryRequirements ?? [],
        otherMedications: null,
        medicareNumber: null,
        churchUnlistedNote: null,
        elvantoMeta: null,
        parentGuardianName: input.parentGuardianName ?? null,
        parentPhone: input.parentPhone ?? null,
        parentRelation: null,
        blueCardNumber: null,
        blueCardExpiry: null,
        consents: {
          medical: { granted: false, timestamp: null },
          media: { granted: false, timestamp: null },
          supervision: { granted: false, timestamp: null },
        },
        paymentStatus: input.paymentStatus ?? 'unpaid',
        accommodationKind: input.accommodationKind ?? null,
        accommodationLabel: input.accommodationLabel ?? null,
        lifecycle: 'registered',
        atCamp: false,
        checkInHistory: [],
        signOutHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      return repo.save(person);
    },

    async update(actor, id, patch) {
      assertCan(actor, 'registrant:write');
      const existing = await getOwned(actor, id);
      // History, atCamp, and createdAt are never patchable; lifecycle is restricted to
      // registered ↔ cancelled (camp-state transitions go via checkIn/signEvent).
      const { id: _i, atCamp: _a, checkInHistory: _ch, signOutHistory: _sh, createdAt: _c, lifecycle, ...safeRest } = patch;
      const nextLifecycle =
        lifecycle === 'cancelled' || lifecycle === 'registered' ? lifecycle : existing.lifecycle;
      const updated: Person = { ...existing, ...safeRest, id: existing.id, lifecycle: nextLifecycle, updatedAt: nowISO() };
      return repo.save(updated);
    },

    async remove(actor, id) {
      assertCan(actor, 'registrant:write');
      await getOwned(actor, id);
      await repo.delete(id);
    },

    async checkIn(actor, personId, entry) {
      assertCan(actor, 'checkin:write');
      const person = await getOwned(actor, personId);
      if (person.lifecycle === 'cancelled') {
        throw new BadRequestError('Cannot check in a cancelled person');
      }
      if (!person.atCamp) {
        throw new BadRequestError('Cannot check in a person who is not currently at camp');
      }
      const full: CheckInEntry = { ...entry, id: newId('ci') };
      return repo.save(withCheckIn(person, full, nowISO()));
    },

    async signEvent(actor, personId, event) {
      assertCan(actor, 'attendance:write');
      const person = await getOwned(actor, personId);
      const full: SignOutEvent = { ...event, id: newId('so') };
      return repo.save(withSignEvent(person, full, nowISO()));
    },

    async chase(actor) {
      assertCan(actor, 'reminder:send');
      const all = await repo.findAll();
      const results: ChaseResult[] = [];
      for (const p of all) {
        if (!isRegistrant(p)) continue;
        if (!canAccessPerson(actor, p)) continue;
        const unpaid = p.paymentStatus === 'unpaid';
        const noBlue = p.kind === 'leader' && p.blueCardNumber == null;
        if (unpaid || noBlue) {
          results.push({
            churchId: p.churchId,
            churchName: p.churchName,
            registrantId: p.id,
            firstName: p.firstName,
            lastName: p.lastName,
            reason: unpaid && noBlue ? 'both' : unpaid ? 'unpaid' : 'no_blue_card',
          });
        }
      }
      return results;
    },

    async breakdown(actor) {
      assertCan(actor, 'registrant:read');
      const all = await repo.findAll();
      const map = new Map<string, RegistrantBreakdown>();
      for (const p of all) {
        if (!isRegistrant(p)) continue;
        if (!canAccessPerson(actor, p)) continue;
        let entry = map.get(p.churchId);
        if (!entry) {
          entry = {
            churchId: p.churchId,
            churchName: p.churchName,
            zone: p.zone,
            total: 0,
            campers: 0,
            leaders: 0,
            unpaid: 0,
            depositPaid: 0,
            paid: 0,
            noBlueCard: 0,
          };
          map.set(p.churchId, entry);
        }
        entry.total++;
        if (p.kind === 'youth') entry.campers++;
        if (p.kind === 'leader') entry.leaders++;
        if (p.paymentStatus === 'unpaid') entry.unpaid++;
        if (p.paymentStatus === 'deposit') entry.depositPaid++;
        if (p.paymentStatus === 'paid') entry.paid++;
        if (p.kind === 'leader' && p.blueCardNumber == null) entry.noBlueCard++;
      }
      return Array.from(map.values()).sort((a, b) => a.zone.localeCompare(b.zone));
    },

    async remind(actor, ids) {
      assertCan(actor, 'reminder:send');
      if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestError('No IDs provided');
      let count = 0;
      for (const id of ids) {
        const p = await repo.findById(id);
        if (!p || !isRegistrant(p)) continue;
        if (!canAccessPerson(actor, p)) continue;
        count++;
      }
      return { sent: count };
    },

    async listMedicalWatch(actor) {
      assertCan(actor, 'camper:read');
      const all = await repo.findAll();
      return all.filter((p) => {
        if (!isCamper(p) || !p.atCamp) return false;
        if (!canAccessPerson(actor, p)) return false;
        return p.medicalConditions.length > 0 || p.otherMedications != null;
      });
    },
  };
}
