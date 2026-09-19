/**
 * Resource rules: manual extraction, inventories, and selling.
 *
 * State transitions here are *controlled mutations* of the single state object owned by the
 * composition layer. Every command validates before it mutates, so a rejected action returns
 * a structured failure and leaves the state byte-for-byte unchanged.
 */

import { config } from '../data/config.js';
import { RESOURCE_CATEGORIES, getResource, resourceOfCategory } from '../data/resources.js';
import { M } from './numbers/magnitude.js';

/** Unit sell value of one resource at its own depth tier. */
export function sellValue(resourceId, amount) {
  const definition = getResource(resourceId);
  if (!definition || !M.gt(amount, 0)) {
    return 0;
  }

  const growth = config.economy.resourceValueGrowthPerTier[definition.category] ?? 1;
  return M.mul(M.mul(amount, definition.baseUnitValue), M.pow(growth, definition.depthTier - 1));
}

export function inventoryOf(state, resourceId) {
  return state.resources[resourceId] ?? 0;
}

function addToInventory(state, resourceId, amount) {
  state.resources[resourceId] = M.add(inventoryOf(state, resourceId), amount);
}

function removeFromInventory(state, resourceId, amount) {
  const remaining = M.sub(inventoryOf(state, resourceId), amount);
  if (M.gt(remaining, 0)) {
    state.resources[resourceId] = remaining;
  } else {
    delete state.resources[resourceId];
  }
}

/** Adds currency and records it as run progress for the prestige multiplier. */
export function creditEarnings(state, amount) {
  state.currency = M.add(state.currency, amount);
  state.stats.totalEarned = M.add(state.stats.totalEarned, amount);
  state.prestige.lifetimeEarned = M.add(state.prestige.lifetimeEarned, amount);
}

/**
 * The tutorial action: tap the shaft to extract a little ore from the active tier.
 *
 * Only ore is produced; gems and rare minerals come from automated extraction.
 */
export function mineManually(state) {
  const ore = resourceOfCategory(state.depthTier, RESOURCE_CATEGORIES.ORE);
  if (!ore) {
    return { ok: false, reason: 'no_ore_at_depth' };
  }

  const amount = config.production.manualOrePerExtraction;
  addToInventory(state, ore.id, amount);
  state.stats.manualExtractions += 1;

  return { ok: true, resourceId: ore.id, amount };
}

function isSellableAmount(amount) {
  return M.gt(amount, 0) && M.toNumber(amount) !== Number.POSITIVE_INFINITY;
}

/** Sells a specific quantity of one resource for currency. */
export function sellResource(state, resourceId, amount) {
  if (!getResource(resourceId)) {
    return { ok: false, reason: 'unknown_resource' };
  }
  if (!isSellableAmount(amount)) {
    return { ok: false, reason: 'invalid_amount' };
  }
  if (M.lt(inventoryOf(state, resourceId), amount)) {
    return { ok: false, reason: 'insufficient_resource' };
  }

  const value = sellValue(resourceId, amount);
  removeFromInventory(state, resourceId, amount);
  creditEarnings(state, value);

  return { ok: true, resourceId, amount, value, currency: state.currency };
}

/**
 * Sells the whole inventory, or the whole inventory of one resource when an id is given.
 */
export function sellAll(state, resourceId = null) {
  if (resourceId !== null && !getResource(resourceId)) {
    return { ok: false, reason: 'unknown_resource' };
  }

  const ids = resourceId === null ? Object.keys(state.resources) : [resourceId];
  const sold = {};
  let value = 0;

  for (const id of ids) {
    const amount = inventoryOf(state, id);
    if (!M.gt(amount, 0)) {
      continue;
    }

    sold[id] = amount;
    value = M.add(value, sellValue(id, amount));
    delete state.resources[id];
  }

  creditEarnings(state, value);

  return { ok: true, sold, value, currency: state.currency };
}
