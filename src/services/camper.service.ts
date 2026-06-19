import type { ICamperRepository } from '../repositories/interfaces/entity-repositories';
import type { Camper } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import type { ConsentType } from '../core/types/enums';
import { CONSENT_TYPES } from '../core/types/enums';
import { assertCan, assertCanAccessCamper, canAccessCamper } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { CreateCamperSchema, UpdateCamperSchema } from '../core/validation/camper.schema';
import { newId } from '../utils/id';
import { nowISO, ageFromDob } from '../utils/date';

export interface CamperProfile extends Camper {
  fullName: string;
  age: number | null;
  lastSignOut: string | null;
}

export interface CamperService {
  list(actor: Actor, opts?: { zone?: string; churchId?: string; q?: string }): Promise<Camper[]>;
  get(actor: Actor, id: string): Promise<CamperProfile>;
  create(actor: Actor, input: unknown): Promise<Camper>;
  update(actor: Actor, id: string, input: unknown): Promise<Camper>;
  remove(actor: Actor, id: string): Promise<void>;
  buildProfile(camper: Camper): CamperProfile;
}

function defaultConsents(): Camper['consents'] {
  const result = {} as Record<ConsentType, { granted: boolean; timestamp: string | null }>;
  for (const t of CONSENT_TYPES) {
    result[t] = { granted: false, timestamp: null };
  }
  return result;
}

export function makeCamperService(repo: ICamperRepository): CamperService {
  function buildProfile(camper: Camper): CamperProfile {
    const lastSignOut = camper.signOutHistory.filter((e) => e.type === 'out').sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp ?? null;
    return {
      ...camper,
      fullName: `${camper.firstName} ${camper.lastName}`,
      age: camper.dateOfBirth ? ageFromDob(camper.dateOfBirth) : null,
      lastSignOut,
    };
  }

  async function getOwned(actor: Actor, id: string): Promise<Camper> {
    const c = await repo.findById(id);
    if (!c) throw new NotFoundError('Camper not found');
    assertCanAccessCamper(actor, c);
    return c;
  }

  return {
    buildProfile,

    async list(actor, opts = {}) {
      assertCan(actor, 'camper:read');
      let results: Camper[];
      if (opts.q) {
        results = await repo.search(opts.q);
      } else if (opts.zone) {
        results = await repo.findByZone(opts.zone);
      } else if (opts.churchId) {
        results = await repo.findByChurch(opts.churchId);
      } else {
        results = await repo.findAll();
      }
      return results.filter((c) => canAccessCamper(actor, c));
    },

    async get(actor, id) {
      assertCan(actor, 'camper:read');
      const c = await getOwned(actor, id);
      return buildProfile(c);
    },

    async create(actor, input) {
      assertCan(actor, 'camper:write');
      const data = CreateCamperSchema.parse(input);
      const now = nowISO();
      const camper: Camper = {
        id: newId('camper'),
        firstName: data.firstName,
        lastName: data.lastName,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ?? null,
        grade: data.grade ?? null,
        school: data.school ?? null,
        zone: data.zone,
        groupId: data.groupId ?? null,
        kind: data.kind,
        mobile: data.mobile ?? null,
        email: data.email ?? null,
        suburb: data.suburb ?? null,
        postcode: data.postcode ?? null,
        state: data.state ?? null,
        medicalConditions: data.medicalConditions ?? [],
        dietaryRequirements: data.dietaryRequirements ?? [],
        otherMedications: data.otherMedications ?? null,
        consents: (data.consents as Camper['consents']) ?? defaultConsents(),
        parentGuardianName: data.parentGuardianName ?? null,
        parentPhone: data.parentPhone ?? null,
        parentRelation: data.parentRelation ?? null,
        blueCardNumber: data.blueCardNumber ?? null,
        blueCardExpiry: data.blueCardExpiry ?? null,
        churchId: data.churchId,
        churchName: data.churchName,
        atCamp: false,
        status: data.status ?? 'registered',
        checkInHistory: [],
        signOutHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      return repo.save(camper);
    },

    async update(actor, id, input) {
      assertCan(actor, 'camper:write');
      const existing = await getOwned(actor, id);
      const data = UpdateCamperSchema.parse(input);
      const { consents, ...rest } = data;
      const updated: Camper = {
        ...existing,
        ...rest,
        // consents is a partial patch — merge onto the existing complete record
        consents: consents
          ? ({ ...existing.consents, ...consents } as Camper['consents'])
          : existing.consents,
        id: existing.id,
        updatedAt: nowISO(),
      };
      return repo.save(updated);
    },

    async remove(actor, id) {
      assertCan(actor, 'camper:write');
      await getOwned(actor, id);
      await repo.delete(id);
    },
  };
}
