// ⚠️ UNVERIFIED SCAFFOLDING — see src/repositories/supabase/README.md.
//
// Postgres caps a single statement at 65,535 bind parameters. A multi-row INSERT
// uses (rows × columns) parameters, so large imports must be split into batches.
// The widest table here is `people` (~30 columns), so a 1,000-row batch tops out
// around 30,000 parameters — comfortably under the limit while keeping round-trips low.
export const BULK_CHUNK_SIZE = 1000;

export function chunk<T>(arr: readonly T[], size: number = BULK_CHUNK_SIZE): T[][] {
  if (size <= 0 || arr.length <= size) return arr.length ? [arr.slice()] : [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
