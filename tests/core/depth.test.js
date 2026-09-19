import { describe, expect, it } from 'vitest';

import { buyDrill } from '../../src/core/drills.js';
import { canDigDeeper, digDeeper, digDeeperCost, MAX_DEPTH_TIER } from '../../src/core/depth.js';
import { createInitialState } from '../../src/core/state.js';
import { sellValue } from '../../src/core/resources.js';
import { config } from '../../src/data/config.js';
import { getDrill } from '../../src/data/drills.js';
import { depthTierCost, getDepthTier } from '../../src/data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE);

// Read the ladder from `src/data/` rather than restating it: these tests defend the dig rules,
// not the tuning values, so a P12 rebalance must not need them edited.
const tierTwoCost = depthTierCost(2);
const totalUnlockCost = Array.from(
  { length: MAX_DEPTH_TIER - 1 },
  (_, index) => depthTierCost(index + 2),
).reduce((total, cost) => total + cost, 0);

function mineAtTier(tier) {
  const state = createInitialState();
  state.depthTier = tier;
  return state;
}

describe('digDeeperCost', () => {
  it('charges the configured cost to reach the second tier', () => {
    expect(digDeeperCost(createInitialState())).toBe(config.depth.baseUnlockCost);
  });

  it('stops charging once the shaft is at its deepest', () => {
    expect(digDeeperCost(mineAtTier(MAX_DEPTH_TIER))).toBeNull();
  });
});

describe('canDigDeeper', () => {
  it('reports the next tier and its price when the mine can afford it', () => {
    const state = createInitialState();
    state.currency = tierTwoCost;

    expect(canDigDeeper(state)).toEqual({ ok: true, cost: tierTwoCost, nextTier: 2 });
  });

  it('reports insufficient currency without changing anything', () => {
    const state = createInitialState();
    state.currency = tierTwoCost - 1;

    expect(canDigDeeper(state)).toEqual({
      ok: false,
      reason: 'insufficient_currency',
      cost: tierTwoCost,
    });
  });

  it('reports the deepest shaft as max depth', () => {
    const state = mineAtTier(MAX_DEPTH_TIER);
    state.currency = Number.MAX_SAFE_INTEGER;

    expect(canDigDeeper(state)).toEqual({ ok: false, reason: 'max_depth' });
  });
});

describe('digDeeper', () => {
  it('advances to the next tier and charges the cost', () => {
    const state = createInitialState();
    state.currency = tierTwoCost * 2;

    const result = digDeeper(state);

    expect(result).toEqual({ ok: true, tier: 2, cost: tierTwoCost });
    expect(state.depthTier).toBe(2);
    expect(state.currency).toBe(tierTwoCost);
  });

  it('refuses when the mine cannot pay, leaving depth and currency untouched', () => {
    const state = createInitialState();
    state.currency = tierTwoCost - 1;
    const before = structuredClone(state);

    expect(digDeeper(state)).toEqual({
      ok: false,
      reason: 'insufficient_currency',
      cost: tierTwoCost,
    });
    expect(state).toEqual(before);
  });

  it('refuses at the deepest tier', () => {
    const state = mineAtTier(MAX_DEPTH_TIER);
    state.currency = Number.MAX_SAFE_INTEGER;
    const before = structuredClone(state);

    expect(digDeeper(state)).toEqual({ ok: false, reason: 'max_depth' });
    expect(state).toEqual(before);
  });

  it('climbs one tier at a time through every configured tier', () => {
    const state = createInitialState();
    state.currency = totalUnlockCost;

    for (let tier = 2; tier <= MAX_DEPTH_TIER; tier += 1) {
      expect(digDeeper(state).tier).toBe(tier);
      expect(getDepthTier(state.depthTier).tier).toBe(tier);
    }

    expect(state.depthTier).toBe(MAX_DEPTH_TIER);
  });

  it('keeps resources mined from the tier above', () => {
    const state = createInitialState();
    state.currency = tierTwoCost;
    state.resources[tierOneOre.id] = 20;

    digDeeper(state);

    expect(state.resources[tierOneOre.id]).toBe(20);
    expect(sellValue(tierOneOre.id, 20)).toBeGreaterThan(0);
  });

  it('unlocks the deeper drill tiers that come with the new depth', () => {
    const state = createInitialState();
    state.currency = totalUnlockCost;
    const deepDrill = getDrill('drill-3');

    expect(buyDrill(state, deepDrill.id, 'x1')).toEqual({
      ok: false,
      reason: 'drill_locked',
    });

    digDeeper(state);
    digDeeper(state);

    expect(state.depthTier).toBe(3);
    expect(buyDrill(state, deepDrill.id, 'x1').ok).toBe(true);
  });

  it('switches production to the new tier resources', () => {
    const state = createInitialState();
    state.currency = tierTwoCost;
    state.drills['drill-1'] = 1;

    digDeeper(state);

    expect(resourceOfCategory(state.depthTier, RESOURCE_CATEGORIES.ORE).name).toBe('Copper');
  });
});
