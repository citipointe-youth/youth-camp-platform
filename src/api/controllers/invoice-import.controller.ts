import type { HttpRequest } from '../http/types';
import type { InvoiceImportService } from '../../services/invoice-import.service';
import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { stampImport } from './_import-stamp';

export interface InvoiceImportControllerServices {
  invoiceImport: InvoiceImportService;
  settingsRepo: ISettingsRepository;
}

export function makeInvoiceImportController(services: InvoiceImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const result = await services.invoiceImport.importInvoicesCsv(req.ctx.actor, req.body);
      await stampImport(services.settingsRepo, 'invoicesImportedAt', result);
      return result;
    },
  };
}
