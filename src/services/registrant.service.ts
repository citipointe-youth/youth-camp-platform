import type { IRegistrantRepository } from '../repositories/interfaces/entity-repositories';
import type { Registrant } from '../core/entities/registrant';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessChurch } from './access-control';
import { NotFoundError, BadRequestError } from '../core/errors/app-error';
import { CreateRegistrantSchema, UpdateRegistrantSchema } from '../core/validation/registrant.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

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

export interface ChaseResult {
  churchId: string;
  churchName: string;
  registrantId: string;
  firstName: string;
  lastName: string;
  reason: 'unpaid' | 'no_blue_card' | 'both';
}

export interface RegistrantService {
  list(actor: Actor, churchId?: string): Promise<Registrant[]>;
  get(actor: Actor, id: string): Promise<Registrant>;
  create(actor: Actor, input: unknown): Promise<Registrant>;
  update(actor: Actor, id: string, input: unknown): Promise<Registrant>;
  remove(actor: Actor, id: string): Promise<void>;
  chase(actor: Actor): Promise<ChaseResult[]>;
  breakdown(actor: Actor): Promise<RegistrantBreakdown[]>;
  remind(actor: Actor, ids: string[]): Promise<{ sent: number }>;
}

export function makeRegistrantService(repo: IRegistrantRepository): RegistrantService {
  async function getOwned(actor: Actor, id: string): Promise<Registrant> {
    const r = await repo.findById(id);
    if (!r) throw new NotFoundError('Registrant not found');
    assertCanAccessChurch(actor, r.churchId, r.zone);
    return r;
  }

  return {
    async list(actor, churchId) {
      assertCan(actor, 'registrant:read');
      if (churchId) {
        // Need to know the church zone for zone-leader access
        const items = await repo.findByChurch(churchId);
        const zone = items[0]?.zone;
        assertCanAccessChurch(actor, churchId, zone);
        return items;
      }
      const all = await repo.findAll();
      return all.filter((r) => {
        switch (actor.role) {
          case 'admin':
          case 'director':
            return true;
          case 'zoneLeader':
            return actor.zone != null && r.zone === actor.zone;
          case 'church':
            return r.churchId === actor.churchId;
          default:
            return false;
        }
      });
    },

    async get(actor, id) {
      assertCan(actor, 'registrant:read');
      return getOwned(actor, id);
    },

    async create(actor, input) {
      assertCan(actor, 'registrant:write');
      const data = CreateRegistrantSchema.parse(input);
      assertCanAccessChurch(actor, data.churchId, data.zone);
      const now = nowISO();
      const registrant: Registrant = {
        id: newId('reg'),
        ...data,
        paymentStatus: data.paymentStatus ?? 'unpaid',
        blueCardCollected: data.blueCardCollected ?? false,
        status: data.status ?? 'registered',
        createdAt: now,
        updatedAt: now,
      };
      return repo.save(registrant);
    },

    async update(actor, id, input) {
      assertCan(actor, 'registrant:write');
      const existing = await getOwned(actor, id);
      const data = UpdateRegistrantSchema.parse(input);
      const updated: Registrant = {
        ...existing,
        ...data,
        id: existing.id,
        updatedAt: nowISO(),
      };
      return repo.save(updated);
    },

    async remove(actor, id) {
      assertCan(actor, 'registrant:write');
      await getOwned(actor, id);
      await repo.delete(id);
    },

    async chase(actor) {
      assertCan(actor, 'reminder:send');
      const all = await repo.findAll();
      const results: ChaseResult[] = [];
      for (const r of all) {
        if (r.status === 'cancelled') continue;
        if (actor.role === 'church') {
          if (r.churchId !== actor.churchId) continue;
        }
        if (actor.role === 'zoneLeader') {
          if (actor.zone && r.zone !== actor.zone) continue;
        }
        const unpaid = r.paymentStatus === 'unpaid';
        const noBlue = r.kind === 'leader' && !r.blueCardCollected;
        if (unpaid || noBlue) {
          results.push({
            churchId: r.churchId,
            churchName: r.churchName,
            registrantId: r.id,
            firstName: r.firstName,
            lastName: r.lastName,
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
      for (const r of all) {
        if (r.status === 'cancelled') continue;
        if (actor.role === 'church') {
          if (r.churchId !== actor.churchId) continue;
        }
        if (actor.role === 'zoneLeader') {
          if (actor.zone && r.zone !== actor.zone) continue;
        }
        let entry = map.get(r.churchId);
        if (!entry) {
          entry = {
            churchId: r.churchId,
            churchName: r.churchName,
            zone: r.zone,
            total: 0,
            campers: 0,
            leaders: 0,
            unpaid: 0,
            depositPaid: 0,
            paid: 0,
            noBlueCard: 0,
          };
          map.set(r.churchId, entry);
        }
        entry.total++;
        if (r.kind === 'camper') entry.campers++;
        if (r.kind === 'leader') entry.leaders++;
        if (r.paymentStatus === 'unpaid') entry.unpaid++;
        if (r.paymentStatus === 'deposit') entry.depositPaid++;
        if (r.paymentStatus === 'paid') entry.paid++;
        if (r.kind === 'leader' && !r.blueCardCollected) entry.noBlueCard++;
      }
      return Array.from(map.values()).sort((a, b) => a.zone.localeCompare(b.zone));
    },

    async remind(actor, ids) {
      assertCan(actor, 'reminder:send');
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new BadRequestError('No registrant IDs provided');
      }
      // NOTE: real email/SMS delivery is out of scope (see DEPLOYMENT-DESIGN Phase F).
      // This validates that each id exists, is in the actor's scope, and is an active
      // (non-cancelled) registrant, then reports how many WOULD be reminded.
      // Scoping now mirrors chase(): church → own church, zoneLeader → own zone.
      let count = 0;
      for (const id of ids) {
        const r = await repo.findById(id);
        if (!r) continue;
        if (r.status === 'cancelled') continue;
        if (actor.role === 'church' && r.churchId !== actor.churchId) continue;
        if (actor.role === 'zoneLeader' && actor.zone && r.zone !== actor.zone) continue;
        count++;
      }
      return { sent: count };
    },
  };
}
