import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import type { ConsentType, PersonKind } from '../core/types/enums';
import { CONSENT_TYPES } from '../core/types/enums';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import { z } from 'zod';

const ImportOptionsSchema = z.object({
  csvData: z.string().min(1),
  churchId: z.string().optional(),
  defaultZone: z.string().optional(),
  updateExisting: z.boolean().optional().default(false),
});

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ImportService {
  importCsv(actor: Actor, input: unknown): Promise<ImportResult>;
}

function defaultConsents(): Person['consents'] {
  const result = {} as Record<ConsentType, { granted: boolean; timestamp: string | null }>;
  for (const t of CONSENT_TYPES) {
    result[t] = { granted: false, timestamp: null };
  }
  return result;
}

function parseGender(val: string): Person['gender'] {
  const v = val.toLowerCase().trim();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}

function parseGrade(val: string): Person['grade'] | null {
  const n = parseInt(val, 10);
  if ([7, 8, 9, 10, 11, 12].includes(n)) return n as Person['grade'];
  return null;
}

function parseKind(val: string): PersonKind {
  // CSV may have legacy 'student' kind — map to unified 'youth'
  return val.trim() === 'leader' ? 'leader' : 'youth';
}

export function makeImportService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): ImportService {
  return {
    async importCsv(actor, input) {
      assertCan(actor, 'import:run');
      const opts = ImportOptionsSchema.parse(input);
      const rows = parseCsv(opts.csvData);
      if (rows.length === 0) throw new BadRequestError('CSV has no data rows');

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const errors: ImportResult['errors'] = [];

      // C1 FIX: load reference data ONCE up front (was a per-row churchRepo.findAll
      // + personRepo.findByChurch scan), then batch all writes (was a per-row save,
      // i.e. a full JSON rewrite per row).
      const churches = await churchRepo.findAll();
      const churchIdByName = new Map<string, string>();
      for (const c of churches) churchIdByName.set(c.name.toLowerCase(), c.id);

      // Working set: every existing person, pooled by churchId+lowercased name. We
      // keep a LIST per key (not a single record) so two different people with the
      // SAME name in the SAME church can be told apart by PHONE NUMBER (see pickMatch
      // for the exact rules — a phone-bearing row matches by phone; a phone-less row
      // matches only a lone candidate). Rows that match are mutated IN PLACE in the
      // pool — so a pool never holds two entries for one person, and duplicate rows
      // for the same person collapse. This also removes the empty-church collision
      // (audit P1): church-less people are pooled together but separated by phone.
      const allPersons = await personRepo.findAll();
      const nameChurchKey = (churchId: string, first: string, last: string): string =>
        `${churchId}::${first.toLowerCase()}::${last.toLowerCase()}`;
      const phoneKey = (mobile: string | null | undefined): string =>
        (mobile ?? '').replace(/\D/g, ''); // digits only; '' when absent
      const poolByNameChurch = new Map<string, Person[]>();
      for (const p of allPersons) {
        const k = nameChurchKey(p.churchId, p.firstName, p.lastName);
        const pool = poolByNameChurch.get(k);
        if (pool) pool.push(p);
        else poolByNameChurch.set(k, [p]);
      }

      // Match rules for a row (given its phone) against a name+church pool:
      //  - no candidates → new person;
      //  - the row has a phone → match a candidate with the SAME phone; if none has a
      //    phone at all, fall back to a lone candidate (re-import that's now adding a
      //    phone to the single existing record);
      //  - the row has NO phone → match a lone candidate (re-import omitting phone);
      //    ambiguous against 2+ candidates → no match (caller treats as new).
      function pickMatch(pool: Person[] | undefined, phone: string): Person | undefined {
        if (!pool || pool.length === 0) return undefined;
        if (phone) {
          const byPhone = pool.find((p) => phoneKey(p.mobile) === phone);
          if (byPhone) return byPhone;
          // No phone match: only adopt a lone candidate if it has no phone yet.
          if (pool.length === 1 && !phoneKey(pool[0]!.mobile)) return pool[0];
          return undefined;
        }
        return pool.length === 1 ? pool[0] : undefined;
      }

      // People created or updated this import, keyed by id — the batched write set.
      const touched = new Map<string, Person>();
      // Ids created during THIS import (so a matched-again row isn't miscounted as an
      // update, and isn't blocked by updateExisting=false).
      const createdIds = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2; // 1-indexed, account for header

        try {
          const firstName = (row['firstName'] ?? row['first_name'] ?? row['First Name'] ?? '').trim();
          const lastName = (row['lastName'] ?? row['last_name'] ?? row['Last Name'] ?? '').trim();

          if (!firstName || !lastName) {
            errors.push({ row: rowNum, message: 'Missing firstName or lastName' });
            skipped++;
            continue;
          }

          const churchIdRaw = (row['churchId'] ?? row['church_id'] ?? opts.churchId ?? '').trim();
          const churchName = (row['churchName'] ?? row['church_name'] ?? row['Church'] ?? '').trim();

          // Resolve churchId from an explicit id, else by church name (indexed).
          let resolvedChurchId = churchIdRaw;
          if (!resolvedChurchId && churchName) {
            resolvedChurchId = churchIdByName.get(churchName.toLowerCase()) ?? '';
          }

          const zone = (row['zone'] ?? row['Zone'] ?? opts.defaultZone ?? '').trim();
          const gender = parseGender(row['gender'] ?? row['Gender'] ?? 'other');
          const grade = parseGrade(row['grade'] ?? row['Grade'] ?? '');
          const kind = parseKind(row['kind'] ?? row['Kind'] ?? 'youth');
          const dob = (row['dateOfBirth'] ?? row['dob'] ?? row['DOB'] ?? '').trim() || null;
          const mobile = (row['mobile'] ?? row['Mobile'] ?? '').trim() || null;
          const email = (row['email'] ?? row['Email'] ?? '').trim() || null;
          const medical = (row['medical'] ?? row['Medical'] ?? '').trim();
          const dietary = (row['dietary'] ?? row['Dietary'] ?? '').trim();
          const parentName = (row['parentGuardianName'] ?? row['parent_name'] ?? row['Parent'] ?? '').trim() || null;
          const parentPhone = (row['parentPhone'] ?? row['parent_phone'] ?? '').trim() || null;

          const nck = nameChurchKey(resolvedChurchId, firstName, lastName);
          const rowPhone = phoneKey(mobile);
          const pool = poolByNameChurch.get(nck);
          const match = pickMatch(pool, rowPhone);
          // A match is "existing" (counts as update / governed by updateExisting) only
          // if it was loaded from the DB this run — i.e. not already created this import.
          const isExisting = match !== undefined && !createdIds.has(match.id);

          const now = nowISO();

          // An existing DB person not flagged for update is left untouched.
          if (match && isExisting && !opts.updateExisting) {
            skipped++;
          } else if (match) {
            // Update path: existing DB person (updateExisting), or a duplicate row for
            // a person already created/updated earlier in THIS file. Mutate in place so
            // the pool keeps exactly one entry per person and the write set dedups.
            const merged: Person = {
              ...match,
              firstName,
              lastName,
              gender,
              grade,
              dateOfBirth: dob,
              mobile,
              email,
              zone: zone || match.zone,
              kind,
              medicalConditions: medical ? [medical] : match.medicalConditions,
              dietaryRequirements: dietary ? [dietary] : match.dietaryRequirements,
              parentGuardianName: parentName ?? match.parentGuardianName,
              parentPhone: parentPhone ?? match.parentPhone,
              updatedAt: now,
            };
            // Replace the pooled record (same id) and stage the write.
            if (pool) {
              const idx = pool.indexOf(match);
              if (idx >= 0) pool[idx] = merged;
            }
            const firstTouch = !touched.has(merged.id);
            touched.set(merged.id, merged);
            if (isExisting && firstTouch) updated++;
          } else {
            const person: Person = {
              id: newId('person'),
              firstName,
              lastName,
              gender,
              dateOfBirth: dob,
              grade,
              school: (row['school'] ?? '').trim() || null,
              zone,
              groupId: null,
              kind,
              mobile,
              email,
              suburb: null,
              postcode: null,
              state: null,
              medicalConditions: medical ? [medical] : [],
              dietaryRequirements: dietary ? [dietary] : [],
              otherMedications: null,
              consents: defaultConsents(),
              parentGuardianName: parentName,
              parentPhone,
              parentRelation: null,
              blueCardNumber: null,
              blueCardExpiry: null,
              churchId: resolvedChurchId,
              churchName: churchName || resolvedChurchId,
              paymentStatus: 'unpaid',
              accommodationKind: null,
              accommodationLabel: null,
              lifecycle: 'registered',
              atCamp: false,
              checkInHistory: [],
              signOutHistory: [],
              createdAt: now,
              updatedAt: now,
            };
            touched.set(person.id, person);
            createdIds.add(person.id);
            // Add to the pool so a later duplicate row (same name+church, matching
            // phone when needed) updates THIS new record instead of creating a second.
            const p = poolByNameChurch.get(nck);
            if (p) p.push(person);
            else poolByNameChurch.set(nck, [person]);
            created++;
          }
        } catch (err) {
          errors.push({
            row: rowNum,
            message: err instanceof Error ? err.message : String(err),
          });
          skipped++;
        }
      }

      // Single batched write for the whole import (was one save per row).
      if (touched.size > 0) await personRepo.saveMany([...touched.values()]);

      return { created, updated, skipped, errors };
    },
  };
}
