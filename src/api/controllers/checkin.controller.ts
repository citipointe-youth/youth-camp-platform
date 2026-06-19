import type { HttpRequest } from '../http/types';
import type { CheckInService } from '../../services/checkin.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface CheckInControllerServices {
  checkIn: CheckInService;
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
      return services.checkIn.checkIn(req.ctx.actor, req.body);
    },
  };
}
