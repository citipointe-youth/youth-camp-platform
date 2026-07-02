import type { HttpRequest } from '../http/types';
import type { InvoiceImportService } from '../../services/invoice-import.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface InvoiceImportControllerServices {
  invoiceImport: InvoiceImportService;
}

export function makeInvoiceImportController(services: InvoiceImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.invoiceImport.importInvoicesCsv(req.ctx.actor, req.body);
    },
  };
}
