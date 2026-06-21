import type { Grade } from '../core/types/enums';

/** The canonical 29 Elvanto export columns, in order. */
export const ELVANTO_HEADERS = [
  'Date Submitted',
  'Submission Status',
  'Person',
  'Person Status',
  'First Name',
  'Last Name',
  'Gender',
  'Date of Birth',
  'School Grade',
  'Mobile Number',
  'Email Address',
  'Suburb',
  'Postcode',
  'State',
  'Medicare Number',
  'Medical Conditions',
  'Dietary Requirements',
  'List Other Medical Conditions or Medication Taken',
  "Attendee's Church",
  'If from a church not listed, please specify church name & Youth Pastor',
  'Blue Card/Working with Children Card Number',
  'Blue Card/Working with Children Card Expiry',
  'I give medical consent for my child as listed above.',
  'I give photography and video consent for my child as listed above.',
  'I understand and agree to the Supervision policy.',
  'Parent/Guardian Name',
  'Relation to Child',
  'Parent/Guardian Phone Number',
  "Today's Date",
] as const;

const JUNK = new Set(['', 'na', 'n/a', 'no', 'none', 'nil', '-', '.']);

/** Care-text columns: preserve verbatim, but treat whole-value placeholders as empty. */
export function cleanCareText(raw?: string | null): string {
  const v = (raw ?? '').trim();
  return JUNK.has(v.toLowerCase()) ? '' : v;
}

/** DD/MM/YYYY (or D/M/YYYY, '/' or '-') → ISO; ISO passes through; else null. */
export function normalizeDate(raw?: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (isoMatch) return v;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
  if (!m) return null;
  const dd = (m[1] ?? '').padStart(2, '0');
  const mm = (m[2] ?? '').padStart(2, '0');
  const yyyy = m[3] ?? '';
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** ISO → DD/MM/YYYY for export; anything not ISO passes through unchanged. */
export function formatDateAU(iso?: string | null): string {
  const v = (iso ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const YOUTH_GRADES: readonly number[] = [7, 8, 9, 10, 11, 12];

/** School Grade → kind + grade. 'leader'/'18+' ⇒ leader; numeric 7–12 ⇒ that grade. */
export function parseGradeOrLeader(raw?: string | null): { kind: 'youth' | 'leader'; grade: Grade | null } {
  const v = (raw ?? '').trim().toLowerCase();
  if (v.includes('leader') || v.includes('18+')) return { kind: 'leader', grade: null };
  const n = parseInt(v, 10);
  if (YOUTH_GRADES.includes(n)) return { kind: 'youth', grade: n as Grade };
  return { kind: 'youth', grade: null };
}

export function yesToConsent(raw?: string | null): boolean {
  return (raw ?? '').trim().toLowerCase() === 'yes';
}

/** First non-empty value among the given header aliases (values are pre-trimmed by parseCsv). */
export function field(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[a];
    if (v != null && v.trim() !== '') return v.trim();
  }
  return '';
}
