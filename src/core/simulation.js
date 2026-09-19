/**
 * Deterministic economy simulation.
 *
 * Pacing claims ("Depth 2 lands inside 10–20 minutes") are only defensible if they are measured, so
 * this module plays the real economy — the same production, drill, depth, resource, prestige, and
 * depth-unlock rules the game runs — against fixed reference strategies, and reports when each
 * milestone was reached.
 *
 * It is pure: no Phaser, no DOM, no clock, and no `Math.random`. The reference strategies model
 * *expectation*, not luck, so a run is reproducible second for second and a pacing number is a
 * property of `src/data/` rather than of one lucky roll.
 */

import { config } from '../data/config.js';
import { drills } from '../data/drills.js';
import { canDigDeeper, digDeeper, digDeeperCost } from './depth.js';
import { buyDrill, drillCost } from './drills.js';
import { M } from './numbers/magnitude.js';
import { canPrestige, performPrestige } from './prestige.js';
import { advanceProduction } from './production.js';
import { mineManually, sellAll } from './resources.js';
import { createInitialState } from './state.js';

/** Reference play styles. Both must stay inside the approved pacing windows. */
export const STRATEGIES = Object.freeze({ GREEDY: 'greedy', BALANCED: 'balanced' });

/**
 * Small, seedable PRNG (mulberry32). Not cryptographic; reproducibility is the point.
 *
 * Exported so a caller can inject a generator (`simulateRun({ random: createRandom(seed) })`)
 * without the signature changing when a stochastic strategy is added. The reference strategies
 * below are expectation-based and deliberately do not consume it.
 */
export function createRandom(seed = 1) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Output produced per unit of currency spent on the next unit — the reinvestment ranking. */
function valuePerCost(definition, owned) {
  const cost = M.toNumber(drillCost(definition, owned, 1));
  return cost > 0 ? definition.baseOutput / cost : 0;
}

/** Total drills owned, across every tier. */
function totalDrills(state) {
  return Object.values(state.drills).reduce(
    (total, count) => total + (Number.isFinite(count) && count > 0 ? count : 0),
    0,
  );
}

/**
 * The opening a real player performs: tap the shaft until the first drill is affordable.
 *
 * Two properties keep this honest rather than free income. It only runs while the mine owns no
 * drills at all — once automation exists the strategy stops tapping, so late-game pacing is driven
 * by the economy rather than by finger speed. And it spends at most the configured tap budget for
 * the elapsed span, so a small `stepSeconds` cannot manufacture unlimited taps.
 *
 * Without this the mine has no drills and therefore no income, so it would simulate a player who
 * never starts.
 */
function bootstrap(state, stepSeconds) {
  if (totalDrills(state) > 0) {
    return;
  }

  const firstDrill = Object.values(drills).sort((left, right) => left.tier - right.tier)[0];
  const budget = Math.max(1, Math.round(config.simulation.manualTapsPerSecond * stepSeconds));
  let taps = 0;

  while (taps < budget && !M.gte(state.currency, firstDrill.baseCost)) {
    taps += 1;
    mineManually(state);
    sellAll(state);
  }
}

/** Buys the single best-value affordable drill. Returns whether a purchase happened. */
function buyBestAffordable(state) {
  const affordable = Object.values(drills)
    .filter((definition) => definition.tier <= state.depthTier)
    .map((definition) => {
      const owned = state.drills[definition.id] ?? 0;
      return { definition, owned, cost: M.toNumber(drillCost(definition, owned, 1)) };
    })
    .filter((entry) => M.gte(state.currency, entry.cost))
    .sort(
      (left, right) => valuePerCost(right.definition, right.owned) - valuePerCost(left.definition, left.owned),
    );

  return affordable.length > 0 && buyDrill(state, affordable[0].definition.id, 'x1').ok;
}

/**
 * Greedy: dig the moment it is affordable (depth multiplies every drill), then spend the rest on the
 * best drill available. This is the natural idle line and the one the approved windows describe.
 */
function greedyStep(state, stepSeconds) {
  bootstrap(state, stepSeconds);
  sellAll(state);

  let guard = 0;
  while (guard < config.simulation.strategyGuard) {
    guard += 1;
    if (canDigDeeper(state).ok) {
      digDeeper(state);
      continue;
    }
    if (!buyBestAffordable(state)) {
      return;
    }
  }
}

/**
 * Balanced: never digs itself broke.
 *
 * Where the greedy line spends everything the moment a dig is affordable, this one waits until it
 * holds a cushion above the dig cost, so it digs later but with a larger drill base underneath.
 * That makes it a genuinely different reference line rather than a copy of the greedy one.
 */
function balancedStep(state, stepSeconds) {
  bootstrap(state, stepSeconds);
  sellAll(state);

  let guard = 0;
  while (guard < config.simulation.strategyGuard) {
    guard += 1;
    const digCost = digDeeperCost(state);
    const cushion = digCost === null ? null : M.mul(digCost, config.simulation.balancedDigReserve);

    if (canDigDeeper(state).ok && (cushion === null || M.gte(state.currency, cushion))) {
      digDeeper(state);
      continue;
    }
    if (!buyBestAffordable(state)) {
      return;
    }
  }
}

const STEP_BY_STRATEGY = Object.freeze({
  [STRATEGIES.GREEDY]: greedyStep,
  [STRATEGIES.BALANCED]: balancedStep,
});

function recordMilestones(state, time, milestones, tierCount) {
  for (let tier = 2; tier <= tierCount; tier += 1) {
    if (milestones[`tier${tier}`] === undefined && state.depthTier >= tier) {
      milestones[`tier${tier}`] = time;
    }
  }
  if (milestones.prestige === undefined && canPrestige(state)) {
    milestones.prestige = time;
  }
}

function sample(state, time) {
  return {
    time,
    currency: M.toNumber(state.currency),
    lifetimeEarned: M.toNumber(state.prestige.lifetimeEarned),
    depthTier: state.depthTier,
    totalDrills: totalDrills(state),
  };
}

/**
 * Plays the economy for `maxSeconds` and reports when milestones were reached.
 *
 * @param {object} [options]
 * @param {'greedy'|'balanced'} [options.strategy] Reference strategy to play.
 * @param {number} [options.maxSeconds] Horizon to play.
 * @param {number} [options.stepSeconds] Granularity of one strategy decision.
 * @param {number} [options.seed] Reserved for stochastic strategies; see `createRandom`.
 * @param {() => number} [options.random] Reserved for stochastic strategies; see `createRandom`.
 * @param {object} [options.state] Start from a played save instead of a fresh mine.
 * @param {number} [options.sampleSeconds] Spacing of the returned curve.
 * @param {number|null} [options.prestigeAt] Prestige automatically once run earnings reach this
 *   figure, which is how multi-cycle retention is simulated.
 */
export function simulateRun({
  strategy = STRATEGIES.GREEDY,
  maxSeconds = 3_600,
  stepSeconds = 1,
  state = null,
  sampleSeconds = 60,
  prestigeAt = null,
} = {}) {
  const step = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : 1;
  const stepFn = STEP_BY_STRATEGY[strategy] ?? greedyStep;
  const scene = state ?? createInitialState();

  const milestones = {};
  const series = [];
  const sampleEvery = Math.max(1, Math.round(sampleSeconds / step));
  let time = 0;
  let ticks = 0;
  let prestiges = 0;

  series.push(sample(scene, 0));

  while (time < maxSeconds) {
    advanceProduction(scene, step);
    stepFn(scene, step);
    time += step;
    ticks += 1;

    recordMilestones(scene, time, milestones, config.depth.tierCount);

    // Retention: a run that already has a permanent multiplier retires at the threshold and
    // restarts with it, which is what makes each later cycle faster than the last.
    if (prestigeAt !== null && canPrestige(scene) && scene.stats.totalEarned >= prestigeAt) {
      performPrestige(scene);
      prestiges += 1;
    }

    if (ticks % sampleEvery === 0) {
      series.push(sample(scene, time));
    }
  }

  return { milestones, series, finalState: scene, ticks, prestiges };
}
