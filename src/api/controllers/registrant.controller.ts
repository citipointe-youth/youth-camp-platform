import type { HttpRequest } from '../http/types';
import type { RegistrantService } from '../../services/registrant.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface RegistrantControllerServices {
  registrant: RegistrantService;
}

export function makeRegistrantController(services: RegistrantControllerServices) {
  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.query['churchId'];
      return services.registrant.list(req.ctx.actor, churchId);
    },

    async get(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.registrant.get(req.ctx.actor, id);
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.registrant.create(req.ctx.actor, req.body);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.registrant.update(req.ctx.actor, id, req.body);
    },

    async remove(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.registrant.remove(req.ctx.actor, id);
      return { ok: true };
    },

    async chase(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.registrant.chase(req.ctx.actor);
    },

    async breakdown(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.registrant.breakdown(req.ctx.actor);
    },

    async remind(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const body = req.body as { ids?: string[] };
      return services.registrant.remind(req.ctx.actor, body.ids ?? []);
    },
  };
}
