import { describe, expect, it } from 'vitest';

import { activeModifiers, advanceEvents } from '../../src/core/events.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { EVENT_KINDS } from '../../src/data/events.js';

/** Returns the supplied values in order, then the final value forever. */
function sequenceRandom(values, fallback = 0) {
  let index = 0;
  return () => (index < values.length ? values[index++] : fallback);
}

/** Picks the cave-in: lowest roll for the weighted pick, minimum duration. */
const forceCaveIn = () => sequenceRandom([0, 0, 0]);
/** Picks the lucky vein: highest roll for the weighted pick, minimum duration. */
const forceLuckyVein = () => sequenceRandom([0.999, 0, 0]);

function runningMine({ drills = { 'drill-1': 1 }, depthTier = 1 } = {}) {
  const state = createInitialState();
  state.drills = { ...drills };
  state.depthTier = depthTier;
  return state;
}

/** Counts down to a trigger on the very next call. */
function armed(state) {
  state.events.secondsUntilNext = 1;
  return state;
}

describe('advanceEvents scheduling', () => {
  it('schedules the first event instead of firing immediately', () => {
    const state = runningMine();

    const result = advanceEvents(state, 30, { random: () => 0 });

    expect(result.triggered).toBeNull();
    expect(state.events.secondsUntilNext).toBe(config.events.minIntervalSeconds);
    expect(state.events.active).toEqual([]);
  });

  it('rolls the first interval inside the configured window', () => {
    const state = runningMine();

    advanceEvents(state, 1, { random: () => 0.5 });

    const expected = config.events.minIntervalSeconds
      + 0.5 * (config.events.maxIntervalSeconds - config.events.minIntervalSeconds);
    expect(state.events.secondsUntilNext).toBeCloseTo(expected, 6);
  });

  it('counts the interval down without firing while time remains', () => {
    const state = armed(runningMine());

    const result = advanceEvents(state, 0.25, { random: () => 0 });

    expect(result.triggered).toBeNull();
    expect(state.events.secondsUntilNext).toBeCloseTo(0.75, 6);
  });

  it('fires once the countdown elapses, then reschedules', () => {
    const state = armed(runningMine());

    const result = advanceEvents(state, 1, { random: forceCaveIn() });

    expect(result.triggered.kind).toBe(EVENT_KINDS.CAVE_IN);
    expect(state.events.active).toHaveLength(1);
    expect(state.events.secondsUntilNext).toBeGreaterThan(0);
  });

  it('fires at most one event per advance, even across a long gap', () => {
    const state = armed(runningMine());

    advanceEvents(state, 5_000, { random: forceCaveIn() });

    expect(state.events.active).toHaveLength(1);
  });

  it('ignores zero, negative, and non-finite spans', () => {
    const state = armed(runningMine());
    const before = structuredClone(state.events);

    expect(advanceEvents(state, 0, { random: () => 0 }).triggered).toBeNull();
    expect(advanceEvents(state, -5, { random: () => 0 }).triggered).toBeNull();
    expect(advanceEvents(state, Number.NaN, { random: () => 0 }).triggered).toBeNull();

    expect(state.events).toEqual(before);
  });

  it('never fires an event while nothing is running', () => {
    const state = armed(runningMine({ drills: {} }));

    const result = advanceEvents(state, 10, { random: forceCaveIn() });

    expect(result.triggered).toBeNull();
    expect(state.events.active).toEqual([]);
  });
});

describe('advanceEvents pacing override', () => {
  it('uses an injected interval instead of the configured window', () => {
    const state = runningMine();

    advanceEvents(state, 1, { random: () => 0, intervalRange: { minSeconds: 2, maxSeconds: 2 } });

    expect(state.events.secondsUntilNext).toBe(2);
  });

  it('rolls inside the injected window', () => {
    const state = runningMine();

    advanceEvents(state, 1, { random: () => 0.5, intervalRange: { minSeconds: 2, maxSeconds: 6 } });

    expect(state.events.secondsUntilNext).toBeCloseTo(4, 6);
  });

  it('reschedules inside the injected window after firing', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, {
      random: forceCaveIn(),
      intervalRange: { minSeconds: 3, maxSeconds: 3 },
    });

    expect(state.events.secondsUntilNext).toBe(3);
  });

  it('falls back to the configured window for an unusable range', () => {
    const state = runningMine();

    advanceEvents(state, 1, { random: () => 0, intervalRange: { minSeconds: 'soon' } });

    expect(state.events.secondsUntilNext).toBe(config.events.minIntervalSeconds);
  });

  it('never lets a reversed window produce a negative schedule', () => {
    const state = runningMine();

    advanceEvents(state, 1, { random: () => 0.5, intervalRange: { minSeconds: 8, maxSeconds: 2 } });

    expect(state.events.secondsUntilNext).toBe(8);
  });
});

describe('advanceEvents duration override', () => {
  it('scales how long an event lasts', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, { random: forceCaveIn(), durationScale: 0.5 });

    expect(state.events.active[0].totalSeconds).toBeCloseTo(
      config.events.caveIn.minDurationSeconds * 0.5,
      6,
    );
  });

  it('scales the lucky vein too', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, {
      random: forceLuckyVein(),
      durationScale: 2,
    });

    expect(state.events.active[0].totalSeconds).toBeCloseTo(
      config.events.luckyVein.minDurationSeconds * 2,
      6,
    );
  });

  it('keeps the configured duration for an unusable scale', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, { random: forceCaveIn(), durationScale: 0 });

    expect(state.events.active[0].totalSeconds).toBe(config.events.caveIn.minDurationSeconds);
  });
});

describe('advanceEvents triggering', () => {
  it('rolls the duration inside the configured range', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, { random: sequenceRandom([0, 1, 0]) });

    const [event] = state.events.active;
    expect(event.remainingSeconds).toBeGreaterThanOrEqual(config.events.caveIn.minDurationSeconds);
    expect(event.remainingSeconds).toBeLessThanOrEqual(config.events.caveIn.maxDurationSeconds);
  });

  it('can fire the lucky vein instead', () => {
    const state = armed(runningMine());

    const result = advanceEvents(state, 1, { random: forceLuckyVein() });

    expect(result.triggered.kind).toBe(EVENT_KINDS.LUCKY_VEIN);
    expect(result.triggered.tone).toBe('good');
  });

  it('reports the announcement the player should see', () => {
    const state = armed(runningMine());

    const result = advanceEvents(state, 1, { random: forceCaveIn() });

    expect(result.triggered.announcement).toBe(
      state.events.active[0].announcement,
    );
    expect(result.triggered.announcement.length).toBeGreaterThan(0);
  });

  it('records which drill a cave-in disabled', () => {
    const state = armed(runningMine());

    advanceEvents(state, 1, { random: forceCaveIn() });

    expect(state.events.active[0].drillIds).toHaveLength(config.events.caveIn.drillsDisabled);
    expect(state.drills).toHaveProperty(state.events.active[0].drillIds[0]);
  });

  it('does not disable more drills than the mine owns', () => {
    const state = armed(runningMine({ drills: { 'drill-1': 1 } }));

    advanceEvents(state, 1, { random: forceCaveIn() });

    expect(state.events.active[0].drillIds).toHaveLength(1);
  });
});

describe('advanceEvents expiry', () => {
  it('keeps an active event while time remains', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceCaveIn() });

    const result = advanceEvents(state, 1, { random: () => 0 });

    expect(result.expired).toEqual([]);
    expect(state.events.active).toHaveLength(1);
  });

  it('expires the event once its duration has passed and reports it', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceCaveIn() });
    const duration = state.events.active[0].remainingSeconds;

    const result = advanceEvents(state, duration, { random: () => 0 });

    expect(result.expired).toHaveLength(1);
    expect(result.expired[0].kind).toBe(EVENT_KINDS.CAVE_IN);
    expect(state.events.active).toEqual([]);
  });

  it('reports the kind that cleared so the UI can say so', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceCaveIn() });
    const duration = state.events.active[0].remainingSeconds;

    const result = advanceEvents(state, duration, { random: () => 0 });

    expect(result.expired[0].name.length).toBeGreaterThan(0);
  });
});

describe('activeModifiers', () => {
  it('is neutral with nothing active', () => {
    expect(activeModifiers(createInitialState())).toEqual({
      caveIn: false,
      luckyVein: false,
      productionMultiplier: 1,
      disabledDrillIds: [],
    });
  });

  it('flags a cave-in and lists the drills it stopped', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceCaveIn() });

    const modifiers = activeModifiers(state);

    expect(modifiers.caveIn).toBe(true);
    expect(modifiers.disabledDrillIds).toEqual(state.events.active[0].drillIds);
  });

  it('raises the production multiplier while a lucky vein is open', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceLuckyVein() });

    expect(activeModifiers(state).productionMultiplier).toBe(
      config.events.luckyVein.productionMultiplier,
    );
  });

  it('returns to neutral once the event expires', () => {
    const state = armed(runningMine());
    advanceEvents(state, 1, { random: forceCaveIn() });
    const duration = state.events.active[0].remainingSeconds;
    advanceEvents(state, duration, { random: () => 0 });

    expect(activeModifiers(state)).toEqual({
      caveIn: false,
      luckyVein: false,
      productionMultiplier: 1,
      disabledDrillIds: [],
    });
  });
});
