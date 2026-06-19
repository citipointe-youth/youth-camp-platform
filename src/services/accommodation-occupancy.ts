import type { AccommodationBlock } from '../core/entities/accommodation';

/**
 * Pure live-occupancy maths for accommodation (fixes defect B1).
 *
 * Background: `AccommodationService` exposed a `computeLiveTaken(blocks, registrants)`
 * helper that correctly summed occupancy, but the live `getLiveBlocks()` path never
 * called it — it set `liveTaken = baseTaken` and `available = capacity - baseTaken`,
 * so assigned people were never subtracted (a block could be over-assigned). This
 * module is the single source of truth both `AccommodationService` and
 * `DashboardService` route through.
 *
 * An "occupant" is anything carrying an accommodation assignment + a status — works
 * for the legacy `Registrant` today and the unified `Person` after Phase-1 Step 4.
 * Matching is by `accommodationKind` + `accommodationLabel === block.name`, exactly
 * as the original helper did; cancelled occupants are ignored.
 *
 * NOTE (documented decision, B1): live occupancy counts ASSIGNED OCCUPANTS only.
 * Church-level `reservations` (held spots not yet assigned to individuals) are a
 * separate capacity-planning concept and are NOT subtracted here. Whether held
 * reservations should also reduce availability (to prevent over-holding) is a
 * product decision flagged in CHANGELOG "KNOWN RISKS"; revisit when the per-church
 * spot model is finalised.
 */

export interface AccommodationOccupant {
  accommodationKind?: string | null;
  accommodationLabel?: string | null;
  status?: string | null; // 'cancelled' occupants are excluded (Registrant/legacy)
  lifecycle?: string | null; // 'cancelled' occupants are excluded (Person/unified)
}

/** Map of blockId -> live taken count (baseTaken + matching non-cancelled occupants). */
export function computeLiveTaken(
  blocks: readonly AccommodationBlock[],
  occupants: readonly AccommodationOccupant[],
): Map<string, number> {
  const taken = new Map<string, number>();
  for (const block of blocks) {
    taken.set(block.id, block.baseTaken);
  }
  for (const o of occupants) {
    if (o.status === 'cancelled' || o.lifecycle === 'cancelled') continue;
    if (!o.accommodationLabel) continue;
    for (const block of blocks) {
      if (block.kind === o.accommodationKind && block.name === o.accommodationLabel) {
        taken.set(block.id, (taken.get(block.id) ?? 0) + 1);
        break;
      }
    }
  }
  return taken;
}

/** Live taken for one block (baseTaken + its matching occupants). */
export function liveTakenForBlock(
  block: AccommodationBlock,
  occupants: readonly AccommodationOccupant[],
): number {
  return computeLiveTaken([block], occupants).get(block.id) ?? block.baseTaken;
}

/** Remaining capacity for a block. Not clamped at 0 — negative signals over-assignment. */
export function availableForBlock(block: AccommodationBlock, liveTaken: number): number {
  return block.capacity - liveTaken;
}
