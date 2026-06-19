import type { HttpRequest } from '../http/types';
import type { SearchService } from '../../services/search.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface SearchControllerServices {
  search: SearchService;
}

export function makeSearchController(services: SearchControllerServices) {
  return {
    async search(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const q = req.query['q'];
      if (!q) throw new BadRequestError('Missing search query');
      return services.search.search(req.ctx.actor, q);
    },

    async revealContact(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const camperId = req.params['camperId'];
      const role = req.params['role'];
      if (!camperId) throw new BadRequestError('Missing camperId');
      if (!role) throw new BadRequestError('Missing role');
      return services.search.revealContact(req.ctx.actor, camperId, role);
    },
  };
}
