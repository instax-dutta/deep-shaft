/**
 * Offline progress.
 *
 * On load the saved timestamp is compared against the current clock and the production for
 * that gap is banked in one batch. The gap is clamped so a long absence is a pleasant boost
 * rather than a game-breaking jump.
 *
 * Call this exactly once per load and re-save afterwards: it reads `state.lastSavedAt` without
 * changing it, so a second call would credit the same absence twice.
 */

import { advanceProduction } from './production.js';
import { runAutomation } from './automation.js';
import { config } from '../data/config.js';
import { M } from './numbers/magnitude.js';
import { upgradeEffects } from './prestigeUpgrades.js';

/** The configured cap, widened by any owned offline-cap upgrade levels. */
function effectiveCap(state) {
  return config.offline.capSeconds * M.toNumber(upgradeEffects(state).offlineCapMultiplier);
}

/**
 * Seconds of credited absence, clamped to `capSeconds`.
 *
 * Returns 0 for a never-saved mine, an unchanged clock, or a timestamp in the future
 * (system clock changes must never produce negative or unearned production).
 */
export function elapsedOfflineSeconds(state, nowMs, capSeconds = config.offline.capSeconds) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(state.lastSavedAt) || state.lastSavedAt <= 0) {
    return 0;
  }

  const elapsed = (nowMs - state.lastSavedAt) / 1000;
  if (!Number.isFinite(elapsed) || elapsed <= 0) {
    return 0;
  }

  const cap = Number.isFinite(capSeconds) && capSeconds > 0 ? capSeconds : config.offline.capSeconds;
  return Math.min(elapsed, cap);
}

/** Banks offline production into the mine and reports what was credited. */
export function applyOfflineProgress(state, { nowMs, capSeconds } = {}) {
  const seconds = elapsedOfflineSeconds(state, nowMs, capSeconds ?? effectiveCap(state));
  if (seconds <= 0) {
    return { ok: true, seconds: 0, gains: {} };
  }

  const { gains } = advanceProduction(state, seconds);
  // Automation runs once for the whole absence, exactly as production does, so a returning
  // player's save is not advanced tick by tick.
  const { actions } = runAutomation(state, seconds);
  return { ok: true, seconds, gains, actions };
}
