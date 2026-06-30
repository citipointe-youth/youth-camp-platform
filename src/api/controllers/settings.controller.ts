import type { HttpRequest } from '../http/types';
import type { SettingsService } from '../../services/settings.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface SettingsControllerServices {
  settings: SettingsService;
}

export function makeSettingsController(services: SettingsControllerServices) {
  return {
    async get(_req: HttpRequest) {
      // GET /settings is PUBLIC (auth:false) — the SPA needs camp name/mode before login.
      // SECURITY: never leak lastTempPasswords (plaintext rollover passwords) on this open
      // endpoint. Strip the array and expose only a safe count so the admin Data screen can
      // still flag "N temp passwords pending" (the passwords themselves are reachable only via
      // the admin-authenticated audit export). (Found while resolving R9, 2026-06-30.)
      const s = await services.settings.get();
      const { lastTempPasswords, ...safe } = s;
      return { ...safe, pendingTempPasswordCount: lastTempPasswords?.length ?? 0 };
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.settings.update(req.ctx.actor, req.body);
    },
  };
}
