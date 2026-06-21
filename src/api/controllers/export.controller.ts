import type { HttpRequest } from '../http/types';
import type { ExportService } from '../../services/export.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface ExportControllerServices {
  exportService: ExportService;
}

export function makeExportController(services: ExportControllerServices) {
  return {
    async registrants(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const q = req.query;
      return services.exportService.exportRegistrants(req.ctx.actor, {
        churchId: q['churchId'],
        gender: q['gender'],
        kind: q['kind'],
        grade: q['grade'],
      });
    },
  };
}
