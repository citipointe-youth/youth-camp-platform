import type { HttpRequest } from '../http/types';
import type { ScheduleService } from '../../services/schedule.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface ScheduleControllerServices {
  schedule: ScheduleService;
}

export function makeScheduleController(services: ScheduleControllerServices) {
  return {
    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const day = req.query['day'];
      if (day) return services.schedule.getByDay(req.ctx.actor, day);
      return services.schedule.getAll(req.ctx.actor);
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.schedule.create(req.ctx.actor, req.body);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.schedule.update(req.ctx.actor, id, req.body);
    },

    async remove(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.schedule.remove(req.ctx.actor, id);
      return { ok: true };
    },
  };
}
