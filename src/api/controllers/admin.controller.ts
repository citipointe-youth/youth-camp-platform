import type { HttpRequest } from '../http/types';
import type { AdminService } from '../../services/admin.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';
import { SetModeSchema } from '../../core/validation/content.schema';

export interface AdminControllerServices {
  admin: AdminService;
}

export function makeAdminController(services: AdminControllerServices) {
  return {
    async reset(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.admin.reset(req.ctx.actor);
    },

    async saveDefaults(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.admin.saveDefaults(req.ctx.actor);
    },

    async newYear(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const body = req.body as { year?: number };
      if (!body.year) throw new BadRequestError('Missing year');
      return services.admin.newYear(req.ctx.actor, body.year);
    },

    async clearNotifications(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.admin.clearNotifications(req.ctx.actor);
    },

    async setMode(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const { campMode } = SetModeSchema.parse(req.body);
      return services.admin.setMode(req.ctx.actor, campMode);
    },
  };
}
