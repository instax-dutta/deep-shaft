/**
 * Drill purchase rules: exponential cost curve, bulk purchase modes, and tier gating.
 *
 * State transitions are controlled mutations of the owned state object. Rejected purchases
 * return a structured failure without touching currency or drill counts.
 */

import { config } from '../data/config.js';
import { getDrill } from '../data/drills.js';
import { M } from './numbers/magnitude.js';

/** Purchase quantities offered to the player. `max` buys every affordable unit. */
export const PURCHASE_MODES = Object.freeze({
  X1: 'x1',
  X10: 'x10',
  MAX: 'max',
});

const FIXED_MODE_QUANTITIES = Object.freeze({
  [PURCHASE_MODES.X1]: 1,
  [PURCHASE_MODES.X10]: 10,
});

/** Safety bound so a degenerate cost curve can never spin forever. */
const MAX_BULK_QUANTITY = 1_000;

function isPurchaseMode(mode) {
  return mode === PURCHASE_MODES.MAX || Object.prototype.hasOwnProperty.call(FIXED_MODE_QUANTITIES, mode);
}

/**
 * Total cost of buying `quantity` drills when `ownedCount` are already owned.
 *
 * cost = baseCost * growthRate^(ownedCount + i) summed across every unit bought, so buying in
 * bulk costs exactly what buying one at a time would.
 */
export function drillCost(definition, ownedCount, quantity) {
  if (!definition || !Number.isInteger(quantity) || quantity <= 0) {
    return 0;
  }

  const growth = config.economy.drillCostGrowthRate;
  let total = 0;
  for (let index = 0; index < quantity; index += 1) {
    total = M.add(total, M.mul(definition.baseCost, M.pow(growth, ownedCount + index)));
  }
  return total;
}

/** Largest quantity whose total cost fits inside `currency`. */
export function maxAffordable(definition, ownedCount, currency) {
  if (!definition || !M.gt(currency, 0)) {
    return 0;
  }

  const growth = config.economy.drillCostGrowthRate;
  let quantity = 0;
  let total = 0;

  while (quantity < MAX_BULK_QUANTITY) {
    const nextUnit = M.mul(definition.baseCost, M.pow(growth, ownedCount + quantity));
    if (M.gt(M.add(total, nextUnit), currency)) {
      break;
    }
    total = M.add(total, nextUnit);
    quantity += 1;
  }

  return quantity;
}

function isTierUnlocked(state, definition) {
  return definition.tier <= state.depthTier;
}

/** Buys drills in the requested mode, or reports why the purchase was refused. */
export function buyDrill(state, drillId, mode) {
  const definition = getDrill(drillId);
  if (!definition) {
    return { ok: false, reason: 'unknown_drill' };
  }
  if (!isPurchaseMode(mode)) {
    return { ok: false, reason: 'invalid_mode' };
  }
  if (!isTierUnlocked(state, definition)) {
    return { ok: false, reason: 'drill_locked' };
  }

  const owned = state.drills[drillId] ?? 0;
  const quantity =
    mode === PURCHASE_MODES.MAX
      ? maxAffordable(definition, owned, state.currency)
      : FIXED_MODE_QUANTITIES[mode];

  if (quantity < 1) {
    return { ok: false, reason: 'insufficient_currency' };
  }

  const cost = drillCost(definition, owned, quantity);
  if (M.gt(cost, state.currency)) {
    return { ok: false, reason: 'insufficient_currency' };
  }

  state.currency = M.sub(state.currency, cost);
  state.drills[drillId] = owned + quantity;

  return { ok: true, drillId, quantity, cost, currency: state.currency };
}
