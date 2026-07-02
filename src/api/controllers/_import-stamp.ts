import type { ISettingsRepository } from '../../repositories/interfaces/entity-repositories';
import type { CampSettings } from '../../core/entities/settings';
import { nowISO } from '../../utils/date';

/** Which settings timestamp a given import source stamps on a successful real import. */
type ImportStampField = 'formImportedAt' | 'ticketsImportedAt' | 'invoicesImportedAt';

/**
 * Record "source X was imported just now" on the settings singleton, so the upload screen
 * can show a per-source "last uploaded" line. Only call this after a real (non-dry-run)
 * import. Best-effort: a missing settings row (tests / first run) is a silent no-op, and a
 * stamp failure must never fail the import the user already committed.
 */
export async function stampImport(
  settingsRepo: ISettingsRepository,
  field: ImportStampField,
  result: { dryRun?: boolean },
): Promise<void> {
  if (result.dryRun) return;
  try {
    const settings = await settingsRepo.getSingleton();
    if (!settings) return;
    const patch: CampSettings = { ...settings, [field]: nowISO(), updatedAt: nowISO() };
    await settingsRepo.saveSingleton(patch);
  } catch {
    // ignore — the import itself succeeded; the timestamp is cosmetic.
  }
}
