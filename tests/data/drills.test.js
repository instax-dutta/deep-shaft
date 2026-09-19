import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';
import { drills, drillsForTier, getDrill } from '../../src/data/drills.js';

describe('drill definitions', () => {
  it('keys every definition by its own stable id', () => {
    for (const [key, definition] of Object.entries(drills)) {
      expect(definition.id).toBe(key);
    }
  });

  it('numbers drill tiers sequentially from 1', () => {
    const tiers = Object.values(drills)
      .map((definition) => definition.tier)
      .sort((a, b) => a - b);

    expect(tiers).toEqual(Array.from({ length: tiers.length }, (_, index) => index + 1));
  });

  it('offers at least one drill for every configured depth tier', () => {
    for (let tier = 1; tier <= config.depth.tierCount; tier += 1) {
      expect(drillsForTier(tier).length).toBeGreaterThan(0);
    }
  });

  it('uses positive base costs and outputs', () => {
    for (const definition of Object.values(drills)) {
      expect(definition.baseCost).toBeGreaterThan(0);
      expect(definition.baseOutput).toBeGreaterThan(0);
    }
  });

  it('makes each drill tier cost more and produce more than the one before', () => {
    for (let tier = 2; tier <= config.depth.tierCount; tier += 1) {
      const previous = drillsForTier(tier - 1)[0];
      const current = drillsForTier(tier)[0];

      expect(current.baseCost).toBeGreaterThan(previous.baseCost);
      expect(current.baseOutput).toBeGreaterThan(previous.baseOutput);
    }
  });

  it('returns null for an unknown drill id', () => {
    expect(getDrill('not-a-drill')).toBeNull();
  });
});
