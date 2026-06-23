import type { HttpRequest } from '../http/types';
import type { ChurchImportService } from '../../services/church-import.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface ChurchImportControllerServices {
  churchImport: ChurchImportService;
}

export function makeChurchImportController(services: ChurchImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.churchImport.importChurchesCsv(req.ctx.actor, req.body);
    },
  };
}
