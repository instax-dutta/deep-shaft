/**
 * Automation behaviours.
 *
 * Automation is opt-in twice over: a prestige upgrade must be owned *and* the player toggle must
 * be on. Every behaviour runs exactly once per call, in the data-defined order, using the same
 * commands a player uses — so an automated action can never do something a manual one could not,
 * and it is refused the same way when it is not affordable.
 *
 * The same function serves the live tick and the offline catch-up batch, which is why offline
 * automation is one rule rather than a second implementation.
 */

import { AUTOMATION_KINDS, AUTOMATION_ORDER, automationUnlockUpgrade } from '../data/automation.js';
import { config } from '../data/config.js';
import { drills } from '../data/drills.js';
import { canDigDeeper, digDeeper } from './depth.js';
import { buyDrill, drillCost } from './drills.js';
import { M } from './numbers/magnitude.js';
import { upgradeLevel } from './prestigeUpgrades.js';
import { sellAll } from './resources.js';

/** Unlocked only when the gating upgrade is owned *and* the player switched it on. */
export function automationUnlocked(state, kind) {
  if (state?.automation?.[kind] !== true) {
    return false;
  }
  const upgradeId = automationUnlockUpgrade(kind);
  return upgradeId !== null && upgradeLevel(state, upgradeId) > 0;
}

/** Switches one automation behaviour on or off. Unknown kinds are refused, not stored. */
export function setAutomation(state, kind, enabled) {
  if (!Object.values(AUTOMATION_KINDS).includes(kind)) {
    return { ok: false, reason: 'unknown_automation' };
  }
  state.automation[kind] = enabled === true;
  return { ok: true, kind, enabled: state.automation[kind] };
}

/** Cheapest unlocked drill that is affordable and still under the safety bound. */
function cheapestAffordableDrill(state) {
  let best = null;

  for (const definition of Object.values(drills)) {
    if (definition.tier > state.depthTier) {
      continue;
    }
    const owned = state.drills[definition.id] ?? 0;
    if (owned >= config.automation.autoBuySafetyBound) {
      continue;
    }

    const cost = drillCost(definition, owned, 1);
    if (!M.gte(state.currency, cost)) {
      continue;
    }
    if (best === null || M.lt(cost, best.cost)) {
      best = { definition, cost };
    }
  }

  return best;
}

function runAutoSell(state, actions) {
  const result = sellAll(state);
  if (result.ok && M.gt(result.value, 0)) {
    actions.push({ kind: AUTOMATION_KINDS.AUTO_SELL, value: result.value });
  }
}

function runAutoBuy(state, actions) {
  const cheapest = cheapestAffordableDrill(state);
  if (!cheapest) {
    return;
  }

  const result = buyDrill(state, cheapest.definition.id, 'x1');
  if (result.ok) {
    actions.push({
      kind: AUTOMATION_KINDS.AUTO_BUY,
      drillId: cheapest.definition.id,
      quantity: result.quantity,
      cost: result.cost,
    });
  }
}

function runAutoDig(state, actions) {
  if (!canDigDeeper(state).ok) {
    return;
  }

  const result = digDeeper(state);
  if (result.ok) {
    actions.push({ kind: AUTOMATION_KINDS.AUTO_DIG, tier: result.tier, cost: result.cost });
  }
}

/**
 * Runs every enabled behaviour once.
 *
 * Returns the actions it took, so the caller can report them. A no-op interval returns an empty
 * action list rather than a refusal — automation doing nothing is normal, not an error.
 */
export function runAutomation(state, elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { ok: true, actions: [] };
  }

  const actions = [];
  for (const kind of AUTOMATION_ORDER) {
    if (!automationUnlocked(state, kind)) {
      continue;
    }

    if (kind === AUTOMATION_KINDS.AUTO_SELL) {
      runAutoSell(state, actions);
    } else if (kind === AUTOMATION_KINDS.AUTO_BUY) {
      runAutoBuy(state, actions);
    } else if (kind === AUTOMATION_KINDS.AUTO_DIG) {
      runAutoDig(state, actions);
    }
  }

  return { ok: true, actions };
}
