/**
 * Random events: cave-ins and lucky veins.
 *
 * The system is split so production never learns about event kinds. This module turns active
 * events into a small, generic modifier snapshot — a production multiplier and a list of stopped
 * drills — and `src/core/production.js` consumes only that. Adding a third event type means adding
 * a definition and a modifier rule here, not editing a production formula.
 *
 * Time is advanced explicitly rather than read from a clock, so scheduling and expiry are fully
 * deterministic under test.
 */

import { config } from '../data/config.js';
import { getDrill } from '../data/drills.js';
import { EVENT_KINDS, eventDefinitions, weightForTier } from '../data/events.js';

export function createEventState() {
  return { secondsUntilNext: 0, active: [] };
}

function clampRoll(value) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999_999) : 0;
}

function ownedDrillIds(state) {
  return Object.entries(state.drills)
    .filter(([drillId, count]) => count > 0 && Boolean(getDrill(drillId)))
    .map(([drillId]) => drillId);
}

function rollWindow(minimum, maximum, random) {
  return minimum + clampRoll(random()) * (maximum - minimum);
}

/**
 * Resolves the gap between events.
 *
 * Defaults to the configured window, but accepts an injected range so pacing can be driven
 * directly — a long wait is fine for a player and useless for verification.
 */
function resolveIntervalRange(intervalRange) {
  const configured = {
    min: config.events.minIntervalSeconds,
    max: config.events.maxIntervalSeconds,
  };
  if (!intervalRange || typeof intervalRange !== 'object') {
    return configured;
  }

  const min = Number.isFinite(intervalRange.minSeconds)
    ? intervalRange.minSeconds
    : configured.min;
  const max = Number.isFinite(intervalRange.maxSeconds)
    ? Math.max(min, intervalRange.maxSeconds)
    : Math.max(min, configured.max);

  return { min, max };
}

function rollInterval(intervalRange, random) {
  const range = resolveIntervalRange(intervalRange);
  return rollWindow(range.min, range.max, random);
}

/** Picks one definition, favouring the ones weighted higher for this depth tier. */
function weightedPick(definitions, depthTier, random) {
  const weighted = definitions.map((definition) => ({
    definition,
    weight: weightForTier(definition, depthTier),
  }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);

  let target = clampRoll(random()) * total;
  for (const entry of weighted) {
    target -= entry.weight;
    if (target < 0) {
      return entry.definition;
    }
  }
  return weighted[weighted.length - 1].definition;
}

/** Chooses which drills a cave-in stops, bounded by what the mine actually owns. */
function chooseDisabledDrills(definition, state, random) {
  if (!definition.drillsDisabled) {
    return undefined;
  }

  const available = ownedDrillIds(state);
  const count = Math.min(definition.drillsDisabled, available.length);
  const chosen = [];

  for (let index = 0; index < count; index += 1) {
    const position = Math.min(
      available.length - 1,
      Math.floor(clampRoll(random()) * available.length),
    );
    chosen.push(available.splice(position, 1)[0]);
  }

  return chosen;
}

function resolveDurationScale(durationScale) {
  return Number.isFinite(durationScale) && durationScale > 0 ? durationScale : 1;
}

function createActiveEvent(definition, state, random, durationScale) {
  const totalSeconds = rollWindow(
    definition.minDurationSeconds,
    definition.maxDurationSeconds,
    random,
  ) * resolveDurationScale(durationScale);

  const active = {
    kind: definition.kind,
    name: definition.name,
    tone: definition.tone,
    announcement: definition.announcement,
    remainingSeconds: totalSeconds,
    totalSeconds,
  };

  const drillIds = chooseDisabledDrills(definition, state, random);
  if (drillIds) {
    active.drillIds = drillIds;
  }

  return active;
}

/**
 * Advances event scheduling and expiry by `elapsedSeconds`.
 *
 * Returns the event that started (if any) and the ones that ended, so the UI can never let a
 * penalty or a bonus pass silently. Only one event can start per advance: a long frame or a
 * background tab should not produce a burst of penalties.
 */
export function advanceEvents(
  state,
  elapsedSeconds,
  { random = Math.random, intervalRange = null, durationScale = 1 } = {},
) {
  const events = state.events;
  if (!events || !Array.isArray(events.active)) {
    return { ok: false, reason: 'no_event_state' };
  }
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return { ok: true, triggered: null, expired: [] };
  }

  const expired = [];
  events.active = events.active.filter((active) => {
    active.remainingSeconds -= elapsedSeconds;
    if (active.remainingSeconds <= 0) {
      expired.push(active);
      return false;
    }
    return true;
  });

  // A zero countdown means "not scheduled yet": set the first interval without firing, so a
  // fresh mine never opens with a punishment.
  if (!Number.isFinite(events.secondsUntilNext) || events.secondsUntilNext <= 0) {
    events.secondsUntilNext = rollInterval(intervalRange, random);
    return { ok: true, triggered: null, expired };
  }

  events.secondsUntilNext -= elapsedSeconds;
  if (events.secondsUntilNext > 0) {
    return { ok: true, triggered: null, expired };
  }

  // An event only fires when there is a running drill for it to affect.
  const eligible = ownedDrillIds(state).length > 0
    ? Object.values(eventDefinitions)
    : [];
  const triggered = eligible.length > 0
    ? createActiveEvent(
        weightedPick(eligible, state.depthTier, random),
        state,
        random,
        durationScale,
      )
    : null;

  if (triggered) {
    events.active.push(triggered);
  }

  events.secondsUntilNext = rollInterval(intervalRange, random);

  return { ok: true, triggered, expired };
}

/**
 * Generic snapshot of what active events are doing right now.
 *
 * Production consumes only this shape, which is what keeps new event types from reaching into
 * the production formulas.
 */
export function activeModifiers(state) {
  const modifiers = {
    caveIn: false,
    luckyVein: false,
    productionMultiplier: 1,
    disabledDrillIds: [],
  };

  for (const active of state.events?.active ?? []) {
    if (active.kind === EVENT_KINDS.CAVE_IN) {
      modifiers.caveIn = true;
      modifiers.disabledDrillIds.push(...(active.drillIds ?? []));
    } else if (active.kind === EVENT_KINDS.LUCKY_VEIN) {
      modifiers.luckyVein = true;
      modifiers.productionMultiplier *= config.events.luckyVein.productionMultiplier;
    }
  }

  return modifiers;
}
