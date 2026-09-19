/**
 * Prestige upgrade rules: cost, purchase, and the multipliers upgrades contribute.
 *
 * Prestige points are a second, permanent currency: they are earned per run and spent on
 * always-on multipliers that survive every reset, exactly like the prestige multiplier itself.
 * This module imports no other core module, so `prestige.js` can consume points without a cycle.
 */

import { config } from '../data/config.js';
import { getPrestigeUpgrade, prestigeUpgrades } from '../data/prestigeUpgrades.js';
import { M } from './numbers/magnitude.js';

/** The multiplier keys every `upgradeEffects` result carries, defaulting to neutral. */
const EFFECT_KEYS = Object.freeze([
  'productionMultiplier',
  'gemChanceMultiplier',
  'rareChanceMultiplier',
  'offlineCapMultiplier',
]);

export function upgradeLevel(state, id) {
  const level = state?.prestige?.upgrades?.[id];
  return Number.isInteger(level) && level > 0 ? level : 0;
}

/** cost = baseCost * costGrowthRate^level. */
export function upgradeCost(state, id) {
  const definition = getPrestigeUpgrade(id);
  if (!definition) {
    return 0;
  }
  return M.mul(
    definition.baseCost,
    M.pow(definition.costGrowthRate, upgradeLevel(state, id)),
  );
}

export function canBuyUpgrade(state, id) {
  const definition = getPrestigeUpgrade(id);
  if (!definition) {
    return { ok: false, reason: 'unknown_upgrade' };
  }

  const level = upgradeLevel(state, id);
  if (level >= definition.maxLevel) {
    return { ok: false, reason: 'max_level' };
  }

  const cost = upgradeCost(state, id);
  if (M.lt(state?.prestige?.points ?? 0, cost)) {
    return { ok: false, reason: 'insufficient_points', cost };
  }

  return { ok: true, cost, level };
}

/** Buys one level, or returns the refusal with state left byte-for-byte unchanged. */
export function buyUpgrade(state, id) {
  const check = canBuyUpgrade(state, id);
  if (!check.ok) {
    return check;
  }

  state.prestige.points = M.sub(state.prestige.points, check.cost);
  const level = upgradeLevel(state, id) + 1;
  state.prestige.upgrades[id] = level;

  return { ok: true, id, level, cost: check.cost };
}

/**
 * Composed, always-on multipliers from every owned upgrade level.
 *
 * Mirrors `workerEffects`: a plain snapshot the economy consumes, so production and drops never
 * branch on individual upgrades.
 */
export function upgradeEffects(state) {
  const effects = {};
  for (const key of EFFECT_KEYS) {
    effects[key] = 1;
  }

  for (const definition of Object.values(prestigeUpgrades)) {
    const level = upgradeLevel(state, definition.id);
    // Unlock-only upgrades carry no multiplier of their own (`effect: null`).
    if (level > 0 && definition.effect) {
      effects[definition.effect] = M.mul(
        effects[definition.effect],
        M.pow(definition.multiplierPerLevel, level),
      );
    }
  }

  return effects;
}

/** Points a run is worth right now, derived from its earnings on a separate curve. */
export function prestigePointsForRun(state) {
  const earned = M.from(state?.stats?.totalEarned ?? 0);
  if (earned === null || !M.gt(earned, 0)) {
    return 0;
  }

  const raw = M.mul(
    M.div(earned, config.prestige.pointsScale),
    config.prestige.pointsMultiplier,
  );
  const numeric = M.toNumber(raw);
  if (!Number.isFinite(numeric)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, Math.floor(numeric));
}
