import type { HttpRequest } from '../http/types';
import type { ImportService } from '../../services/import.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface ImportControllerServices {
  importService: ImportService;
}

export function makeImportController(services: ImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.importService.importCsv(req.ctx.actor, req.body);
    },
  };
}
