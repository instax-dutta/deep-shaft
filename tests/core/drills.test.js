import { describe, expect, it } from 'vitest';

import { buyDrill, drillCost, maxAffordable } from '../../src/core/drills.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { getDrill } from '../../src/data/drills.js';

const firstDrill = getDrill('drill-1');
const growth = config.economy.drillCostGrowthRate;

function affordableCount(state, definition) {
  return maxAffordable(definition, state.drills[definition.id] ?? 0, state.currency);
}

describe('drillCost', () => {
  it('charges the base cost for the very first drill', () => {
    expect(drillCost(firstDrill, 0, 1)).toBeCloseTo(firstDrill.baseCost, 10);
  });

  it('grows exponentially with the number already owned', () => {
    const first = drillCost(firstDrill, 0, 1);
    const second = drillCost(firstDrill, 1, 1);
    const tenth = drillCost(firstDrill, 9, 1);

    expect(second).toBeCloseTo(first * growth, 10);
    expect(tenth).toBeCloseTo(first * growth ** 9, 10);
  });

  it('charges the sum of successive unit costs when buying in bulk', () => {
    const bulk = drillCost(firstDrill, 0, 3);
    const stepwise = drillCost(firstDrill, 0, 1)
      + drillCost(firstDrill, 1, 1)
      + drillCost(firstDrill, 2, 1);

    expect(bulk).toBeCloseTo(stepwise, 10);
  });

  it('costs nothing for a zero quantity', () => {
    expect(drillCost(firstDrill, 0, 0)).toBe(0);
  });
});

describe('maxAffordable', () => {
  it('buys nothing when even the first unit is out of reach', () => {
    expect(maxAffordable(firstDrill, 0, firstDrill.baseCost - 1)).toBe(0);
  });

  it('buys exactly one at the exact price', () => {
    expect(maxAffordable(firstDrill, 0, firstDrill.baseCost)).toBe(1);
  });

  it('returns the largest quantity the currency covers', () => {
    const budget = 10_000;
    const count = maxAffordable(firstDrill, 0, budget);

    expect(drillCost(firstDrill, 0, count)).toBeLessThanOrEqual(budget);
    expect(drillCost(firstDrill, 0, count + 1)).toBeGreaterThan(budget);
  });

  it('accounts for the drills already owned', () => {
    const owned = 5;

    expect(maxAffordable(firstDrill, owned, drillCost(firstDrill, owned, 1))).toBe(1);
  });

  it('returns zero for a non-finite budget instead of looping forever', () => {
    expect(maxAffordable(firstDrill, 0, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(0);
    expect(maxAffordable(firstDrill, 0, Number.NaN)).toBe(0);
  });
});

describe('buyDrill', () => {
  it('adds one drill and charges the matching cost', () => {
    const state = createInitialState();
    state.currency = 100;

    const result = buyDrill(state, 'drill-1', 'x1');

    expect(result.ok).toBe(true);
    expect(state.drills['drill-1']).toBe(1);
    expect(state.currency).toBeCloseTo(100 - firstDrill.baseCost, 10);
  });

  it('reports the quantity bought and the currency spent', () => {
    const state = createInitialState();
    state.currency = 100;

    const result = buyDrill(state, 'drill-1', 'x1');

    expect(result.quantity).toBe(1);
    expect(result.cost).toBeCloseTo(firstDrill.baseCost, 10);
  });

  it('buys ten when this run can afford ten', () => {
    const state = createInitialState();
    state.currency = 1_000;

    const result = buyDrill(state, 'drill-1', 'x10');

    expect(result.ok).toBe(true);
    expect(state.drills['drill-1']).toBe(10);
    expect(state.currency).toBeCloseTo(1_000 - drillCost(firstDrill, 0, 10), 10);
  });

  it('refuses a bulk purchase that cannot be paid for in full', () => {
    const state = createInitialState();
    state.currency = drillCost(firstDrill, 0, 5);
    const before = structuredClone(state);

    expect(buyDrill(state, 'drill-1', 'x10')).toEqual({
      ok: false,
      reason: 'insufficient_currency',
    });
    expect(state).toEqual(before);
  });

  it('buys the largest affordable quantity in max mode', () => {
    const state = createInitialState();
    state.currency = 1_000;
    const expected = affordableCount(state, firstDrill);

    const result = buyDrill(state, 'drill-1', 'max');

    expect(result.ok).toBe(true);
    expect(state.drills['drill-1']).toBe(expected);
    expect(state.currency).toBeGreaterThanOrEqual(0);
    expect(state.currency).toBeLessThan(drillCost(firstDrill, expected, 1));
  });

  it('reports a purchase of nothing when max mode cannot afford one', () => {
    const state = createInitialState();
    state.currency = 0;

    expect(buyDrill(state, 'drill-1', 'max')).toEqual({
      ok: false,
      reason: 'insufficient_currency',
    });
  });

  it('refuses an unknown drill', () => {
    const state = createInitialState();
    state.currency = 10_000;

    expect(buyDrill(state, 'not-a-drill', 'x1')).toEqual({
      ok: false,
      reason: 'unknown_drill',
    });
  });

  it('refuses an unsupported purchase mode', () => {
    const state = createInitialState();
    state.currency = 10_000;

    expect(buyDrill(state, 'drill-1', 'x7').reason).toBe('invalid_mode');
  });

  it('refuses a drill tier the current depth has not unlocked', () => {
    const state = createInitialState();
    state.currency = 1_000_000;
    const deepDrill = getDrill('drill-3');

    expect(buyDrill(state, deepDrill.id, 'x1')).toEqual({
      ok: false,
      reason: 'drill_locked',
    });
    expect(state.drills[deepDrill.id]).toBeUndefined();
  });

  it('allows a deeper drill once the depth tier reaches it', () => {
    const state = createInitialState();
    state.currency = 1_000_000;
    state.depthTier = 3;

    const result = buyDrill(state, 'drill-3', 'x1');

    expect(result.ok).toBe(true);
    expect(state.drills['drill-3']).toBe(1);
  });
});
