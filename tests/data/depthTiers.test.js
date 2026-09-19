import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';
import { depthTiers, depthTierCost, getDepthTier } from '../../src/data/depthTiers.js';

const tiers = Object.values(depthTiers);

describe('depth tier definitions', () => {
  it('configures exactly the tiers the balance calls for', () => {
    expect(tiers).toHaveLength(config.depth.tierCount);
  });

  it('numbers tiers sequentially from 1', () => {
    expect(tiers.map((tier) => tier.tier)).toEqual(
      Array.from({ length: config.depth.tierCount }, (_, index) => index + 1),
    );
  });

  it('keys every definition by its own tier as a stable id', () => {
    for (const [key, definition] of Object.entries(depthTiers)) {
      expect(key).toBe(definition.id);
    }
  });

  it('gives every tier a non-empty, unique name', () => {
    const names = tiers.map((tier) => tier.name);

    for (const name of names) {
      expect(name.length).toBeGreaterThan(0);
    }
    expect(new Set(names).size).toBe(names.length);
  });

  it('makes the first tier free and every later tier cost more than the last', () => {
    expect(depthTierCost(1)).toBe(0);

    for (let tier = 3; tier <= config.depth.tierCount; tier += 1) {
      expect(depthTierCost(tier)).toBeGreaterThan(depthTierCost(tier - 1));
    }
  });

  it('scales unlock costs by the configured growth rate', () => {
    const firstPaid = depthTierCost(2);
    const secondPaid = depthTierCost(3);

    expect(firstPaid).toBe(config.depth.baseUnlockCost);
    expect(secondPaid).toBeCloseTo(firstPaid * config.depth.unlockCostGrowthRate, 6);
  });

  it('starts at the surface and gets deeper with every tier', () => {
    expect(depthTiers.tier1.depthMeters).toBe(0);

    for (let tier = 2; tier <= config.depth.tierCount; tier += 1) {
      expect(depthTiers[`tier${tier}`].depthMeters).toBeGreaterThan(
        depthTiers[`tier${tier - 1}`].depthMeters,
      );
    }
  });

  it('returns null for a tier that does not exist', () => {
    expect(getDepthTier(0)).toBeNull();
    expect(getDepthTier(config.depth.tierCount + 1)).toBeNull();
    expect(getDepthTier(1.5)).toBeNull();
  });
});
