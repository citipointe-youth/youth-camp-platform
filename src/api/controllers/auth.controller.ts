import type { HttpRequest } from '../http/types';
import type { AuthService } from '../../services/auth.service';
import type { IUserRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { toSafeUser } from '../../services/auth.service';

export interface AuthControllerServices {
  auth: AuthService;
  users: IUserRepository;
}

export function makeAuthController(services: AuthControllerServices) {
  return {
    async login(req: HttpRequest) {
      const result = await services.auth.login(req.body);
      return result;
    },

    async me(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const user = await services.users.findById(req.ctx.actor.id);
      if (!user) throw new UnauthorizedError();
      return { user: toSafeUser(user), actor: req.ctx.actor };
    },

    async logout(req: HttpRequest) {
      if (req.ctx) {
        await services.auth.logout(req.ctx.token);
      }
      return { ok: true };
    },
  };
}
