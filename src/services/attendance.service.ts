import type { ICamperRepository } from '../repositories/interfaces/entity-repositories';
import type { Camper, SignOutEvent } from '../core/entities/camper';
import type { Actor } from '../core/entities/user';
import { assertCan, assertCanAccessCamper } from './access-control';
import { NotFoundError } from '../core/errors/app-error';
import { SignOutInputSchema, SignInInputSchema } from '../core/validation/checkin.schema';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';

export interface AttendanceService {
  signOut(actor: Actor, input: unknown): Promise<Camper>;
  signIn(actor: Actor, input: unknown): Promise<Camper>;
}

export function makeAttendanceService(repo: ICamperRepository): AttendanceService {
  async function getCamper(actor: Actor, camperId: string): Promise<Camper> {
    const c = await repo.findById(camperId);
    if (!c) throw new NotFoundError('Camper not found');
    assertCanAccessCamper(actor, c);
    return c;
  }

  return {
    async signOut(actor, input) {
      assertCan(actor, 'checkin:write');
      const data = SignOutInputSchema.parse(input);
      const camper = await getCamper(actor, data.camperId);

      const event: SignOutEvent = {
        id: newId('so'),
        type: 'out',
        leaderName: data.leaderName ?? actor.displayName,
        reason: data.reason,
        parentsMet: data.parentsMet,
        authorId: actor.id,
        timestamp: nowISO(),
      };

      const updated: Camper = {
        ...camper,
        atCamp: false,
        status: 'checked_out',
        signOutHistory: [...camper.signOutHistory, event],
        updatedAt: nowISO(),
      };

      return repo.save(updated);
    },

    async signIn(actor, input) {
      assertCan(actor, 'checkin:write');
      const data = SignInInputSchema.parse(input);
      const camper = await getCamper(actor, data.camperId);

      const event: SignOutEvent = {
        id: newId('si'),
        type: 'in',
        leaderName: data.leaderName ?? actor.displayName,
        authorId: actor.id,
        timestamp: nowISO(),
      };

      const updated: Camper = {
        ...camper,
        atCamp: true,
        status: 'checked_in',
        signOutHistory: [...camper.signOutHistory, event],
        updatedAt: nowISO(),
      };

      return repo.save(updated);
    },
  };
}
