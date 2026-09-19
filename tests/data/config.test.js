import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';

describe('balance configuration', () => {
  it('is deeply frozen so tuning values cannot be mutated at runtime', () => {
    expect(Object.isFrozen(config)).toBe(true);
    for (const group of Object.values(config)) {
      expect(Object.isFrozen(group)).toBe(true);
    }
  });

  it('centralizes the exponential drill cost growth rate', () => {
    expect(config.economy.drillCostGrowthRate).toBeGreaterThan(1);
  });

  it('centralizes the worker unlock milestone in currency', () => {
    expect(config.workers.unlockCurrency).toBeGreaterThan(0);
  });

  it('centralizes event frequency and severity per depth tier', () => {
    const { minIntervalSeconds, maxIntervalSeconds, caveIn, luckyVein } = config.events;

    expect(minIntervalSeconds).toBeGreaterThan(0);
    expect(maxIntervalSeconds).toBeGreaterThan(minIntervalSeconds);
    expect(caveIn.maxDurationSeconds).toBeGreaterThanOrEqual(caveIn.minDurationSeconds);
    expect(luckyVein.maxDurationSeconds).toBeGreaterThanOrEqual(luckyVein.minDurationSeconds);
    expect(luckyVein.productionMultiplier).toBeGreaterThan(1);
  });

  it('centralizes the offline progress cap as a whole number of seconds', () => {
    expect(Number.isInteger(config.offline.capSeconds)).toBe(true);
    expect(config.offline.capSeconds).toBeGreaterThan(0);
  });

  it('centralizes the prestige multiplier formula constants', () => {
    expect(config.prestige.thresholdCurrency).toBeGreaterThan(0);
    expect(config.prestige.lifetimeScale).toBeGreaterThan(0);
    expect(config.prestige.multiplierPerScale).toBeGreaterThan(0);
  });

  it('configures five depth tiers for v1', () => {
    expect(config.depth.tierCount).toBe(5);
    expect(config.depth.unlockCostGrowthRate).toBeGreaterThan(1);
    expect(config.depth.baseUnlockCost).toBeGreaterThan(0);
  });
});
