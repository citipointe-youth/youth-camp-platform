import type { HttpRequest } from '../http/types';
import type { DashboardService } from '../../services/dashboard.service';
import type { SettingsService } from '../../services/settings.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface DashboardControllerServices {
  dashboard: DashboardService;
  settings: SettingsService;
}

export function makeDashboardController(services: DashboardControllerServices) {
  return {
    async home(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const campSettings = await services.settings.get();
      return services.dashboard.home(req.ctx.actor, campSettings);
    },
  };
}
