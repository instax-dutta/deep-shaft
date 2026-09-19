/**
 * Automatic production from owned drills.
 *
 * Production is a pure function of state, so the same math serves the live game loop and the
 * offline catch-up batch. Fractional output is preserved: rounding happens only when values
 * are formatted for display.
 */

import { config } from '../data/config.js';
import { getDrill } from '../data/drills.js';
import { expectedYieldsPerSecond } from './drops.js';
import { activeModifiers } from './events.js';
import { M } from './numbers/magnitude.js';
import { upgradeEffects } from './prestigeUpgrades.js';
import { workerEffects } from './workers.js';

/** Depth makes every drill more productive — the main pacing lever for digging deeper. */
export function depthOutputMultiplier(depthTier) {
  const tier = Number.isFinite(depthTier) ? Math.max(1, Math.floor(depthTier)) : 1;
  return config.production.depthOutputGrowth ** (tier - 1);
}

/**
 * Combined output of every owned drill, including workers put on a specific drill.
 *
 * A worker assigned to a drill only lifts that drill, which is what makes assignment a choice
 * rather than a flat global bonus.
 */
export function drillOutput(state, modifiers = activeModifiers(state)) {
  const { drillSpeed } = workerEffects(state);
  const stopped = new Set(modifiers.disabledDrillIds);
  let output = 0;

  for (const [drillId, count] of Object.entries(state.drills)) {
    const definition = getDrill(drillId);
    if (!definition || !Number.isFinite(count) || count <= 0 || stopped.has(drillId)) {
      continue;
    }
    output = M.add(
      output,
      M.mul(M.mul(definition.baseOutput, count), 1 + (drillSpeed[drillId] ?? 0)),
    );
  }

  return output;
}

/**
 * Extraction rate in units per second, before drop chances are applied.
 *
 * This is the rate at which the drills dig, which is also exactly the ore rate: ore is always
 * found, while gems and rare minerals are dropped from the same extraction.
 */
export function extractionRatePerSecond(state) {
  const modifiers = activeModifiers(state);
  const output = drillOutput(state, modifiers);
  if (!M.gt(output, 0)) {
    return 0;
  }
  // Prestige upgrades are a sibling effect read, folded in beside the event modifiers so the
  // modifier plumbing stays a flat product of independent multipliers.
  return M.mul(
    M.mul(
      M.mul(M.mul(output, depthOutputMultiplier(state.depthTier)), state.prestige.multiplier),
      modifiers.productionMultiplier,
    ),
    upgradeEffects(state).productionMultiplier,
  );
}

/**
 * Current production rate per resource id, in units per second.
 *
 * Every extraction of the tier the mine currently occupies can yield ore, gems, and rare
 * minerals; ore first, so the primary resource leads the returned object. Assigned workers
 * shape both the extraction rate and the yield factors.
 */
export function productionPerSecond(state) {
  return expectedYieldsPerSecond(
    state,
    extractionRatePerSecond(state),
    workerEffects(state),
  );
}

/**
 * Advances the mine by `elapsedSeconds` and banks the produced resources.
 *
 * Returns the gains so the UI can report them, and ignores non-positive or non-finite spans.
 */
export function advanceProduction(state, elapsedSeconds) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { ok: true, gains: {} };
  }

  const gains = {};

  for (const [resourceId, rate] of Object.entries(productionPerSecond(state))) {
    const amount = M.mul(rate, elapsedSeconds);
    if (!M.gt(amount, 0)) {
      continue;
    }
    gains[resourceId] = amount;
    state.resources[resourceId] = M.add(state.resources[resourceId] ?? 0, amount);
  }

  return { ok: true, gains };
}
