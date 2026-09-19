/**
 * Prestige upgrade content definitions.
 *
 * Each upgrade is a permanent, always-on multiplier bought with prestige points. Definitions
 * carry the content and the cost curve only; every formula lives in
 * `src/core/prestigeUpgrades.js`.
 *
 * `effect` names the multiplier the upgrade feeds, and the matching key is read back by
 * `upgradeEffects`. `multiplierPerLevel` compounds: two levels of a 1.1 upgrade give 1.21.
 */

export const PRESTIGE_UPGRADE_IDS = Object.freeze({
  PRODUCTION: 'production',
  GEM_CHANCE: 'gemChance',
  RARE_CHANCE: 'rareChance',
  OFFLINE_CAP: 'offlineCap',
  AUTOMATION_SELL: 'automationSell',
  AUTOMATION_BUY: 'automationBuy',
  AUTOMATION_DIG: 'automationDig',
});

/** cost = baseCost * costGrowthRate^level; points are the currency. */
const DEFINITIONS = [
  {
    id: PRESTIGE_UPGRADE_IDS.PRODUCTION,
    name: 'Deep Core',
    description: 'Every drill digs harder. +10% extraction per level.',
    effect: 'productionMultiplier',
    multiplierPerLevel: 1.1,
    maxLevel: 50,
    baseCost: 1,
    costGrowthRate: 1.6,
  },
  {
    id: PRESTIGE_UPGRADE_IDS.GEM_CHANCE,
    name: 'Gem Sense',
    description: 'Gems turn up more often. +15% gem chance per level.',
    effect: 'gemChanceMultiplier',
    multiplierPerLevel: 1.15,
    maxLevel: 25,
    baseCost: 2,
    costGrowthRate: 1.7,
  },
  {
    id: PRESTIGE_UPGRADE_IDS.RARE_CHANCE,
    name: 'Rare Instinct',
    description: 'Rare minerals surface more often. +25% rare chance per level.',
    effect: 'rareChanceMultiplier',
    multiplierPerLevel: 1.25,
    maxLevel: 20,
    baseCost: 3,
    costGrowthRate: 1.8,
  },
  {
    id: PRESTIGE_UPGRADE_IDS.OFFLINE_CAP,
    name: 'Night Shift',
    description: 'The mine works longer while you are away. +50% offline cap per level.',
    effect: 'offlineCapMultiplier',
    multiplierPerLevel: 1.5,
    maxLevel: 10,
    baseCost: 5,
    costGrowthRate: 2,
  },
  // Unlock upgrades have no multiplier of their own (`effect: null`); buying them turns a
  // behaviour on, and the player toggle decides whether it runs.
  {
    id: PRESTIGE_UPGRADE_IDS.AUTOMATION_SELL,
    name: 'Ore Contracts',
    description: 'Unlocks auto-sell, which banks your whole inventory each tick.',
    effect: null,
    multiplierPerLevel: 1,
    maxLevel: 1,
    baseCost: 3,
    costGrowthRate: 1,
  },
  {
    id: PRESTIGE_UPGRADE_IDS.AUTOMATION_BUY,
    name: 'Foreman Bots',
    description: 'Unlocks auto-buy, which purchases the cheapest affordable drill each tick.',
    effect: null,
    multiplierPerLevel: 1,
    maxLevel: 1,
    baseCost: 5,
    costGrowthRate: 1,
  },
  {
    id: PRESTIGE_UPGRADE_IDS.AUTOMATION_DIG,
    name: 'Shaft Survey',
    description: 'Unlocks auto-dig, which advances depth whenever the next tier is affordable.',
    effect: null,
    multiplierPerLevel: 1,
    maxLevel: 1,
    baseCost: 8,
    costGrowthRate: 1,
  },
];

function createUpgrades() {
  const upgrades = {};
  for (const entry of DEFINITIONS) {
    upgrades[entry.id] = Object.freeze({ ...entry });
  }
  return Object.freeze(upgrades);
}

/** Frozen map of upgrade id to definition, in display order. */
export const prestigeUpgrades = createUpgrades();

export function getPrestigeUpgrade(id) {
  return Object.prototype.hasOwnProperty.call(prestigeUpgrades, id)
    ? prestigeUpgrades[id]
    : null;
}
