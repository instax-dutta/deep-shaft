/**
 * Drop rolls: turning extraction into ore, gems, and rare minerals.
 *
 * Two shapes of the same rule live here on purpose:
 *
 * - `rollExtraction` is the discrete, stochastic roll — used where an individual extraction is
 *   visible (tests, and any per-tap flourish added later).
 * - `expectedYieldsPerSecond` is its closed form. Continuous time cannot be rolled second by
 *   second, and offline catch-up over a 24-hour absence certainly cannot, so the live loop and
 *   the offline batch both use the expectation. One rule, one source of truth, no divergence.
 *
 * Randomness is always injected, so every branch is verifiable without luck.
 */

import { RESOURCE_CATEGORIES, resourceOfCategory } from '../data/resources.js';
import { M } from './numbers/magnitude.js';
import { upgradeEffects } from './prestigeUpgrades.js';

const CATEGORY_ORDER = Object.freeze([
  RESOURCE_CATEGORIES.ORE,
  RESOURCE_CATEGORIES.GEMS,
  RESOURCE_CATEGORIES.RARE,
]);

/** Luck is a fraction of the base chance: 0.25 means +25%. */
export function luckMultiplier(workerLuck = 0) {
  const luck = Number.isFinite(workerLuck) && workerLuck > 0 ? workerLuck : 0;
  return 1 + luck;
}

function readEffects({ workerLuck = 0, categorySpeed = {} } = {}) {
  return { workerLuck, categorySpeed };
}

/** Prestige upgrades sharpen gems and rare minerals; ore is unaffected. */
function categoryUpgradeMultiplier(upgrades, category) {
  if (category === RESOURCE_CATEGORIES.GEMS) {
    return M.toNumber(upgrades.gemChanceMultiplier);
  }
  if (category === RESOURCE_CATEGORIES.RARE) {
    return M.toNumber(upgrades.rareChanceMultiplier);
  }
  return 1;
}

/**
 * Chance per extraction for every resource of the active tier.
 *
 * Ore is always certain (chance 1), so luck cannot push a category past certainty. Workers put
 * on a category sharpen its chances; ore has no chance to sharpen, so a worker on ore is
 * expressed as a yield multiplier in `yieldFactorsFor` instead.
 */
export function dropChancesFor(state, effects = {}) {
  const { workerLuck, categorySpeed } = readEffects(effects);
  const multiplier = luckMultiplier(workerLuck);
  const upgrades = upgradeEffects(state);
  const chances = {};

  for (const category of CATEGORY_ORDER) {
    const definition = resourceOfCategory(state.depthTier, category);
    if (!definition) {
      continue;
    }
    const speed = categorySpeed[category] ?? 0;
    const chance = category === RESOURCE_CATEGORIES.ORE
      ? definition.dropChance
      : definition.dropChance * (1 + speed) * multiplier * categoryUpgradeMultiplier(upgrades, category);
    chances[definition.id] = Math.min(1, chance);
  }

  return chances;
}

/**
 * Resource units produced per extraction, for every resource of the active tier.
 *
 * Ore yields one unit per extraction, multiplied by any worker put on ore. Gems and rare
 * minerals yield a fraction of an extraction, capped at one find per extraction — no worker can
 * unearth more gems than the drills dig.
 */
export function yieldFactorsFor(state, effects = {}) {
  const { workerLuck, categorySpeed } = readEffects(effects);
  const multiplier = luckMultiplier(workerLuck);
  const upgrades = upgradeEffects(state);
  const factors = {};

  for (const category of CATEGORY_ORDER) {
    const definition = resourceOfCategory(state.depthTier, category);
    if (!definition) {
      continue;
    }

    const speed = categorySpeed[category] ?? 0;
    // Luck sharpens rare finds; it must not inflate common ore output. Prestige upgrades
    // sharpen gems and rare minerals only.
    const luck = category === RESOURCE_CATEGORIES.ORE ? 1 : multiplier;
    const raw =
      definition.dropChance *
      (1 + speed) *
      luck *
      categoryUpgradeMultiplier(upgrades, category);
    factors[definition.id] = category === RESOURCE_CATEGORIES.ORE ? raw : Math.min(1, raw);
  }

  return factors;
}

function rollSuccesses(attempts, chance, random) {
  if (chance >= 1) {
    return attempts;
  }
  if (chance <= 0) {
    return 0;
  }

  let wins = 0;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const roll = random();
    // A broken random source is treated as a miss, never as a jackpot.
    if (Number.isFinite(roll) && roll < chance) {
      wins += 1;
    }
  }
  return wins;
}

/**
 * Rolls `extractions` individual extractions and reports how much of each resource was found.
 *
 * @param {object} state - Game state snapshot.
 * @param {number} extractions - Whole extraction count to roll.
 * @param {{ random?: () => number, workerLuck?: number }} [options]
 */
export function rollExtraction(state, extractions, { random = Math.random, ...effects } = {}) {
  const yields = {};
  const attempts = Number.isFinite(extractions) && extractions > 0 ? Math.floor(extractions) : 0;
  if (attempts <= 0) {
    return yields;
  }

  for (const [resourceId, chance] of Object.entries(dropChancesFor(state, effects))) {
    const found = rollSuccesses(attempts, chance, random);
    if (found > 0) {
      yields[resourceId] = found;
    }
  }

  return yields;
}

/**
 * Expected yield per second for each resource of the active tier.
 *
 * Because ore is certain, ore output equals the full extraction rate; gems and rare minerals
 * are scaled down by their drop chance.
 */
export function expectedYieldsPerSecond(state, extractionRate, effects = {}) {
  const yields = {};
  if (!M.gt(extractionRate, 0)) {
    return yields;
  }

  for (const [resourceId, factor] of Object.entries(yieldFactorsFor(state, effects))) {
    const rate = M.mul(extractionRate, factor);
    if (M.gt(rate, 0)) {
      yields[resourceId] = rate;
    }
  }

  return yields;
}
