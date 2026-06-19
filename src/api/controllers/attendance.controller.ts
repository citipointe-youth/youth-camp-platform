import type { HttpRequest } from '../http/types';
import type { PersonService } from '../../services/person.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';
import { nowISO } from '../../utils/date';

export interface AttendanceControllerServices {
  person: PersonService;
}

export function makeAttendanceController(services: AttendanceControllerServices) {
  const { person } = services;

  return {
    async signOut(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as { camperId?: string; reason?: string; parentsMet?: boolean; leaderName?: string };
      if (!b.camperId) throw new BadRequestError('Missing camperId');
      await person.signEvent(req.ctx.actor, b.camperId, {
        type: 'out',
        leaderName: b.leaderName ?? req.ctx.actor.displayName ?? 'Staff',
        reason: b.reason,
        parentsMet: b.parentsMet,
        authorId: req.ctx.actor.id,
        timestamp: nowISO(),
      });
      return { ok: true };
    },

    async signIn(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as { camperId?: string; leaderName?: string };
      if (!b.camperId) throw new BadRequestError('Missing camperId');
      await person.signEvent(req.ctx.actor, b.camperId, {
        type: 'in',
        leaderName: b.leaderName ?? req.ctx.actor.displayName ?? 'Staff',
        authorId: req.ctx.actor.id,
        timestamp: nowISO(),
      });
      return { ok: true };
    },
  };
}
