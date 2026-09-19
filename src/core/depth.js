/**
 * Depth rules: the manual Dig Deeper purchase.
 *
 * Digging is a deliberate, discrete spend rather than a background process — it is the decision
 * that re-shapes the whole economy, so it is validated and reported like any other command.
 */

import { config } from '../data/config.js';
import { depthTierCost, getDepthTier } from '../data/depthTiers.js';
import { M } from './numbers/magnitude.js';

export const MAX_DEPTH_TIER = config.depth.tierCount;

/** Cost of the next tier, or `null` when the shaft is already at its deepest. */
export function digDeeperCost(state) {
  const nextTier = state.depthTier + 1;
  if (nextTier > MAX_DEPTH_TIER) {
    return null;
  }
  return depthTierCost(nextTier);
}

/** Whether the next tier can be unlocked right now, and why not when it cannot. */
export function canDigDeeper(state) {
  const cost = digDeeperCost(state);
  if (cost === null) {
    return { ok: false, reason: 'max_depth' };
  }
  if (M.lt(state.currency, cost)) {
    return { ok: false, reason: 'insufficient_currency', cost };
  }
  return { ok: true, cost, nextTier: state.depthTier + 1 };
}

/**
 * Unlocks the next depth tier.
 *
 * Resources already mined from the tier above stay in the inventory — they remain sellable, so
 * there is no reason to lose them.
 */
export function digDeeper(state) {
  const check = canDigDeeper(state);
  if (!check.ok) {
    return check;
  }

  state.currency = M.sub(state.currency, check.cost);
  state.depthTier = check.nextTier;

  return { ok: true, tier: state.depthTier, cost: check.cost };
}

/** Display name of the tier the mine is currently working. */
export function currentTierName(state) {
  return getDepthTier(state.depthTier)?.name ?? 'Unknown depth';
}
