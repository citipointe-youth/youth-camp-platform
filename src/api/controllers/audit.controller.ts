import type { HttpRequest } from '../http/types';
import type { AuditExportService } from '../../services/audit-export.service';
import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import { UnauthorizedError } from '../../core/errors/app-error';
import { nowISO } from '../../utils/date';
import { createLogger } from '../../utils/logger';

const logger = createLogger('audit');

export interface AuditControllerServices {
  auditExport: AuditExportService;
  settingsRepo: ISettingsRepository;
}

export function makeAuditController(services: AuditControllerServices) {
  const { auditExport, settingsRepo } = services;

  return {
    async exportWorkbook(req: HttpRequest): Promise<Buffer> {
      if (!req.ctx) throw new UnauthorizedError();
      const buffer = await auditExport.exportMasterWorkbook(req.ctx.actor);

      // Read settings AFTER the service runs so we pick up any mutations it made
      // (e.g. clearing lastTempPasswords) before adding lastExportedAt.
      const settings = await settingsRepo.getSingleton();
      if (settings) {
        await settingsRepo.saveSingleton({ ...settings, lastExportedAt: nowISO(), updatedAt: nowISO() });
      }
      logger.info(`[audit] workbook exported by ${req.ctx.actor.displayName} (${req.ctx.actor.role}) from ${req.ip ?? 'unknown'}`);

      return buffer;
    },

    async exportSignInOutCsv(req: HttpRequest): Promise<Buffer> {
      if (!req.ctx) throw new UnauthorizedError();
      const csv = await auditExport.exportSignInOutCsv(req.ctx.actor);

      // Read settings AFTER the service runs for consistency.
      const settings = await settingsRepo.getSingleton();
      if (settings) {
        await settingsRepo.saveSingleton({ ...settings, lastExportedAt: nowISO(), updatedAt: nowISO() });
      }
      logger.info(`[audit] sign-in/out CSV exported by ${req.ctx.actor.displayName} from ${req.ip ?? 'unknown'}`);

      return Buffer.from(csv, 'utf-8');
    },
  };
}
