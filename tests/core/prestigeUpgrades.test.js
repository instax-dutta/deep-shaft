import { describe, expect, it } from 'vitest';

import { M } from '../../src/core/numbers/magnitude.js';
import { performPrestige, prestigePreview } from '../../src/core/prestige.js';
import {
  buyUpgrade,
  canBuyUpgrade,
  prestigePointsForRun,
  upgradeCost,
  upgradeEffects,
  upgradeLevel,
} from '../../src/core/prestigeUpgrades.js';
import { extractionRatePerSecond, productionPerSecond } from '../../src/core/production.js';
import { creditEarnings } from '../../src/core/resources.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { PRESTIGE_UPGRADE_IDS, prestigeUpgrades } from '../../src/data/prestigeUpgrades.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const PRODUCTION = PRESTIGE_UPGRADE_IDS.PRODUCTION;

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

describe('fresh mine upgrades', () => {
  it('a fresh mine has no points and no upgrade levels', () => {
    const state = createInitialState();

    expect(state.prestige.points).toBe(0);
    expect(state.prestige.upgrades).toEqual({});
    expect(upgradeLevel(state, PRODUCTION)).toBe(0);
  });
});

describe('upgrade cost curve', () => {
  it('upgrade cost follows the configured exponential curve', () => {
    const definition = prestigeUpgrades[PRODUCTION];
    const state = createInitialState();

    expect(M.toNumber(upgradeCost(state, PRODUCTION))).toBeCloseTo(definition.baseCost, 10);

    state.prestige.upgrades[PRODUCTION] = 2;
    expect(M.toNumber(upgradeCost(state, PRODUCTION))).toBeCloseTo(
      definition.baseCost * definition.costGrowthRate ** 2,
      10,
    );
  });
});

describe('buying upgrades', () => {
  it('buying an upgrade spends exactly its cost and raises its level by one', () => {
    const state = createInitialState();
    state.prestige.points = 10;
    const cost = M.toNumber(upgradeCost(state, PRODUCTION));

    const result = buyUpgrade(state, PRODUCTION);

    expect(result.ok).toBe(true);
    expect(result.level).toBe(1);
    expect(state.prestige.upgrades[PRODUCTION]).toBe(1);
    expect(state.prestige.points).toBeCloseTo(10 - cost, 10);
  });

  it('an upgrade cannot be bought past its max level', () => {
    const definition = prestigeUpgrades[PRODUCTION];
    const state = createInitialState();
    state.prestige.points = 1e9;
    state.prestige.upgrades[PRODUCTION] = definition.maxLevel;

    const result = buyUpgrade(state, PRODUCTION);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('max_level');
  });

  it('buying without enough points is refused and leaves state byte-for-byte unchanged', () => {
    const state = createInitialState();
    state.prestige.points = 0;
    const before = snapshot(state);

    const result = buyUpgrade(state, PRODUCTION);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_points');
    expect(state).toEqual(before);
  });

  it('an unknown upgrade id is refused', () => {
    const state = createInitialState();

    expect(canBuyUpgrade(state, 'not-an-upgrade').reason).toBe('unknown_upgrade');
    expect(buyUpgrade(state, 'not-an-upgrade').ok).toBe(false);
  });
});

describe('upgrade effects', () => {
  it('upgrade effects compose multiplicatively across owned levels', () => {
    const definition = prestigeUpgrades[PRODUCTION];
    const state = createInitialState();
    state.prestige.upgrades[PRODUCTION] = 2;

    const effects = upgradeEffects(state);

    expect(M.toNumber(effects.productionMultiplier)).toBeCloseTo(
      definition.multiplierPerLevel ** 2,
      10,
    );
    expect(M.toNumber(effects.gemChanceMultiplier)).toBe(1);
  });

  it('a production upgrade raises extraction rate by its stated multiplier', () => {
    const definition = prestigeUpgrades[PRODUCTION];
    const base = createInitialState();
    base.drills = { 'drill-1': 1 };
    const boosted = createInitialState();
    boosted.drills = { 'drill-1': 1 };
    boosted.prestige.upgrades[PRODUCTION] = 1;

    expect(M.toNumber(extractionRatePerSecond(boosted))).toBeCloseTo(
      M.toNumber(extractionRatePerSecond(base)) * definition.multiplierPerLevel,
      10,
    );
  });

  it('a rare-find upgrade raises the rare drop chance but not ore output', () => {
    const definition = prestigeUpgrades[PRESTIGE_UPGRADE_IDS.RARE_CHANCE];
    const base = createInitialState();
    base.drills = { 'drill-1': 1 };
    const boosted = createInitialState();
    boosted.drills = { 'drill-1': 1 };
    boosted.prestige.upgrades[PRESTIGE_UPGRADE_IDS.RARE_CHANCE] = 1;

    const rare = resourceOfCategory(1, RESOURCE_CATEGORIES.RARE);
    const ore = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE);

    expect(M.toNumber(productionPerSecond(boosted)[rare.id])).toBeCloseTo(
      M.toNumber(productionPerSecond(base)[rare.id]) * definition.multiplierPerLevel,
      10,
    );
    expect(M.toNumber(productionPerSecond(boosted)[ore.id])).toBeCloseTo(
      M.toNumber(productionPerSecond(base)[ore.id]),
      10,
    );
  });
});

describe('prestige points', () => {
  it('prestige grants points derived from the run and preserves them across the reset', () => {
    const state = createInitialState();
    creditEarnings(state, config.prestige.thresholdCurrency * 3);
    const expected = prestigePointsForRun(state);

    const result = performPrestige(state);

    expect(expected).toBe(3);
    expect(result.ok).toBe(true);
    expect(result.points).toBe(3);
    expect(state.prestige.points).toBe(3);
  });

  it('purchased upgrade levels survive a later prestige', () => {
    const state = createInitialState();
    creditEarnings(state, config.prestige.thresholdCurrency * 4);
    performPrestige(state);
    buyUpgrade(state, PRODUCTION);

    creditEarnings(state, config.prestige.thresholdCurrency * 2);
    performPrestige(state);

    expect(state.prestige.upgrades[PRODUCTION]).toBe(1);
    expect(state.prestige.points).toBeGreaterThan(3);
  });

  it('the prestige preview reports the points the run earned', () => {
    const state = createInitialState();
    creditEarnings(state, config.prestige.thresholdCurrency * 5);

    expect(prestigePreview(state).points).toBe(prestigePointsForRun(state));
  });
});
