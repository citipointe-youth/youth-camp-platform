import type { Person } from '../core/entities/person';
import type { Actor } from '../core/entities/user';
import type { IPersonRepository, IChurchRepository } from '../repositories/interfaces/entity-repositories';
import { assertCan } from './access-control';
import { toCsvString } from '../utils/csv';
import { ELVANTO_HEADERS, formatDateAU } from './elvanto-mapping';

export interface ExportFilters {
  churchId?: string;
  gender?: string;
  kind?: string;
  grade?: string;
}

export function personToElvantoRow(p: Person, churchName: string): string[] {
  const consent = (t: 'medical' | 'media' | 'supervision'): string =>
    p.consents[t]?.granted ? 'Yes' : '';
  const gradeText = p.kind === 'leader' ? '18+ Leader' : p.grade != null ? String(p.grade) : '';
  const genderText = p.gender === 'male' ? 'Male' : p.gender === 'female' ? 'Female' : '';
  const meta = p.elvantoMeta ?? null;
  // Imported people reproduce the source metadata verbatim (incl. an originally-blank Person
  // cell); app-created people (no meta) reconstruct Person and leave metadata blank.
  const personCell = meta ? meta.person ?? '' : `${p.lastName}, ${p.firstName}`;
  return [
    meta?.dateSubmitted ?? '', // Date Submitted
    meta?.submissionStatus ?? '', // Submission Status
    personCell, // Person
    meta?.personStatus ?? '', // Person Status
    p.firstName,
    p.lastName,
    genderText,
    formatDateAU(p.dateOfBirth ?? ''),
    gradeText,
    p.mobile ?? '',
    p.email ?? '',
    p.suburb ?? '',
    p.postcode ?? '',
    p.state ?? '',
    p.medicareNumber ?? '',
    p.medicalConditions.join(', '),
    p.dietaryRequirements.join(', '),
    p.otherMedications ?? '',
    churchName,
    p.churchUnlistedNote ?? '',
    p.blueCardNumber ?? '',
    formatDateAU(p.blueCardExpiry ?? ''),
    consent('medical'),
    consent('media'),
    consent('supervision'),
    p.parentGuardianName ?? '',
    p.parentRelation ?? '',
    p.parentPhone ?? '',
    meta?.todaysDate ?? '', // Today's Date
  ];
}

export interface ExportService {
  exportRegistrants(actor: Actor, filters: ExportFilters): Promise<string>;
}

export function makeExportService(
  personRepo: IPersonRepository,
  churchRepo: IChurchRepository,
): ExportService {
  return {
    async exportRegistrants(actor, filters) {
      assertCan(actor, 'import:run');
      const [persons, churches] = await Promise.all([personRepo.findAll(), churchRepo.findAll()]);
      const nameById = new Map(churches.map((c) => [c.id, c.name] as const));
      const rows = persons
        .filter((p) => !filters.churchId || p.churchId === filters.churchId)
        .filter((p) => !filters.gender || p.gender === filters.gender)
        .filter((p) => !filters.kind || p.kind === filters.kind)
        .filter((p) => !filters.grade || String(p.grade ?? '') === filters.grade)
        .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`))
        .map((p) => personToElvantoRow(p, nameById.get(p.churchId) ?? p.churchName));
      return toCsvString([...ELVANTO_HEADERS], rows);
    },
  };
}
