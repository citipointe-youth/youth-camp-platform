import type { HttpRequest } from '../http/types';
import type { ImportService } from '../../services/import.service';
import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { stampImport } from './_import-stamp';

export interface ImportControllerServices {
  importService: ImportService;
  settingsRepo: ISettingsRepository;
}

export function makeImportController(services: ImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const result = await services.importService.importCsv(req.ctx.actor, req.body);
      await stampImport(services.settingsRepo, 'formImportedAt', result);
      return result;
    },
  };
}
