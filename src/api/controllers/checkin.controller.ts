import type { HttpRequest } from '../http/types';
import type { CheckInService } from '../../services/checkin.service';
import type { PersonService } from '../../services/person.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';
import { nowISO } from '../../utils/date';

export interface CheckInControllerServices {
  checkIn: CheckInService;
  person: PersonService;
}

export function makeCheckInController(services: CheckInControllerServices) {
  return {
    async sessions(_req: HttpRequest) {
      return services.checkIn.getSessions();
    },

    async currentSession(_req: HttpRequest) {
      return services.checkIn.getCurrentSession();
    },

    async status(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const sessionId = req.params['sessionId'];
      if (!sessionId) throw new BadRequestError('Missing sessionId');
      return services.checkIn.getSessionStatus(req.ctx.actor, sessionId);
    },

    async checkIn(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const b = req.body as { camperId?: string; sessionId?: string; type?: 'in' | 'out' };
      if (!b.camperId) throw new BadRequestError('Missing camperId');
      if (!b.sessionId) throw new BadRequestError('Missing sessionId');
      if (!b.type) throw new BadRequestError('Missing type');

      // Look up session label from the schedule so the check-in history is readable.
      const sessions = await services.checkIn.getSessions();
      const session = sessions.find((s) => s.id === b.sessionId);
      const sessionLabel = session?.label ?? b.sessionId;

      await services.person.checkIn(req.ctx.actor, b.camperId, {
        sessionId: b.sessionId,
        sessionLabel,
        type: b.type,
        leaderId: req.ctx.actor.id,
        timestamp: nowISO(),
      });
      return { ok: true };
    },
  };
}
