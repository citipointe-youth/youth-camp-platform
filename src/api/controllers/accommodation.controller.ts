import type { HttpRequest } from '../http/types';
import type { AccommodationService } from '../../services/accommodation.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface AccommodationControllerServices {
  accommodation: AccommodationService;
}

export function makeAccommodationController(services: AccommodationControllerServices) {
  return {
    async blocks(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.listBlocks(req.ctx.actor);
    },

    async getBlock(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.accommodation.getBlock(req.ctx.actor, id);
    },

    async createBlock(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.createBlock(req.ctx.actor, req.body);
    },

    async updateBlock(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.accommodation.updateBlock(req.ctx.actor, id, req.body);
    },

    async deleteBlock(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.accommodation.deleteBlock(req.ctx.actor, id);
      return { ok: true };
    },

    async held(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.params['churchId'] ?? req.ctx.actor.churchId;
      if (!churchId) throw new BadRequestError('Missing churchId');
      return services.accommodation.listHeldByChurch(req.ctx.actor, churchId);
    },

    async setReservations(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.setReservations(req.ctx.actor, req.body);
    },
  };
}
