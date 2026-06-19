import type { IAccommodationRepository, IChurchRepository, ISettingsRepository, IPersonRepository } from '../repositories/interfaces/entity-repositories';
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { AccommodationReservation } from '../core/entities/church';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessChurch } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { CreateBlockSchema, UpdateBlockSchema, SetReservationsSchema } from '../core/validation/accommodation.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { computeLiveTaken as computeLiveTakenPure, availableForBlock } from './accommodation-occupancy';

export interface LiveBlock extends AccommodationBlock {
  liveTaken: number;
  available: number;
}

export interface AccommodationService {
  listBlocks(actor: Actor): Promise<LiveBlock[]>;
  getBlock(actor: Actor, id: string): Promise<LiveBlock>;
  createBlock(actor: Actor, input: unknown): Promise<AccommodationBlock>;
  updateBlock(actor: Actor, id: string, input: unknown): Promise<AccommodationBlock>;
  deleteBlock(actor: Actor, id: string): Promise<void>;
  setReservations(actor: Actor, input: unknown): Promise<AccommodationReservation[]>;
  listHeldByChurch(actor: Actor, churchId: string): Promise<AccommodationReservation[]>;
  computeLiveTaken(blocks: AccommodationBlock[], persons: Person[]): Map<string, number>;
}

export function makeAccommodationService(
  blockRepo: IAccommodationRepository,
  churchRepo: IChurchRepository,
  settingsRepo: ISettingsRepository,
  personRepo: IPersonRepository,
): AccommodationService {
  async function assertNotLocked(actor: Actor): Promise<void> {
    if (actor.role === 'admin') return;
    const settings = await settingsRepo.getSingleton();
    if (settings?.accommodationLocked) {
      throw new ForbiddenError('Accommodation is locked. Contact admin to make changes.');
    }
  }

  // Thin wrapper over the pure occupancy module (single source of truth, see
  // accommodation-occupancy.ts). Kept on the interface for callers/tests.
  function computeLiveTaken(blocks: AccommodationBlock[], persons: Person[]): Map<string, number> {
    return computeLiveTakenPure(blocks, persons);
  }

  // B1 FIX: live blocks now subtract assigned occupants (was baseTaken only).
  async function getLiveBlocks(): Promise<LiveBlock[]> {
    const [blocks, persons] = await Promise.all([blockRepo.findAll(), personRepo.findAll()]);
    const taken = computeLiveTakenPure(blocks, persons);
    return blocks.map((b) => {
      const liveTaken = taken.get(b.id) ?? b.baseTaken;
      return { ...b, liveTaken, available: availableForBlock(b, liveTaken) };
    });
  }

  return {
    computeLiveTaken,

    async listBlocks(actor) {
      assertCan(actor, 'registrant:read');
      return getLiveBlocks();
    },

    async getBlock(actor, id) {
      assertCan(actor, 'registrant:read');
      const block = await blockRepo.findById(id);
      if (!block) throw new NotFoundError('Accommodation block not found');
      const persons = await personRepo.findAll();
      const liveTaken = computeLiveTakenPure([block], persons).get(block.id) ?? block.baseTaken;
      return { ...block, liveTaken, available: availableForBlock(block, liveTaken) };
    },

    async createBlock(actor, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const data = CreateBlockSchema.parse(input);
      const now = nowISO();
      const block: AccommodationBlock = {
        id: newId('block'),
        ...data,
        baseTaken: data.baseTaken ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      return blockRepo.save(block);
    },

    async updateBlock(actor, id, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const existing = await blockRepo.findById(id);
      if (!existing) throw new NotFoundError('Accommodation block not found');
      const data = UpdateBlockSchema.parse(input);
      return blockRepo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async deleteBlock(actor, id) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const ok = await blockRepo.delete(id);
      if (!ok) throw new NotFoundError('Accommodation block not found');
    },

    async setReservations(actor, input) {
      const { churchId, reservations } = SetReservationsSchema.parse(input);
      await assertNotLocked(actor);
      // church can only set for own church
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      const updated = { ...church, reservations, updatedAt: nowISO() };
      await churchRepo.save(updated);
      return reservations;
    },

    async listHeldByChurch(actor, churchId) {
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      return church.reservations ?? [];
    },
  };
}
