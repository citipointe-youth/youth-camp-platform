import type { Person } from '../core/entities/person';

// ---------------------------------------------------------------------------
// person-matching.ts — pure, CSV-agnostic cross-church person matching.
//
// This module has NO knowledge of CSV columns or Elvanto headers. It operates
// purely on `Person[]`/plain objects and generalizes the existing
// church-scoped exact-match pattern in `import.service.ts`
// (`nameChurchKey`/`phoneKey`/`pickMatch`) to a cross-church name index with a
// bounded fuzzy fallback. Shared by the Ticket List and Invoice CSV importers.
// ---------------------------------------------------------------------------

// ---------- Name normalization ----------

/** trim → lowercase → strip punctuation → collapse internal whitespace to single spaces. */
export function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** normalizeName(firstName) + ' ' + normalizeName(lastName), single space-joined. */
export function normalizedFullName(firstName: string, lastName: string): string {
  return `${normalizeName(firstName)} ${normalizeName(lastName)}`;
}

// ---------- Cross-church name index ----------

export interface NameIndex {
  /** normalizedFullName -> every Person currently sharing that exact normalized name (any church). */
  readonly byName: Map<string, Person[]>;
}

/** Build once per import run from personRepo.findAll(). O(n). */
export function buildNameIndex(people: Person[]): NameIndex {
  const byName = new Map<string, Person[]>();
  for (const person of people) {
    const key = normalizedFullName(person.firstName, person.lastName);
    const pool = byName.get(key);
    if (pool) pool.push(person);
    else byName.set(key, [person]);
  }
  return { byName };
}

/**
 * Insert a person created/updated earlier in the SAME import run so later rows in the
 * same CSV can match against them (mirrors the poolByNameChurch push-back pattern already
 * used in import.service.ts for newly created persons). Idempotent-ish: if this exact
 * person id is already present in its name's pool, replace it in place rather than
 * duplicating (a person updated twice in one run should not appear twice in the index).
 */
export function addToIndex(index: NameIndex, person: Person): void {
  const key = normalizedFullName(person.firstName, person.lastName);
  const pool = index.byName.get(key);
  if (!pool) {
    index.byName.set(key, [person]);
    return;
  }
  const idx = pool.findIndex((p) => p.id === person.id);
  if (idx >= 0) pool[idx] = person;
  else pool.push(person);
}

// ---------- Matching ----------

export interface MatchQuery {
  firstName: string;
  lastName: string;
  /** Raw phone string from the CSV row, any format; digits are extracted internally. */
  phone?: string | null;
}

export type MatchResult =
  | { status: 'matched'; person: Person; via: 'exact' | 'exact+phone' | 'fuzzy'; distance?: number }
  | { status: 'no_match'; reason: 'not_found' | 'ambiguous'; candidates: Person[] };

/**
 * Resolve a pool of same-named people to at most one person using the phone tiebreak
 * rule shared by the exact and fuzzy stages:
 * - empty pool -> undefined
 * - single-member pool -> that person
 * - multi-member pool with a non-empty query phone -> the member whose phone digits
 *   match exactly, else undefined (no match found among the pool)
 * - multi-member pool with no query phone -> undefined (deliberately no auto-pick)
 */
function resolvePool(pool: Person[] | undefined, phone: string): Person | undefined {
  if (!pool || pool.length === 0) return undefined;
  if (pool.length === 1) return pool[0];
  if (phone) {
    return pool.find((p) => phoneDigits(p.mobile) === phone);
  }
  return undefined;
}

/**
 * Look up a person across all churches by (firstName, lastName, phone?).
 * Never throws; ambiguity/absence is a normal, expected outcome the caller turns into
 * an orphan + warning.
 */
export function findPersonMatch(index: NameIndex, query: MatchQuery): MatchResult {
  const key = normalizedFullName(query.firstName, query.lastName);
  const phone = phoneDigits(query.phone);
  const pool = index.byName.get(key);

  // ---- EXACT STAGE ----
  if (pool && pool.length > 0) {
    if (pool.length === 1) {
      return { status: 'matched', person: pool[0]!, via: 'exact' };
    }
    // pool.length > 1: tiebreak by phone.
    if (phone) {
      const byPhone = pool.find((p) => phoneDigits(p.mobile) === phone);
      if (byPhone) return { status: 'matched', person: byPhone, via: 'exact+phone' };
    }
    return { status: 'no_match', reason: 'ambiguous', candidates: pool };
  }

  // ---- FUZZY STAGE (only reached when the exact key had zero entries) ----
  const resolved = new Map<string, { person: Person; distance: number }>();
  for (const candidateKey of index.byName.keys()) {
    const distance = levenshteinWithin(key, candidateKey, 2);
    if (distance === null) continue;
    const person = resolvePool(index.byName.get(candidateKey), phone);
    if (!person) continue;
    const existing = resolved.get(person.id);
    if (!existing || distance < existing.distance) {
      resolved.set(person.id, { person, distance });
    }
  }

  if (resolved.size === 1) {
    const [entry] = resolved.values();
    return { status: 'matched', person: entry!.person, via: 'fuzzy', distance: entry!.distance };
  }
  if (resolved.size === 0) {
    return { status: 'no_match', reason: 'not_found', candidates: [] };
  }
  return { status: 'no_match', reason: 'ambiguous', candidates: [...resolved.values()].map((e) => e.person) };
}

// ---------- Levenshtein (hand-rolled, no new dependency — repo has a strong minimal-deps bias) ----------

/**
 * Bounded edit distance. Returns the true distance if it is <= maxDistance, otherwise
 * null. Should early-exit cheaply once the DP band can no longer close within
 * maxDistance (single-row DP is fine, don't over-engineer — correctness and clear code
 * matter more than micro-optimizing this at camp-roster scale).
 */
export function levenshteinWithin(a: string, b: string, maxDistance: number): number | null {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  if (a === b) return 0;

  const aLen = a.length;
  const bLen = b.length;

  // Classic single-row rolling DP, O(min(len)) space by ensuring `a` is the shorter string.
  const [short, long] = aLen <= bLen ? [a, b] : [b, a];
  const shortLen = short.length;
  const longLen = long.length;

  let prevRow = new Array<number>(shortLen + 1);
  for (let j = 0; j <= shortLen; j++) prevRow[j] = j;

  for (let i = 1; i <= longLen; i++) {
    const currRow = new Array<number>(shortLen + 1);
    currRow[0] = i;
    let rowMin = currRow[0];
    const longChar = long[i - 1];
    for (let j = 1; j <= shortLen; j++) {
      const cost = longChar === short[j - 1] ? 0 : 1;
      const deletion = prevRow[j]! + 1;
      const insertion = currRow[j - 1]! + 1;
      const substitution = prevRow[j - 1]! + cost;
      const value = Math.min(deletion, insertion, substitution);
      currRow[j] = value;
      if (value < rowMin) rowMin = value;
    }
    // Early exit: if every value in this row already exceeds maxDistance, the final
    // distance can only grow from here — bail out.
    if (rowMin > maxDistance) return null;
    prevRow = currRow;
  }

  const distance = prevRow[shortLen]!;
  return distance <= maxDistance ? distance : null;
}

// ---------- Merge primitive ----------

/** True for '', whitespace-only strings, null, undefined, and []. False for 0, false, and non-empty strings/arrays/objects. */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Returns a NEW object: existing with each key in ownedKeys overwritten by incoming[key]
 * IFF incoming[key] is present in the incoming object AND not isBlank(); otherwise
 * existing[key] is kept as-is. Fields not listed in ownedKeys are passed through from
 * `existing` unconditionally untouched. Array fields are treated as atomic (a non-blank
 * incoming array wholesale-replaces; blank/absent keeps existing) — no element-wise merge.
 */
export function mergeOwnedFields<T extends object, K extends keyof T>(
  existing: T,
  incoming: Partial<Record<K, T[K]>>,
  ownedKeys: readonly K[],
): T {
  const result: T = { ...existing };
  for (const key of ownedKeys) {
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
    const value = incoming[key];
    if (isBlank(value)) continue;
    result[key] = value as T[K];
  }
  return result;
}

// ---------- Phone helper ----------

/** Digits-only of a phone string, or '' if none. Same semantics as import.service.ts's phoneKey. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}
