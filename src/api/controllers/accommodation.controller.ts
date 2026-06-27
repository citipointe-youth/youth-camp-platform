import type { HttpRequest } from '../http/types';
import type { AccommodationService } from '../../services/accommodation.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface AccommodationControllerServices {
  accommodation: AccommodationService;
}

export function makeAccommodationController(services: AccommodationControllerServices) {
  return {
    async classrooms(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.listClassrooms(req.ctx.actor);
    },

    async createClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.createClassroom(req.ctx.actor, req.body);
    },

    async updateClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.accommodation.updateClassroom(req.ctx.actor, id, req.body);
    },

    async deleteClassroom(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.accommodation.deleteClassroom(req.ctx.actor, id);
      return { ok: true };
    },

    async groups(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.listGroups(req.ctx.actor);
    },

    async allocations(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.getAllocations(req.ctx.actor);
    },

    async setAllocations(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.accommodation.setAllocations(req.ctx.actor, req.body);
    },

    async churchRooms(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const churchId = req.params['churchId'] ?? req.ctx.actor.churchId;
      if (!churchId) throw new BadRequestError('Missing churchId');
      return services.accommodation.getChurchRooms(req.ctx.actor, churchId);
    },
  };
}
