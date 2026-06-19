import type { IUserRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { User, SafeUser } from '../core/entities/user';
import type { Church } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { NotFoundError, BadRequestError, ForbiddenError } from '../core/errors/app-error';
import {
  CreateUserSchema,
  UpdateUserSchema,
  SetPasswordSchema,
  CreateChurchWithAccountSchema,
  UpdateChurchSchema,
} from '../core/validation/account.schema';
import { hashPassword } from '../utils/crypto';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { toSafeUser } from './auth.service';

export interface AccountService {
  listUsers(actor: Actor): Promise<SafeUser[]>;
  createUser(actor: Actor, input: unknown): Promise<SafeUser>;
  updateUser(actor: Actor, id: string, input: unknown): Promise<SafeUser>;
  setPassword(actor: Actor, input: unknown): Promise<void>;
  /** Flip an account between active/inactive (CMS parity). The admin can't be deactivated. */
  toggleStatus(actor: Actor, id: string): Promise<SafeUser>;
  createChurchWithAccount(actor: Actor, input: unknown): Promise<{ church: Church; user: SafeUser }>;
  listChurches(actor: Actor): Promise<Church[]>;
  updateChurch(actor: Actor, id: string, input: unknown): Promise<Church>;
  deleteUser(actor: Actor, id: string): Promise<{ deleted: string }>;
  deleteChurch(actor: Actor, id: string): Promise<{ deleted: string }>;
}

export function makeAccountService(
  userRepo: IUserRepository,
  churchRepo: IChurchRepository,
): AccountService {
  return {
    async listUsers(actor) {
      assertCan(actor, 'admin:manage');
      const users = await userRepo.findAll();
      return users.map(toSafeUser);
    },

    async createUser(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = CreateUserSchema.parse(input);
      // Never allow creating another admin through this method (only seeding)
      if (data.role === 'admin') {
        throw new ForbiddenError('Cannot create admin accounts via API');
      }
      const existing = await userRepo.findByUsername(data.username);
      if (existing) throw new BadRequestError('Username already in use');
      const passwordHash = await hashPassword(data.password);
      const now = nowISO();
      const user: User = {
        id: newId('user'),
        firstName: data.firstName,
        lastName: data.lastName,
        username: data.username.toLowerCase(),
        mobile: data.mobile,
        role: data.role,
        churchId: data.churchId ?? null,
        churchName: data.churchName ?? null,
        zone: data.zone ?? null,
        status: data.status ?? 'active',
        passwordHash,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await userRepo.save(user);
      return toSafeUser(saved);
    },

    async updateUser(actor, id, input) {
      assertCan(actor, 'admin:manage');
      const existing = await userRepo.findById(id);
      if (!existing) throw new NotFoundError('User not found');
      const data = UpdateUserSchema.parse(input);
      if (data.role === 'admin') {
        throw new ForbiddenError('Cannot promote to admin via API');
      }
      // Enforce username uniqueness when it changes.
      if (data.username && data.username.toLowerCase() !== existing.username.toLowerCase()) {
        const clash = await userRepo.findByUsername(data.username);
        if (clash && clash.id !== existing.id) throw new BadRequestError('Username already in use');
      }
      const updated: User = {
        ...existing,
        ...data,
        id: existing.id,
        username: data.username ? data.username.toLowerCase() : existing.username,
        updatedAt: nowISO(),
      };
      const saved = await userRepo.save(updated);
      return toSafeUser(saved);
    },

    async setPassword(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = SetPasswordSchema.parse(input);
      const user = await userRepo.findById(data.userId);
      if (!user) throw new NotFoundError('User not found');
      const passwordHash = await hashPassword(data.password);
      await userRepo.save({ ...user, passwordHash, updatedAt: nowISO() });
    },

    async toggleStatus(actor, id) {
      assertCan(actor, 'admin:manage');
      const user = await userRepo.findById(id);
      if (!user) throw new NotFoundError('User not found');
      if (user.role === 'admin') throw new ForbiddenError('Cannot deactivate the admin account');
      const next = user.status === 'active' ? 'inactive' : 'active';
      const saved = await userRepo.save({ ...user, status: next, updatedAt: nowISO() });
      return toSafeUser(saved);
    },

    async createChurchWithAccount(actor, input) {
      assertCan(actor, 'admin:manage');
      const data = CreateChurchWithAccountSchema.parse(input);

      const existingByCode = await churchRepo.findByCode(data.code);
      if (existingByCode) throw new BadRequestError('Church code already in use');

      const existingBySlug = await churchRepo.findBySlug(data.selfRegisterSlug);
      if (existingBySlug) throw new BadRequestError('Self-register slug already in use');

      const existingUser = await userRepo.findByUsername(data.accountUsername);
      if (existingUser) throw new BadRequestError('Username already in use');

      const now = nowISO();
      const churchId = newId('church');

      const church: Church = {
        id: churchId,
        name: data.churchName,
        zone: data.zone,
        code: data.code,
        selfRegisterSlug: data.selfRegisterSlug,
        expectedCount: data.expectedCount ?? 0,
        youthPastorName: data.youthPastorName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        reservations: [],
        contacts: {
          male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
          female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
        },
        createdAt: now,
        updatedAt: now,
      };
      await churchRepo.save(church);

      const passwordHash = await hashPassword(data.accountPassword);
      const user: User = {
        id: newId('user'),
        firstName: data.accountFirstName,
        lastName: data.accountLastName,
        username: data.accountUsername.toLowerCase(),
        role: data.accountRole ?? 'church',
        churchId,
        churchName: data.churchName,
        zone: data.zone,
        status: 'active',
        passwordHash,
        createdAt: now,
        updatedAt: now,
      };
      const savedUser = await userRepo.save(user);

      return { church, user: toSafeUser(savedUser) };
    },

    async listChurches(actor) {
      const churches = await churchRepo.findAll();
      if (actor.role === 'admin' || actor.role === 'director') return churches;
      if (actor.role === 'zoneLeader') {
        return churches.filter((c) => actor.zone && c.zone === actor.zone);
      }
      return churches.filter((c) => c.id === actor.churchId);
    },

    async updateChurch(actor, id, input) {
      assertCan(actor, 'admin:manage');
      const existing = await churchRepo.findById(id);
      if (!existing) throw new NotFoundError('Church not found');
      const data = UpdateChurchSchema.parse(input);
      const updated: Church = { ...existing, ...data, id: existing.id, updatedAt: nowISO() };
      return churchRepo.save(updated);
    },

    async deleteUser(actor, id) {
      assertCan(actor, 'admin:manage');
      const user = await userRepo.findById(id);
      if (!user) throw new NotFoundError('Account not found');
      if (user.role === 'admin') throw new ForbiddenError('Cannot delete the admin account');
      await userRepo.delete(id);
      return { deleted: id };
    },

    async deleteChurch(actor, id) {
      assertCan(actor, 'admin:manage');
      const church = await churchRepo.findById(id);
      if (!church) throw new NotFoundError('Church not found');
      // Also remove the church's shared account
      const users = await userRepo.findAll();
      for (const u of users.filter((u) => u.churchId === id)) {
        await userRepo.delete(u.id);
      }
      await churchRepo.delete(id);
      return { deleted: id };
    },
  };
}
