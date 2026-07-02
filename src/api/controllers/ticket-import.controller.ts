import type { HttpRequest } from '../http/types';
import type { TicketImportService } from '../../services/ticket-import.service';
import { UnauthorizedError } from '../../core/errors/app-error';

export interface TicketImportControllerServices {
  ticketImport: TicketImportService;
}

export function makeTicketImportController(services: TicketImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      return services.ticketImport.importTicketsCsv(req.ctx.actor, req.body);
    },
  };
}
