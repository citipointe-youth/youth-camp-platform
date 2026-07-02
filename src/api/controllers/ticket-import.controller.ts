import type { HttpRequest } from '../http/types';
import type { TicketImportService } from '../../services/ticket-import.service';
import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { stampImport } from './_import-stamp';

export interface TicketImportControllerServices {
  ticketImport: TicketImportService;
  settingsRepo: ISettingsRepository;
}

export function makeTicketImportController(services: TicketImportControllerServices) {
  return {
    async run(req: HttpRequest) {
      if (!req.ctx) throw new UnauthorizedError();
      const result = await services.ticketImport.importTicketsCsv(req.ctx.actor, req.body);
      await stampImport(services.settingsRepo, 'ticketsImportedAt', result);
      return result;
    },
  };
}
