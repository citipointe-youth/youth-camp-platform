import type { IUserRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Church } from '../core/entities/church';
import type { User } from '../core/entities/user';
import type { Actor } from '../core/entities/user';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { ZONE_NAMES } from '../core/types/enums';
import { parseCsv } from '../utils/csv';
import { hashPassword } from '../utils/crypto';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { z } from 'zod';

const ChurchImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  dryRun: z.boolean().optional().default(false),
});

export interface ChurchImportRow {
  name: string;
  zone: string;
  code: string;
  username: string;
  password: string;
  youthPastorName?: string;
  expectedCount?: number;
}

export interface ChurchImportResult {
  created: number;
  skipped: number;
  dryRun: boolean;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  preview: ChurchImportRow[];
}

export interface ChurchImportService {
  importChurchesCsv(actor: Actor, input: unknown): Promise<ChurchImportResult>;
}

export function makeChurchImportService(
  userRepo: IUserRepository,
  churchRepo: IChurchRepository,
): ChurchImportService {
  return {
    async importChurchesCsv(actor, input) {
      assertCan(actor, 'admin:manage');
      const opts = ChurchImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      const existingChurches = await churchRepo.findAll();
      const existingUsers = await userRepo.findAll();
      const churchByCode = new Map(existingChurches.map((c) => [c.code.toUpperCase(), c]));
      const userByUsername = new Map(existingUsers.map((u) => [u.username?.toLowerCase() ?? '', u]));

      let created = 0;
      let skipped = 0;
      const errors: ChurchImportResult['errors'] = [];
      const warnings: ChurchImportResult['warnings'] = [];
      const preview: ChurchImportRow[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;

        const name = (row['Church Name'] ?? row['name'] ?? '').trim();
        const zoneRaw = (row['Zone'] ?? row['zone'] ?? 'Yellow').trim();
        const zone = ZONE_NAMES.find((z) => z.toLowerCase() === zoneRaw.toLowerCase());
        const code = (row['Code'] ?? row['code'] ?? '').toUpperCase().trim();
        const username = (row['Username'] ?? row['username'] ?? '').toLowerCase().trim();
        const password = (row['Password'] ?? row['password'] ?? '').trim();
        const youthPastorName = (row['Youth Pastor'] ?? row['youthPastorName'] ?? '').trim() || undefined;
        const expectedCount = parseInt(row['Expected'] ?? row['expectedCount'] ?? '0', 10) || 0;

        if (!name) { errors.push({ row: rowNum, message: 'Missing Church Name' }); skipped++; continue; }
        if (!code) { errors.push({ row: rowNum, message: 'Missing Code' }); skipped++; continue; }
        if (!username) { errors.push({ row: rowNum, message: 'Missing Username' }); skipped++; continue; }
        if (!password && !opts.dryRun) { errors.push({ row: rowNum, message: 'Missing Password' }); skipped++; continue; }
        if (!zone) { errors.push({ row: rowNum, message: `Invalid Zone "${zoneRaw}" (must be one of ${ZONE_NAMES.join(', ')})` }); skipped++; continue; }

        const rowData: ChurchImportRow = { name, zone, code, username, password, youthPastorName, expectedCount };
        preview.push(rowData);

        // Idempotency: skip if code + username already exist
        const codeExists = churchByCode.has(code);
        const userExists = userByUsername.has(username);

        if (codeExists || userExists) {
          const reasons = [codeExists && `code "${code}" exists`, userExists && `username "${username}" exists`].filter(Boolean);
          warnings.push({ row: rowNum, message: `Skipped: ${reasons.join(', ')}` });
          skipped++;
          continue;
        }

        if (!opts.dryRun) {
          const now = nowISO();
          const churchId = newId('church');
          const church: Church = {
            id: churchId,
            name,
            zone,
            code,
            selfRegisterSlug: code.toLowerCase(),
            expectedCount,
            ...(youthPastorName ? { youthPastorName } : {}),
            reservations: [],
            contacts: {
              male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
              female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
            },
            createdAt: now,
            updatedAt: now,
          };
          await churchRepo.save(church);
          churchByCode.set(code, church);

          const passwordHash = await hashPassword(password);
          const nameWords = youthPastorName ? youthPastorName.trim().split(/\s+/) : [name];
          const user: User = {
            id: newId('user'),
            username,
            firstName: nameWords[0] ?? name,
            lastName: nameWords.slice(1).join(' ') || 'Team',
            role: 'church',
            churchId,
            churchName: name,
            zone,
            status: 'active',
            passwordHash,
            createdAt: now,
            updatedAt: now,
          };
          await userRepo.save(user);
          userByUsername.set(username, user);
          created++;
        } else {
          created++;
        }
      }

      return { created, skipped, dryRun: opts.dryRun, errors, warnings, preview };
    },
  };
}
