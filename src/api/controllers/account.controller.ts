import type { HttpRequest } from '../http/types';
import type { AccountService } from '../../services/account.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface AccountControllerServices {
  account: AccountService;
}

export function makeAccountController(services: AccountControllerServices) {
  return {
    async list(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.account.listUsers(req.ctx.actor);
    },

    async create(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.account.createUser(req.ctx.actor, req.body);
    },

    async update(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.account.updateUser(req.ctx.actor, id, req.body);
    },

    async setPassword(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.account.setPassword(req.ctx.actor, req.body);
    },

    async createChurch(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.account.createChurchWithAccount(req.ctx.actor, req.body);
    },

    async listChurches(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.account.listChurches(req.ctx.actor);
    },

    async updateChurch(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.account.updateChurch(req.ctx.actor, id, req.body);
    },

    async deleteUser(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.account.deleteUser(req.ctx.actor, id);
    },

    async deleteChurch(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.account.deleteChurch(req.ctx.actor, id);
    },
  };
}
