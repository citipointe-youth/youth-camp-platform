import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import type { Person } from '../core/entities/person';
import type { Church } from '../core/entities/church';
import type { Actor } from '../core/entities/user';
import type { ConsentType } from '../core/types/enums';
import { assertCan } from './access-control';
import { BadRequestError } from '../core/errors/app-error';
import { parseCsv } from '../utils/csv';
import { newId } from '../utils/id';
import { nowISO } from '../utils/date';
import {
  cleanCareText, field, normalizeDate, parseGradeOrLeader, yesToConsent,
} from './elvanto-mapping';
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
  warnings: Array<{ row: number; message: string }>;
  churchesCreated: string[];
}

export interface ImportService {
  importCsv(actor: Actor, input: unknown): Promise<ImportResult>;
}

function parseGender(val: string): Person['gender'] {
  const v = val.toLowerCase().trim();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return 'other';
}

function slugCode(name: string, taken: Set<string>): string {
  const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) || 'CHURCH';
  let code = base;
  let n = 1;
  while (taken.has(code)) code = `${base}${n++}`.slice(0, 10);
  taken.add(code);
  return code;
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
      const warnings: ImportResult['warnings'] = [];
      const churchesCreated: string[] = [];

      const churches = await churchRepo.findAll();
      const churchIdByName = new Map<string, string>();
      for (const c of churches) churchIdByName.set(c.name.toLowerCase(), c.id);
      const takenCodes = new Set<string>(churches.map((c) => c.code));
      const newlyCreated = new Map<string, string>(); // lowercased name -> id

      const allPersons = await personRepo.findAll();
      const nameChurchKey = (churchId: string, first: string, last: string): string =>
        `${churchId}::${first.toLowerCase()}::${last.toLowerCase()}`;
      const phoneKey = (mobile: string | null | undefined): string =>
        (mobile ?? '').replace(/\D/g, '');
      const poolByNameChurch = new Map<string, Person[]>();
      for (const p of allPersons) {
        const k = nameChurchKey(p.churchId, p.firstName, p.lastName);
        const pool = poolByNameChurch.get(k);
        if (pool) pool.push(p);
        else poolByNameChurch.set(k, [p]);
      }

      function pickMatch(pool: Person[] | undefined, phone: string): Person | undefined {
        if (!pool || pool.length === 0) return undefined;
        if (phone) {
          const byPhone = pool.find((p) => phoneKey(p.mobile) === phone);
          if (byPhone) return byPhone;
          if (pool.length === 1 && !phoneKey(pool[0]!.mobile)) return pool[0];
          return undefined;
        }
        return pool.length === 1 ? pool[0] : undefined;
      }

      // Resolve a church name to an id, auto-creating a minimal church on miss.
      async function resolveChurch(name: string, youthPastor: string, rowNum: number, createdAt: string): Promise<string> {
        if (!name) return '';
        const key = name.toLowerCase();
        const existing = churchIdByName.get(key) ?? newlyCreated.get(key);
        if (existing) return existing;
        const id = newId('church');
        const code = slugCode(name, takenCodes);
        const church: Church = {
          id,
          name,
          zone: 'Yellow',
          code,
          selfRegisterSlug: code.toLowerCase(),
          expectedCount: 0,
          ...(youthPastor ? { youthPastorName: youthPastor } : {}),
          reservations: [],
          contacts: {
            male: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
            female: { primary: { name: '', phone: '' }, backup: { name: '', phone: '' } },
          },
          createdAt,
          updatedAt: createdAt,
        };
        await churchRepo.save(church);
        newlyCreated.set(key, id);
        churchesCreated.push(name);
        warnings.push({ row: rowNum, message: `Church "${name}" not found — created (zone defaulted to Yellow)` });
        return id;
      }

      function buildConsents(med: boolean, media: boolean, sup: boolean, ts: string): Person['consents'] {
        const mk = (granted: boolean): { granted: boolean; timestamp: string | null } => ({
          granted,
          timestamp: granted ? ts : null,
        });
        return { medical: mk(med), media: mk(media), supervision: mk(sup) } as Record<
          ConsentType,
          { granted: boolean; timestamp: string | null }
        >;
      }

      const touched = new Map<string, Person>();
      const createdIds = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        const rowNum = i + 2;

        try {
          const firstName = field(row, 'First Name', 'firstName', 'first_name');
          const lastName = field(row, 'Last Name', 'lastName', 'last_name');
          if (!firstName || !lastName) {
            errors.push({ row: rowNum, message: 'Missing firstName or lastName' });
            skipped++;
            continue;
          }

          const now = nowISO();

          const churchName = field(row, "Attendee's Church", 'churchName', 'church_name', 'Church');
          const churchUnlistedNote =
            field(row, 'If from a church not listed, please specify church name & Youth Pastor') || null;
          const explicitChurchId = field(row, 'churchId', 'church_id') || opts.churchId || '';
          const resolvedChurchId = explicitChurchId
            ? explicitChurchId
            : await resolveChurch(churchName, churchUnlistedNote ?? '', rowNum, now);

          const gender = parseGender(field(row, 'Gender', 'gender') || 'other');
          const gradeRaw = field(row, 'School Grade', 'grade', 'Grade');
          const { kind, grade } = parseGradeOrLeader(gradeRaw);
          if (gradeRaw && grade === null && kind === 'youth') {
            warnings.push({ row: rowNum, message: `Unrecognized School Grade "${gradeRaw}" — grade left blank` });
          }

          const dob = normalizeDate(field(row, 'Date of Birth', 'dateOfBirth', 'dob', 'DOB'));
          const mobile = field(row, 'Mobile Number', 'mobile', 'Mobile') || null;
          const email = field(row, 'Email Address', 'email', 'Email') || null;
          const suburb = field(row, 'Suburb', 'suburb') || null;
          const postcode = field(row, 'Postcode', 'postcode') || null;
          const state = field(row, 'State', 'state') || null;
          const medicareNumber = field(row, 'Medicare Number') || null;
          const medical = cleanCareText(field(row, 'Medical Conditions', 'medical', 'Medical'));
          const dietary = cleanCareText(field(row, 'Dietary Requirements', 'dietary', 'Dietary'));
          const otherMedications =
            cleanCareText(field(row, 'List Other Medical Conditions or Medication Taken')) || null;
          const blueCardNumber = field(row, 'Blue Card/Working with Children Card Number') || null;
          const blueCardExpiry = normalizeDate(field(row, 'Blue Card/Working with Children Card Expiry'));
          const parentName = field(row, 'Parent/Guardian Name', 'parentGuardianName', 'parent_name', 'Parent') || null;
          const parentRelation = field(row, 'Relation to Child', 'parentRelation') || null;
          const parentPhone = field(row, 'Parent/Guardian Phone Number', 'parentPhone', 'parent_phone') || null;
          const zone = field(row, 'zone', 'Zone') || opts.defaultZone || '';

          // Verbatim submission metadata (kept for byte-for-byte export round-trip).
          const raw = (h: string): string => (row[h] ?? '').trim();
          const elvantoMeta = {
            dateSubmitted: raw('Date Submitted'),
            submissionStatus: raw('Submission Status'),
            person: raw('Person'),
            personStatus: raw('Person Status'),
            todaysDate: raw("Today's Date"),
          };

          const submitted = normalizeDate(field(row, 'Date Submitted'));
          const consentTs = submitted ? `${submitted}T00:00:00.000Z` : now;
          const consents = buildConsents(
            yesToConsent(field(row, 'I give medical consent for my child as listed above.')),
            yesToConsent(field(row, 'I give photography and video consent for my child as listed above.')),
            yesToConsent(field(row, 'I understand and agree to the Supervision policy.')),
            consentTs,
          );

          const nck = nameChurchKey(resolvedChurchId, firstName, lastName);
          const rowPhone = phoneKey(mobile);
          const pool = poolByNameChurch.get(nck);
          const match = pickMatch(pool, rowPhone);
          const isExisting = match !== undefined && !createdIds.has(match.id);

          if (match && isExisting && !opts.updateExisting) {
            skipped++;
          } else if (match) {
            const merged: Person = {
              ...match,
              firstName,
              lastName,
              gender,
              grade,
              dateOfBirth: dob,
              mobile,
              email,
              suburb,
              postcode,
              state,
              medicareNumber,
              zone: zone || match.zone,
              kind,
              medicalConditions: medical ? [medical] : match.medicalConditions,
              dietaryRequirements: dietary ? [dietary] : match.dietaryRequirements,
              otherMedications: otherMedications ?? match.otherMedications,
              blueCardNumber: blueCardNumber ?? match.blueCardNumber,
              blueCardExpiry: blueCardExpiry ?? match.blueCardExpiry,
              churchUnlistedNote: churchUnlistedNote ?? match.churchUnlistedNote,
              elvantoMeta,
              consents,
              parentGuardianName: parentName ?? match.parentGuardianName,
              parentRelation: parentRelation ?? match.parentRelation,
              parentPhone: parentPhone ?? match.parentPhone,
              updatedAt: now,
            };
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
              school: field(row, 'school') || null,
              zone,
              groupId: null,
              kind,
              mobile,
              email,
              suburb,
              postcode,
              state,
              medicalConditions: medical ? [medical] : [],
              dietaryRequirements: dietary ? [dietary] : [],
              otherMedications,
              medicareNumber,
              churchUnlistedNote,
              elvantoMeta,
              consents,
              parentGuardianName: parentName,
              parentPhone,
              parentRelation,
              blueCardNumber,
              blueCardExpiry,
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
            const p = poolByNameChurch.get(nck);
            if (p) p.push(person);
            else poolByNameChurch.set(nck, [person]);
            created++;
          }
        } catch (err) {
          errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
          skipped++;
        }
      }

      if (touched.size > 0) await personRepo.saveMany([...touched.values()]);

      return { created, updated, skipped, errors, warnings, churchesCreated };
    },
  };
}
