/**
 * Event content definitions.
 *
 * Two event types ship in v1: a cave-in that stops a drill, and a lucky vein that multiplies
 * output. Pacing and severity come from `config.events` — this module owns identity, player-facing
 * copy, and per-tier weights, so a new event type is added here plus its modifier in
 * `src/core/events.js` without production formulas changing.
 */

import { config } from './config.js';

export const EVENT_KINDS = Object.freeze({
  CAVE_IN: 'caveIn',
  LUCKY_VEIN: 'luckyVein',
});

function createEvents() {
  const caveIn = config.events.caveIn;
  const luckyVein = config.events.luckyVein;

  return Object.freeze({
    [EVENT_KINDS.CAVE_IN]: Object.freeze({
      id: EVENT_KINDS.CAVE_IN,
      kind: EVENT_KINDS.CAVE_IN,
      name: 'Cave-in',
      tone: 'warn',
      announcement: 'A cave-in buried a drill. It will be back shortly.',
      /** Deeper shafts are less stable, so collapses become more frequent. */
      weightByTier: Object.freeze([1, 1.2, 1.4, 1.6, 1.8]),
      minDurationSeconds: caveIn.minDurationSeconds,
      maxDurationSeconds: caveIn.maxDurationSeconds,
      drillsDisabled: caveIn.drillsDisabled,
    }),
    [EVENT_KINDS.LUCKY_VEIN]: Object.freeze({
      id: EVENT_KINDS.LUCKY_VEIN,
      kind: EVENT_KINDS.LUCKY_VEIN,
      name: 'Lucky vein',
      tone: 'good',
      announcement: 'A lucky vein! Everything runs faster for a moment.',
      weightByTier: Object.freeze([1, 1.1, 1.2, 1.3, 1.4]),
      minDurationSeconds: luckyVein.minDurationSeconds,
      maxDurationSeconds: luckyVein.maxDurationSeconds,
      productionMultiplier: luckyVein.productionMultiplier,
    }),
  });
}

/** Frozen map of event kind to definition. */
export const eventDefinitions = createEvents();

/** Weights are indexed by depth tier; deeper than the table keeps the deepest weight. */
export function weightForTier(definition, depthTier) {
  const tier = Number.isFinite(depthTier) ? Math.max(1, Math.floor(depthTier)) : 1;
  const index = Math.min(tier - 1, definition.weightByTier.length - 1);
  return definition.weightByTier[index];
}

/** An event definition with its weight resolved for a depth tier. */
export function eventForTier(kind, depthTier) {
  const definition = eventDefinitions[kind];
  if (!definition) {
    return null;
  }
  return { ...definition, weight: weightForTier(definition, depthTier) };
}

export function eventsForTier(depthTier) {
  return Object.values(eventDefinitions).map((definition) => eventForTier(definition.kind, depthTier));
}
