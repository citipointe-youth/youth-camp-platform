import type { HttpRequest } from '../http/types';
import type { NoteService } from '../../services/note.service';
import { UnauthorizedError, BadRequestError } from '../../core/errors/app-error';

export interface NoteControllerServices {
  note: NoteService;
}

export function makeNoteController(services: NoteControllerServices) {
  return {
    async add(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.note.add(req.ctx.actor, req.body);
    },

    async recent(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : 20;
      return services.note.recent(req.ctx.actor, limit);
    },

    async recentFirstAid(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const limit = req.query['limit'] ? parseInt(req.query['limit'], 10) : 50;
      return services.note.recentFirstAid(req.ctx.actor, limit);
    },

    async exportRows(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.note.exportRows(req.ctx.actor);
    },

    async forCamper(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const camperId = req.params['camperId'];
      if (!camperId) throw new BadRequestError('Missing camperId');
      return services.note.forCamper(req.ctx.actor, camperId);
    },
  };
}
