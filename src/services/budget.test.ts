import { describe, it, expect } from 'vitest';
import { computeBudget, labelForAmount, budgetToCsv, type BudgetPerson, type BudgetReport } from './budget';

function p(over: Partial<BudgetPerson> & Pick<BudgetPerson, 'churchId' | 'kind'>): BudgetPerson {
  return {
    churchName: over.churchId === 'c1' ? 'Victory' : over.churchId === 'c2' ? 'Grace Point' : 'Riverbend',
    registrationCost: 180,
    discountCode: null,
    ...over,
  };
}

/** The core invariant: grand total === Σ of every category line total across all churches. */
function sumOfAllLines(r: BudgetReport): number {
  let s = 0;
  for (const c of r.churches) {
    for (const row of c.campers) s += row.lineTotal;
    for (const row of c.leaders) s += row.lineTotal;
  }
  return s;
}

describe('labelForAmount — dataset-relative smart labels', () => {
  it('highest positive = Full, 0 = Sponsored, half-of-full = Half, other = Part', () => {
    expect(labelForAmount(180, 180)).toBe('Full — $180');
    expect(labelForAmount(0, 180)).toBe('Sponsored — $0');
    expect(labelForAmount(90, 180)).toBe('Half — $90');
    expect(labelForAmount(120, 180)).toBe('Part — $120');
  });
  it('null = Cost not recorded', () => {
    expect(labelForAmount(null, 180)).toBe('Cost not recorded');
  });
  it('does not hardcode 180 — full anchor follows the data', () => {
    expect(labelForAmount(250, 250)).toBe('Full — $250');
    expect(labelForAmount(125, 250)).toBe('Half — $125');
  });
});

describe('computeBudget — mixed tiers', () => {
  const people: BudgetPerson[] = [
    // Grace Point: 3 full campers, 2 half, 2 sponsored, 2 sponsored leaders
    p({ churchId: 'c2', kind: 'camper', registrationCost: 180 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 180 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 180 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 90 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 90 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 0 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 0 }),
    p({ churchId: 'c2', kind: 'leader', registrationCost: 0 }),
    p({ churchId: 'c2', kind: 'leader', registrationCost: 0 }),
    // Victory: 7 full campers
    ...Array.from({ length: 7 }, () => p({ churchId: 'c1', kind: 'camper', registrationCost: 180 })),
  ];

  it('full anchor is the highest positive cost', () => {
    expect(computeBudget(people).fullAmount).toBe(180);
  });

  it('per-church camper categories carry count, amount, lineTotal', () => {
    const r = computeBudget(people);
    const gp = r.churches.find((c) => c.churchId === 'c2')!;
    const full = gp.campers.find((row) => row.amount === 180)!;
    expect(full.count).toBe(3);
    expect(full.lineTotal).toBe(540);
    const half = gp.campers.find((row) => row.amount === 90)!;
    expect(half).toMatchObject({ count: 2, lineTotal: 180 });
    const spon = gp.campers.find((row) => row.amount === 0)!;
    expect(spon).toMatchObject({ count: 2, lineTotal: 0 });
  });

  it('leaders are a separate group', () => {
    const gp = computeBudget(people).churches.find((c) => c.churchId === 'c2')!;
    expect(gp.leaderCount).toBe(2);
    expect(gp.leaders).toHaveLength(1);
    expect(gp.leaders[0]).toMatchObject({ amount: 0, count: 2, lineTotal: 0 });
  });

  it('church total = Σ camper lines + Σ leader lines', () => {
    const gp = computeBudget(people).churches.find((c) => c.churchId === 'c2')!;
    expect(gp.total).toBe(540 + 180 + 0 + 0); // 720
  });

  it('grand total = Σ church totals AND = Σ of every line total (the acceptance invariant)', () => {
    const r = computeBudget(people);
    expect(r.grandTotal).toBe(720 + 7 * 180); // Grace Point 720 + Victory 1260 = 1980
    expect(r.grandTotal).toBe(sumOfAllLines(r));
  });

  it('churches are sorted by name', () => {
    const r = computeBudget(people);
    expect(r.churches.map((c) => c.churchName)).toEqual(['Grace Point', 'Victory']);
  });
});

describe('computeBudget — edge cases (J5)', () => {
  it('all-sponsored church: total 0, invariant holds', () => {
    const people = Array.from({ length: 5 }, () => p({ churchId: 'c1', kind: 'camper', registrationCost: 0 }));
    const r = computeBudget(people);
    expect(r.grandTotal).toBe(0);
    expect(r.grandTotal).toBe(sumOfAllLines(r));
    expect(r.churches[0]!.campers[0]!.label).toBe('Sponsored — $0');
  });

  it('null cost → "Cost not recorded", counted but $0, never dropped; total stays honest', () => {
    const people: BudgetPerson[] = [
      p({ churchId: 'c1', kind: 'camper', registrationCost: 180 }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: null }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: null }),
    ];
    const r = computeBudget(people);
    expect(r.camperCount).toBe(3); // none dropped
    const c1 = r.churches[0]!;
    const unrec = c1.campers.find((row) => row.unrecorded)!;
    expect(unrec.count).toBe(2);
    expect(unrec.lineTotal).toBe(0);
    expect(unrec.label).toBe('Cost not recorded');
    expect(r.grandTotal).toBe(180); // only the recorded camper contributes
    expect(r.grandTotal).toBe(sumOfAllLines(r));
  });

  it('leaders-only church', () => {
    const people = Array.from({ length: 3 }, () => p({ churchId: 'c1', kind: 'leader', registrationCost: 0 }));
    const r = computeBudget(people);
    expect(r.camperCount).toBe(0);
    expect(r.leaderCount).toBe(3);
    expect(r.churches[0]!.campers).toHaveLength(0);
  });

  it('empty dataset', () => {
    const r = computeBudget([]);
    expect(r).toMatchObject({ grandTotal: 0, camperCount: 0, leaderCount: 0, churchCount: 0 });
    expect(r.fullAmount).toBeNull();
  });

  it('cost-not-recorded sorts last within a scope', () => {
    const people: BudgetPerson[] = [
      p({ churchId: 'c1', kind: 'camper', registrationCost: null }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: 180 }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: 90 }),
    ];
    const rows = computeBudget(people).churches[0]!.campers;
    expect(rows.map((r) => r.amount)).toEqual([180, 90, null]);
  });
});

describe('computeBudget — single-church filter', () => {
  const people: BudgetPerson[] = [
    p({ churchId: 'c1', kind: 'camper', registrationCost: 180 }),
    p({ churchId: 'c2', kind: 'camper', registrationCost: 90 }),
  ];
  it('scopes to one church and its grand total', () => {
    const r = computeBudget(people, 'c1');
    expect(r.churchCount).toBe(1);
    expect(r.grandTotal).toBe(180);
    expect(r.grandTotal).toBe(sumOfAllLines(r));
  });
});

describe('discount code hint', () => {
  it('surfaces a code only when every person in the tier shares it', () => {
    const people: BudgetPerson[] = [
      p({ churchId: 'c1', kind: 'camper', registrationCost: 90, discountCode: 'EARLYBIRD' }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: 90, discountCode: 'EARLYBIRD' }),
    ];
    const row = computeBudget(people).churches[0]!.campers[0]!;
    expect(row.codeHint).toBe('EARLYBIRD');
  });
  it('no hint when codes differ', () => {
    const people: BudgetPerson[] = [
      p({ churchId: 'c1', kind: 'camper', registrationCost: 90, discountCode: 'A' }),
      p({ churchId: 'c1', kind: 'camper', registrationCost: 90, discountCode: 'B' }),
    ];
    expect(computeBudget(people).churches[0]!.campers[0]!.codeHint).toBeNull();
  });
});

describe('budgetToCsv', () => {
  it('emits header, per-church rows, church totals and a grand-total row; reconciles', () => {
    const people: BudgetPerson[] = [
      p({ churchId: 'c1', kind: 'camper', registrationCost: 180 }),
      p({ churchId: 'c1', kind: 'leader', registrationCost: 0 }),
    ];
    const r = computeBudget(people);
    const csv = budgetToCsv(r);
    const rows = csv.split('\n');
    expect(rows[0]).toBe('Church,Audience,Category,Count,UnitPrice,LineTotal');
    expect(csv).toContain('Grand Total');
    // grand total in the last row equals the report grand total
    expect(rows[rows.length - 1]!.endsWith(',' + r.grandTotal)).toBe(true);
  });
});
