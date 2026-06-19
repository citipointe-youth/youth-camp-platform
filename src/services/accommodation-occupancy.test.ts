import { describe, it, expect } from 'vitest';
import { computeLiveTaken, liveTakenForBlock, availableForBlock } from './accommodation-occupancy';
import type { AccommodationBlock } from '../core/entities/accommodation';
import type { AccommodationOccupant } from './accommodation-occupancy';

// ---------------------------------------------------------------------------
// Pure occupancy maths (B1 fix). Locks the matching rule (kind + label==name),
// the cancelled-exclusion, baseTaken seeding, and negative (over-assigned) deltas.
// ---------------------------------------------------------------------------

function block(over: Partial<AccommodationBlock>): AccommodationBlock {
  const now = '2026-01-01T00:00:00.000Z';
  return { id: 'b', kind: 'tent', name: 'Tent A', price: 100, capacity: 10, baseTaken: 0, createdAt: now, updatedAt: now, ...over };
}
function occ(over: Partial<AccommodationOccupant>): AccommodationOccupant {
  return { accommodationKind: 'tent', accommodationLabel: 'Tent A', status: 'registered', ...over };
}

describe('computeLiveTaken', () => {
  it('seeds each block at baseTaken', () => {
    const taken = computeLiveTaken([block({ id: 'b1', baseTaken: 4 })], []);
    expect(taken.get('b1')).toBe(4);
  });

  it('adds one per matching non-cancelled occupant (kind + label == name)', () => {
    const blocks = [
      block({ id: 'b1', kind: 'tent', name: 'Tent A', baseTaken: 1 }),
      block({ id: 'b2', kind: 'classroom', name: 'Room 1', baseTaken: 0 }),
    ];
    const occupants = [
      occ({ accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
      occ({ accommodationKind: 'tent', accommodationLabel: 'Tent A' }),
      occ({ accommodationKind: 'classroom', accommodationLabel: 'Room 1', status: 'cancelled' }),
      occ({ accommodationKind: 'classroom', accommodationLabel: 'Room 1' }),
      occ({ accommodationKind: 'tent', accommodationLabel: 'No Such' }),
      occ({ accommodationKind: null, accommodationLabel: null }),
    ];
    const taken = computeLiveTaken(blocks, occupants);
    expect(taken.get('b1')).toBe(3); // 1 + two Tent A
    expect(taken.get('b2')).toBe(1); // 0 + one active Room 1 (cancelled skipped)
  });

  it('does not match label against the wrong kind', () => {
    const blocks = [block({ id: 'b1', kind: 'tent', name: 'Shared', baseTaken: 0 })];
    const taken = computeLiveTaken(blocks, [occ({ accommodationKind: 'classroom', accommodationLabel: 'Shared' })]);
    expect(taken.get('b1')).toBe(0);
  });

  it('assigns an occupant to only the first matching block', () => {
    const blocks = [
      block({ id: 'b1', kind: 'tent', name: 'Tent A', baseTaken: 0 }),
      block({ id: 'b2', kind: 'tent', name: 'Tent A', baseTaken: 0 }),
    ];
    const taken = computeLiveTaken(blocks, [occ({ accommodationKind: 'tent', accommodationLabel: 'Tent A' })]);
    expect(taken.get('b1')).toBe(1);
    expect(taken.get('b2')).toBe(0);
  });
});

describe('liveTakenForBlock / availableForBlock', () => {
  it('liveTakenForBlock returns baseTaken + matches for that block', () => {
    const b = block({ id: 'b1', kind: 'tent', name: 'Tent A', baseTaken: 2 });
    expect(liveTakenForBlock(b, [occ({}), occ({})])).toBe(4);
  });

  it('availableForBlock = capacity - liveTaken, not clamped (negative signals over-assignment)', () => {
    expect(availableForBlock(block({ capacity: 10 }), 7)).toBe(3);
    expect(availableForBlock(block({ capacity: 5 }), 8)).toBe(-3);
  });
});
