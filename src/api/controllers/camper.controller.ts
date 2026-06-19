import type { HttpRequest } from '../http/types';
import type { CamperService } from '../../services/camper.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface CamperControllerServices {
  camper: CamperService;
}

export function makeCamperController(services: CamperControllerServices) {
  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.camper.list(req.ctx.actor, {
        zone: req.query['zone'],
        churchId: req.query['churchId'],
        q: req.query['q'],
      });
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.camper.get(req.ctx.actor, id);
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.camper.create(req.ctx.actor, req.body);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.camper.update(req.ctx.actor, id, req.body);
    },
  };
}
