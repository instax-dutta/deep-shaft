import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import {
  mineManually,
  sellAll,
  sellAmount,
  sellCategory,
  sellValue,
} from '../../src/core/resources.js';
import { config } from '../../src/data/config.js';
import { resourceOfCategory, RESOURCE_CATEGORIES } from '../../src/data/resources.js';

const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE).id;

function oreAmount(state, resourceId = tierOneOre) {
  return state.resources[resourceId] ?? 0;
}

describe('mineManually', () => {
  it("adds the active tier's ore to the inventory", () => {
    const state = createInitialState();

    mineManually(state);

    expect(oreAmount(state)).toBeGreaterThan(0);
  });

  it('reports which resource was extracted and how much', () => {
    const state = createInitialState();

    const result = mineManually(state);

    expect(result).toEqual({
      ok: true,
      resourceId: tierOneOre,
      amount: oreAmount(state),
    });
  });

  it('counts manual extractions for later statistics', () => {
    const state = createInitialState();

    mineManually(state);
    mineManually(state);

    expect(state.stats.manualExtractions).toBe(2);
  });

  it('extracts the ore of the current depth tier, not the first tier', () => {
    const state = createInitialState();
    state.depthTier = 3;
    const tierThreeOre = resourceOfCategory(3, RESOURCE_CATEGORIES.ORE).id;

    mineManually(state);

    expect(oreAmount(state, tierThreeOre)).toBeGreaterThan(0);
    expect(oreAmount(state, tierOneOre)).toBe(0);
  });
});

describe('sellValue', () => {
  it('values an amount by the resource unit value', () => {
    const ore = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE);

    expect(sellValue(tierOneOre, 7)).toBeCloseTo(7 * ore.baseUnitValue, 10);
  });

  it('values nothing as zero', () => {
    expect(sellValue(tierOneOre, 0)).toBe(0);
  });

  it('scales gems and rare minerals faster than ore across depth', () => {
    const shallowGem = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS);
    const deepGem = resourceOfCategory(3, RESOURCE_CATEGORIES.GEMS);

    const shallowValue = sellValue(shallowGem.id, 1);
    const deepValue = sellValue(deepGem.id, 1);

    expect(deepValue).toBeGreaterThan(shallowValue * 2);
  });

  it('returns zero for an unknown resource', () => {
    expect(sellValue('not-a-resource', 5)).toBe(0);
  });
});

describe('sellAmount', () => {
  it('converts ore into currency at the sell value', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;

    const result = sellAmount(state, tierOneOre, 10);

    expect(result.ok).toBe(true);
    expect(state.currency).toBeCloseTo(sellValue(tierOneOre, 10), 10);
  });

  it('removes the sold amount from the inventory', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;

    sellAmount(state, tierOneOre, 4);

    expect(oreAmount(state)).toBeCloseTo(6, 10);
  });

  it('drops the inventory entry once it is fully drained', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;

    sellAmount(state, tierOneOre, 10);

    expect(state.resources).not.toHaveProperty(tierOneOre);
  });

  it('records earnings so prestige can scale with run progress', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;

    sellAmount(state, tierOneOre, 10);

    expect(state.stats.totalEarned).toBeCloseTo(state.currency, 10);
    expect(state.prestige.lifetimeEarned).toBeCloseTo(state.currency, 10);
  });

  it('refuses an unknown resource without changing state', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;
    const before = structuredClone(state);

    expect(sellAmount(state, 'not-a-resource', 1)).toEqual({
      ok: false,
      reason: 'unknown_resource',
    });
    expect(state).toEqual(before);
  });

  it('refuses to sell more than the inventory holds', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 3;
    const before = structuredClone(state);

    expect(sellAmount(state, tierOneOre, 4)).toEqual({
      ok: false,
      reason: 'insufficient_resource',
    });
    expect(state).toEqual(before);
  });

  it('refuses zero, negative, and non-numeric amounts', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 10;

    expect(sellAmount(state, tierOneOre, 0).reason).toBe('invalid_amount');
    expect(sellAmount(state, tierOneOre, -5).reason).toBe('invalid_amount');
    expect(sellAmount(state, tierOneOre, Number.NaN).reason).toBe('invalid_amount');
    expect(state.resources[tierOneOre]).toBe(10);
  });

  it('refuses to sell a resource that has never been mined', () => {
    const state = createInitialState();

    expect(sellAmount(state, tierOneOre, 1).reason).toBe('insufficient_resource');
  });
});

describe('sellAll', () => {
  it('sells every stored resource and reports the totals', () => {
    const state = createInitialState();
    const gem = resourceOfCategory(2, RESOURCE_CATEGORIES.GEMS).id;
    state.resources[tierOneOre] = 5;
    state.resources[gem] = 2;
    const expected = sellValue(tierOneOre, 5) + sellValue(gem, 2);

    const result = sellAll(state);

    expect(result.ok).toBe(true);
    expect(state.currency).toBeCloseTo(expected, 10);
    expect(state.resources).toEqual({});
  });

  it('sells only the requested resource when given an id', () => {
    const state = createInitialState();
    const gem = resourceOfCategory(2, RESOURCE_CATEGORIES.GEMS).id;
    state.resources[tierOneOre] = 5;
    state.resources[gem] = 2;

    const result = sellAll(state, gem);

    expect(result.ok).toBe(true);
    expect(state.resources).toEqual({ [tierOneOre]: 5 });
  });

  it('succeeds without changing currency when the mine is empty', () => {
    const state = createInitialState();

    const result = sellAll(state);

    expect(result.ok).toBe(true);
    expect(state.currency).toBe(0);
  });

  it('refuses to sell an unknown resource', () => {
    const state = createInitialState();

    expect(sellAll(state, 'not-a-resource')).toEqual({
      ok: false,
      reason: 'unknown_resource',
    });
  });
});

describe('sellCategory', () => {
  it('sells the active tier resource of that category and banks the rest', () => {
    const state = createInitialState();
    state.depthTier = 2;
    const surfaceOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE).id;
    const copper = resourceOfCategory(2, RESOURCE_CATEGORIES.ORE).id;
    const quartz = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS).id;
    state.resources[surfaceOre] = 7;
    state.resources[copper] = 5;
    state.resources[quartz] = 3;

    const result = sellCategory(state, RESOURCE_CATEGORIES.ORE);

    expect(result.ok).toBe(true);
    expect(result.resourceId).toBe(copper);
    expect(result.amount).toBe(5);
    expect(result.value).toBeCloseTo(sellValue(copper, 5), 10);
    // Only the tier being worked is sold: the shallower ore and the gems stay in the inventory.
    expect(state.resources).toEqual({ [surfaceOre]: 7, [quartz]: 3 });
  });

  it('credits the earnings and reports the new balance', () => {
    const state = createInitialState();
    const quartz = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS).id;
    state.resources[quartz] = 4;

    const result = sellCategory(state, RESOURCE_CATEGORIES.GEMS);

    expect(state.currency).toBeCloseTo(sellValue(quartz, 4), 10);
    expect(result.currency).toBe(state.currency);
    expect(state.stats.totalEarned).toBeCloseTo(sellValue(quartz, 4), 10);
  });

  it('refuses an unknown category with state byte-for-byte unchanged', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 5;
    const before = structuredClone(state);

    const result = sellCategory(state, 'not-a-category');

    expect(result).toEqual({ ok: false, reason: 'unknown_category' });
    expect(state).toEqual(before);
  });

  it('refuses when that category holds nothing, with state byte-for-byte unchanged', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 5;
    const before = structuredClone(state);

    const result = sellCategory(state, RESOURCE_CATEGORIES.RARE);

    expect(result).toEqual({ ok: false, reason: 'insufficient_resource' });
    expect(state).toEqual(before);
  });

  it('refuses to sell a category when the active tier has no such resource', () => {
    const state = createInitialState();
    state.depthTier = config.depth.tierCount + 1;
    state.resources[tierOneOre] = 5;
    const before = structuredClone(state);

    const result = sellCategory(state, RESOURCE_CATEGORIES.ORE);

    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe('sellAmount refusals', () => {
  it('refuses a non-positive amount with state byte-for-byte unchanged', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 5;
    const before = structuredClone(state);

    for (const amount of [0, -5, Number.NaN]) {
      expect(sellAmount(state, tierOneOre, amount)).toEqual({
        ok: false,
        reason: 'invalid_amount',
      });
    }
    expect(state).toEqual(before);
  });

  it('refuses an amount above the inventory with state byte-for-byte unchanged', () => {
    const state = createInitialState();
    state.resources[tierOneOre] = 4;
    const before = structuredClone(state);

    expect(sellAmount(state, tierOneOre, 5)).toEqual({
      ok: false,
      reason: 'insufficient_resource',
    });
    expect(state).toEqual(before);
  });
});
