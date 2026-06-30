import type {
  IClassroomRepository, IAllocationRepository, IChurchRepository,
  ISettingsRepository, IPersonRepository,
} from '../repositories/interfaces/entity-repositories';
import type { Classroom, RoomAllocation, AllocationGender, AllocationBracket } from '../core/entities/accommodation';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessChurch } from './access-control';
import { ForbiddenError, NotFoundError } from '../core/errors/app-error';
import { CreateClassroomSchema, UpdateClassroomSchema, SetAllocationsSchema } from '../core/validation/accommodation.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  computeGroups, validateAllocations,
  type AllocationOccupant, type AllocationGroup, type AllocationMap,
} from './accommodation-allocation';

export interface ChurchRooms {
  rooms: Array<{ name: string; gender: AllocationGender; n: number }>;
}

export interface AccommodationService {
  listClassrooms(actor: Actor): Promise<Classroom[]>;
  createClassroom(actor: Actor, input: unknown): Promise<Classroom>;
  updateClassroom(actor: Actor, id: string, input: unknown): Promise<Classroom>;
  deleteClassroom(actor: Actor, id: string): Promise<void>;
  listGroups(actor: Actor): Promise<AllocationGroup[]>;
  getAllocations(actor: Actor): Promise<AllocationMap>;
  setAllocations(actor: Actor, input: unknown): Promise<AllocationMap>;
  getChurchRooms(actor: Actor, churchId: string): Promise<ChurchRooms>;
}

export function makeAccommodationService(
  classroomRepo: IClassroomRepository,
  allocationRepo: IAllocationRepository,
  churchRepo: IChurchRepository,
  settingsRepo: ISettingsRepository,
  personRepo: IPersonRepository,
): AccommodationService {
  async function assertNotLocked(actor: Actor): Promise<void> {
    if (actor.role === 'admin') return;
    const s = await settingsRepo.getSingleton();
    if (s?.accommodationLocked) throw new ForbiddenError('Accommodation is locked. Contact admin to make changes.');
  }

  function assertDirectorOrAdmin(actor: Actor): void {
    if (actor.role !== 'admin' && actor.role !== 'director') {
      throw new ForbiddenError('Allocations are managed by directors and admins only');
    }
  }

  async function occupants(): Promise<AllocationOccupant[]> {
    const people = await personRepo.findAll();
    return people.map((p) => ({
      churchId: p.churchId ?? '',
      churchName: p.churchName,
      gender: p.gender,
      kind: p.kind,
      accommodationKind: p.accommodationKind ?? null,
      lifecycle: p.lifecycle ?? null,
      grade: p.grade ?? null,   // PC-10: needed for the >50 grade-bracket split
    }));
  }

  function rowsToMap(rows: readonly RoomAllocation[]): AllocationMap {
    const map: AllocationMap = {};
    for (const r of rows) {
      // C-1: reconstruct the original group key. PC-10 split sub-pools carry a bracket
      // and use the 3-part key (`churchId|gender|bracket`); non-split pools the 2-part key.
      const key = r.bracket ? `${r.churchId}|${r.gender}|${r.bracket}` : `${r.churchId}|${r.gender}`;
      (map[r.roomId] ??= []).push({ key, n: r.n });
    }
    return map;
  }

  return {
    async listClassrooms(actor) {
      assertCan(actor, 'registrant:read');
      return (await classroomRepo.findAll()).sort((a, b) => a.name.localeCompare(b.name));
    },

    async createClassroom(actor, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const data = CreateClassroomSchema.parse(input);
      const now = nowISO();
      return classroomRepo.save({ id: newId('room'), name: data.name, capacity: data.capacity, createdAt: now, updatedAt: now });
    },

    async updateClassroom(actor, id, input) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const existing = await classroomRepo.findById(id);
      if (!existing) throw new NotFoundError('Classroom not found');
      const data = UpdateClassroomSchema.parse(input);
      return classroomRepo.save({ ...existing, ...data, id: existing.id, updatedAt: nowISO() });
    },

    async deleteClassroom(actor, id) {
      assertCan(actor, 'admin:manage');
      await assertNotLocked(actor);
      const ok = await classroomRepo.delete(id);
      if (!ok) throw new NotFoundError('Classroom not found');
      // Cascade: drop its allocation rows (in-memory has no FK cascade).
      const rows = await allocationRepo.findByRoom(id);
      for (const r of rows) await allocationRepo.delete(r.id);
    },

    async listGroups(actor) {
      assertDirectorOrAdmin(actor);
      return computeGroups(await occupants());
    },

    async getAllocations(actor) {
      assertDirectorOrAdmin(actor);
      return rowsToMap(await allocationRepo.findAll());
    },

    async setAllocations(actor, input) {
      assertDirectorOrAdmin(actor);
      await assertNotLocked(actor);
      const { allocations } = SetAllocationsSchema.parse(input);
      const rooms = await classroomRepo.findAll();
      const groups = computeGroups(await occupants());
      validateAllocations(allocations, { rooms, groups });
      // Replace-all: clear then insert non-zero rows.
      await allocationRepo.deleteAll();
      for (const [roomId, entries] of Object.entries(allocations)) {
        for (const e of entries) {
          if (e.n <= 0) continue;
          // C-1: parse ALL key parts. A PC-10 split sub-pool sends a 3-part key
          // (`churchId|gender|bracket`); dropping the bracket here made split
          // allocations un-persistable (the reloaded 2-part key matched no live group).
          const [churchId, gender, bracket] = e.key.split('|') as [string, AllocationGender, AllocationBracket?];
          await allocationRepo.save({ id: newId('alloc'), roomId, churchId, gender, n: e.n, bracket: bracket ?? null });
        }
      }
      return rowsToMap(await allocationRepo.findAll());
    },

    async getChurchRooms(actor, churchId) {
      const church = await churchRepo.findById(churchId);
      if (!church) throw new NotFoundError('Church not found');
      assertCanAccessChurch(actor, churchId, church.zone);
      const rows = await allocationRepo.findAll();
      const rooms = await classroomRepo.findAll();
      const nameById = new Map(rooms.map((r) => [r.id, r.name]));
      return {
        rooms: rows
          .filter((r) => r.churchId === churchId && r.n > 0)
          .map((r) => ({ name: nameById.get(r.roomId) ?? 'Room', gender: r.gender, n: r.n })),
      };
    },
  };
}
