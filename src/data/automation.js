/**
 * Automation content.
 *
 * Each automation kind is unlocked by a prestige upgrade and then switched on by a player
 * toggle. Unlocking costs points; turning it on is opt-in, so an idle-prone behaviour like
 * auto-dig never surprises a player who has not asked for it.
 */

import { PRESTIGE_UPGRADE_IDS } from './prestigeUpgrades.js';

export const AUTOMATION_KINDS = Object.freeze({
  AUTO_SELL: 'autoSell',
  AUTO_BUY: 'autoBuy',
  AUTO_DIG: 'autoDig',
});

/** Behaviours run in this order each tick: liquidate, reinvest, then expand. */
export const AUTOMATION_ORDER = Object.freeze([
  AUTOMATION_KINDS.AUTO_SELL,
  AUTOMATION_KINDS.AUTO_BUY,
  AUTOMATION_KINDS.AUTO_DIG,
]);

const UNLOCK_UPGRADES = Object.freeze({
  [AUTOMATION_KINDS.AUTO_SELL]: PRESTIGE_UPGRADE_IDS.AUTOMATION_SELL,
  [AUTOMATION_KINDS.AUTO_BUY]: PRESTIGE_UPGRADE_IDS.AUTOMATION_BUY,
  [AUTOMATION_KINDS.AUTO_DIG]: PRESTIGE_UPGRADE_IDS.AUTOMATION_DIG,
});

export const AUTOMATION_LABELS = Object.freeze({
  [AUTOMATION_KINDS.AUTO_SELL]: 'Auto-sell',
  [AUTOMATION_KINDS.AUTO_BUY]: 'Auto-buy drills',
  [AUTOMATION_KINDS.AUTO_DIG]: 'Auto-dig deeper',
});

/** The prestige upgrade that unlocks a kind, or `null` for an unknown kind. */
export function automationUnlockUpgrade(kind) {
  return UNLOCK_UPGRADES[kind] ?? null;
}
