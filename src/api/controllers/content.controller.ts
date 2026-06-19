import type { HttpRequest } from '../http/types';
import type { ContentService } from '../../services/content.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface ContentControllerServices {
  content: ContentService;
}

export function makeContentController(services: ContentControllerServices) {
  return {
    async faqList(_req: HttpRequest) {
      return services.content.faqList();
    },

    async faqCreate(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.content.faqCreate(req.ctx.actor, req.body);
    },

    async faqUpdate(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      return services.content.faqUpdate(req.ctx.actor, id, req.body);
    },

    async faqDelete(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const id = req.params['id'];
      if (!id) throw new BadRequestError('Missing id');
      await services.content.faqDelete(req.ctx.actor, id);
      return { ok: true };
    },

    async devotionalGet(req: HttpRequest) {
      const day = req.params['day'] ?? req.query['day'] ?? new Date().toISOString().slice(0, 10);
      return services.content.devotionalGet(day);
    },

    async devotionalSet(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.content.devotionalSet(req.ctx.actor, req.body);
    },
  };
}
