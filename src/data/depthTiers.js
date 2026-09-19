/**
 * Depth tier definitions.
 *
 * Depth is the game's main pacing lever: each tier reveals a new resource set, raises the drill
 * ceiling, and multiplies every drill's output. Unlock costs follow the curve configured in
 * `config.depth`, so retuning the ladder never means editing gameplay code.
 */

import { config } from './config.js';

/** Content for each tier. Order defines depth: first entry is the surface. */
const TIER_CONTENT = [
  { name: 'Surface Cut', depthMeters: 0 },
  { name: 'Upper Seam', depthMeters: 25 },
  { name: 'Deep Gallery', depthMeters: 80 },
  { name: 'Basalt Vault', depthMeters: 220 },
  { name: 'Abyssal Core', depthMeters: 600 },
];

function createDepthTiers() {
  const tiers = {};

  TIER_CONTENT.forEach((entry, index) => {
    const tier = index + 1;
    tiers[`tier${tier}`] = Object.freeze({
      id: `tier${tier}`,
      tier,
      name: entry.name,
      /** How far below the surface this stratum sits. */
      depthMeters: entry.depthMeters,
      /** Tier 1 is where the mine starts; every later tier is a purchase. */
      unlockCost: tier === 1 ? 0 : config.depth.baseUnlockCost * config.depth.unlockCostGrowthRate ** (tier - 2),
    });
  });

  return Object.freeze(tiers);
}

/** Frozen map of tier id to definition. */
export const depthTiers = createDepthTiers();

export const deepestTier = Object.keys(depthTiers).length;

export function getDepthTier(tier) {
  if (!Number.isInteger(tier) || tier < 1 || tier > deepestTier) {
    return null;
  }
  return depthTiers[`tier${tier}`];
}

/** Currency needed to unlock a tier. Returns 0 for the starting tier. */
export function depthTierCost(tier) {
  return getDepthTier(tier)?.unlockCost ?? 0;
}
