import type { HttpRequest } from '../http/types';
import type { NotificationService } from '../../services/notification.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface NotificationControllerServices {
  notification: NotificationService;
}

export function makeNotificationController(services: NotificationControllerServices) {
  return {
    async feed(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.feed(req.ctx.actor);
    },

    async latest(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.latest(req.ctx.actor);
    },

    async send(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.notification.send(req.ctx.actor, req.body);
    },

    async remove(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing notification id');
      return services.notification.remove(req.ctx.actor, id);
    },
  };
}
