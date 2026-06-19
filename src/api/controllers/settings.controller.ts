import type { HttpRequest } from '../http/types';
import type { SettingsService } from '../../services/settings.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface SettingsControllerServices {
  settings: SettingsService;
}

export function makeSettingsController(services: SettingsControllerServices) {
  return {
    async get(_req: HttpRequest) {
      return services.settings.get();
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.settings.update(req.ctx.actor, req.body);
    },
  };
}
