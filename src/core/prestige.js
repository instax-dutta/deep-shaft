/**
 * Prestige: retire a run in exchange for a permanent production multiplier.
 *
 * Two rules shape this module.
 *
 * 1. The reward is earned, never automatic. `prestige.multiplier` only moves when the player
 *    actually prestiges, and the size of the move is derived from how far *this run* got
 *    (`stats.totalEarned`, which the reset zeroes). A player who merely plays a long time gains
 *    nothing until they choose to retire.
 * 2. The multiplier lives outside everything the reset clears. `performPrestige` replaces the run
 *    — currency, drills, workers, inventory, depth, active events — and touches only
 *    `prestige.count`, `prestige.multiplier`, and `prestige.lifetimeEarned`, so the permanent
 *    reward survives every future cycle.
 *
 * State transitions are controlled mutations, matching `src/core/resources.js`: a refused prestige
 * returns a structured failure and leaves the state byte-for-byte unchanged.
 */

import { config } from '../data/config.js';
import { createEventState } from './events.js';
import { M } from './numbers/magnitude.js';
import { prestigePointsForRun } from './prestigeUpgrades.js';

/** Keeps accumulated floating-point dust out of a number the player reads. */
const GAIN_PRECISION = 6;

/**
 * Minimum multiplier gain per prestige.
 *
 * A run that has barely crossed the threshold would otherwise round to +0.25 - a full reset for a
 * barely perceptible reward, which is exactly the "prestige feels automatic and pointless" failure.
 * The floor keeps every retirement worth at least x2, while longer runs outgrow it immediately.
 */
const MIN_GAIN = 1;

const REASON_BELOW_THRESHOLD = 'below_threshold';

function round(value) {
  // Only floats carry presentation dust; a big magnitude keeps its own precision.
  return typeof value === 'number' ? Number(value.toFixed(GAIN_PRECISION)) : value;
}

/** Currency the mine must have earned this run before retiring it is allowed. */
export function prestigeThreshold() {
  return config.prestige.thresholdCurrency;
}

/** Progress made during the current run, which is what the reward is measured against. */
export function runEarnings(state) {
  const earned = M.from(state?.stats?.totalEarned ?? 0);
  return earned !== null && M.gt(earned, 0) ? earned : 0;
}

/** Permanent multiplier the player would gain for retiring the run right now. */
export function prestigeGain(state) {
  if (!canPrestige(state)) {
    return 0;
  }

  const { lifetimeScale, multiplierPerScale } = config.prestige;
  const linear = M.mul(M.div(runEarnings(state), lifetimeScale), multiplierPerScale);
  return round(M.max(MIN_GAIN, linear));
}

export function canPrestige(state) {
  return M.gte(runEarnings(state), prestigeThreshold());
}

/** How close the run is to being worth retiring, for progress copy. */
export function prestigeProgress(state) {
  const threshold = prestigeThreshold();
  const earned = runEarnings(state);

  return {
    runEarned: earned,
    threshold,
    ratio: threshold > 0 ? M.toNumber(M.min(1, M.div(earned, threshold))) : 1,
  };
}

function summarizeRun(state) {
  const drillsLost = Object.values(state.drills ?? {}).reduce(
    (total, count) => total + (Number.isFinite(count) && count > 0 ? count : 0),
    0,
  );

  return {
    runEarned: runEarnings(state),
    // Career earnings span every run. They are reported for context; the reward is never derived
    // from them, because a figure that only grows would make prestige automatic.
    lifetimeEarned: state.prestige.lifetimeEarned,
    currencyLost: state.currency,
    drillsLost,
    workersLost: (state.workers ?? []).length,
    depthReached: state.depthTier,
  };
}

/**
 * What retiring the run would do, without changing anything.
 *
 * Used by the confirmation UI so the penalty is stated before it is applied, never after.
 */
export function prestigePreview(state) {
  const gain = prestigeGain(state);
  const eligible = canPrestige(state);

  return {
    ok: eligible,
    reason: eligible ? null : REASON_BELOW_THRESHOLD,
    gain,
    points: eligible ? prestigePointsForRun(state) : 0,
    multiplier: state.prestige.multiplier,
    nextMultiplier: round(M.add(state.prestige.multiplier, gain)),
    progress: prestigeProgress(state),
    summary: summarizeRun(state),
  };
}

/**
 * Retires the run and banks the permanent multiplier.
 *
 * The summary is captured before the reset so the caller can report what was actually given up.
 */
export function performPrestige(state) {
  if (!canPrestige(state)) {
    return {
      ok: false,
      reason: REASON_BELOW_THRESHOLD,
      gain: 0,
      multiplier: state.prestige.multiplier,
    };
  }

  const gain = prestigeGain(state);
  // Points are earned from this run, so they must be measured before the run earnings are zeroed.
  const points = prestigePointsForRun(state);
  const summary = summarizeRun(state);

  // The run itself, replaced wholesale.
  state.currency = config.economy.startingCurrency;
  state.depthTier = 1;
  state.drills = {};
  state.resources = {};
  state.workers = [];
  // Run progress, so the next reward is measured from the new run rather than the old one.
  state.stats.totalEarned = 0;
  // A cave-in from the retired run must not follow the player into the new one.
  state.events = createEventState();

  // The permanent reward, untouched by any of the above.
  state.prestige.count += 1;
  state.prestige.multiplier = round(M.add(state.prestige.multiplier, gain));
  // Points and purchased upgrade levels are permanent, like the multiplier: the reset above
  // never touches `prestige.upgrades`, only adding to `prestige.points`.
  state.prestige.points = M.add(state.prestige.points, points);

  return {
    ok: true,
    gain,
    points,
    multiplier: state.prestige.multiplier,
    count: state.prestige.count,
    summary,
  };
}
