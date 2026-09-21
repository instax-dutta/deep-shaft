import { describe, expect, it } from 'vitest';

import {
  canPrestige,
  performPrestige,
  prestigeGain,
  prestigePreview,
  prestigeProgress,
  prestigeThreshold,
} from '../../src/core/prestige.js';
import { M } from '../../src/core/numbers/magnitude.js';
import { creditEarnings } from '../../src/core/resources.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';

const THRESHOLD = config.prestige.thresholdCurrency;

/** A mine that has earned `amount` this run, using the real earnings path. */
function mineWithEarnings(amount) {
  const state = createInitialState();
  creditEarnings(state, amount);
  return state;
}

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

describe('prestige eligibility', () => {
  it('refuses to prestige before the mine has earned enough', () => {
    const state = mineWithEarnings(THRESHOLD - 1);

    expect(canPrestige(state)).toBe(false);

    const result = performPrestige(state);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('below_threshold');
  });

  it('leaves the mine completely untouched when it refuses', () => {
    const state = mineWithEarnings(THRESHOLD - 1);
    state.currency = 5_000;
    state.drills = { 'drill-1': 3 };
    const before = snapshot(state);

    performPrestige(state);

    expect(state).toEqual(before);
  });

  it('unlocks exactly at the configured threshold', () => {
    expect(canPrestige(mineWithEarnings(THRESHOLD))).toBe(true);
  });

  it('reports how far the run has come without prestiging anything', () => {
    const state = mineWithEarnings(THRESHOLD / 4);

    const progress = prestigeProgress(state);

    expect(progress.runEarned).toBe(THRESHOLD / 4);
    expect(progress.threshold).toBe(THRESHOLD);
    expect(progress.ratio).toBeCloseTo(0.25, 6);
  });

  it('never reports a ratio above one, however far past the threshold the run is', () => {
    const state = mineWithEarnings(THRESHOLD * 40);

    expect(prestigeProgress(state).ratio).toBe(1);
  });
});

describe('prestige multiplier', () => {
  it('scales the reward with how far the run got, not as a flat bonus', () => {
    // Both runs sit above the +1 floor, where the curve is purely linear again.
    const modest = mineWithEarnings(THRESHOLD * 4);
    const deep = mineWithEarnings(THRESHOLD * 16);

    expect(prestigeGain(modest)).toBeGreaterThan(0);
    expect(prestigeGain(deep)).toBeCloseTo(prestigeGain(modest) * 4, 6);
  });

  it('grants nothing automatically — the multiplier only moves on prestige', () => {
    const state = mineWithEarnings(THRESHOLD * 10);

    expect(state.prestige.multiplier).toBe(1);
  });

  it('adds the earned gain to the permanent multiplier and counts the prestige', () => {
    const state = mineWithEarnings(THRESHOLD);
    const gain = prestigeGain(state);

    const result = performPrestige(state);

    expect(result.ok).toBe(true);
    expect(state.prestige.multiplier).toBeCloseTo(1 + gain, 6);
    expect(state.prestige.count).toBe(1);
    expect(result.gain).toBeCloseTo(gain, 6);
  });

  it('compounds across repeated prestige cycles', () => {
    const state = mineWithEarnings(THRESHOLD);
    const gain = prestigeGain(state);

    performPrestige(state);
    creditEarnings(state, THRESHOLD);
    performPrestige(state);

    expect(state.prestige.count).toBe(2);
    expect(state.prestige.multiplier).toBeCloseTo(1 + gain * 2, 6);
  });
});

describe('what a prestige resets', () => {
  function playedRun() {
    const state = mineWithEarnings(THRESHOLD * 2);
    state.currency = 42_000;
    state.depthTier = 3;
    state.drills = { 'drill-1': 5, 'drill-2': 2 };
    state.resources = { 'tier3-ore': 900 };
    state.workers = [{ id: 'worker-1', name: 'Gus Stone', level: 7, speed: 0.4, luck: 0.1 }];
    return state;
  }

  it('returns the mine to a fresh run', () => {
    const state = playedRun();

    performPrestige(state);

    expect(state.currency).toBe(config.economy.startingCurrency);
    expect(state.depthTier).toBe(1);
    expect(state.drills).toEqual({});
    expect(state.resources).toEqual({});
  });

  it('clears the worker roster', () => {
    const state = playedRun();

    performPrestige(state);

    expect(state.workers).toEqual([]);
  });

  it('restarts the run earnings the next reward is measured from', () => {
    const state = playedRun();

    performPrestige(state);

    expect(state.stats.totalEarned).toBe(0);
  });

  it('keeps the permanent multiplier and the prestige count', () => {
    const state = playedRun();
    const gain = prestigeGain(state);

    performPrestige(state);

    expect(state.prestige.multiplier).toBeCloseTo(1 + gain, 6);
    expect(state.prestige.count).toBe(1);
  });

  it('keeps lifetime earnings, which span every run', () => {
    const state = playedRun();

    performPrestige(state);

    expect(state.prestige.lifetimeEarned).toBe(THRESHOLD * 2);
  });

  it('clears active events so a cave-in does not follow the player into the new run', () => {
    const state = playedRun();
    state.events.active = [
      { kind: 'caveIn', name: 'Cave-in', remainingSeconds: 12, drillIds: ['drill-1'] },
    ];

    performPrestige(state);

    expect(state.events.active).toEqual([]);
  });
});

describe('career earnings', () => {
  it('reports career earnings separately from what this run earned', () => {
    const state = mineWithEarnings(THRESHOLD * 2);
    performPrestige(state);
    creditEarnings(state, THRESHOLD);

    const { summary } = prestigePreview(state);

    // The reward is set by the run; career earnings are context for it, not the input.
    expect(summary.runEarned).toBe(THRESHOLD);
    expect(summary.lifetimeEarned).toBe(THRESHOLD * 3);
  });

  it('grows career earnings even though a reset zeroes the run', () => {
    const state = mineWithEarnings(THRESHOLD);

    performPrestige(state);

    expect(state.stats.totalEarned).toBe(0);
    expect(state.prestige.lifetimeEarned).toBe(THRESHOLD);
  });
});

describe('late-game scale', () => {
  it('a huge run reward does not collapse the permanent multiplier to Infinity', () => {
    const state = createInitialState();
    state.stats.totalEarned = M.from('1e400');

    const result = performPrestige(state);

    expect(result.ok).toBe(true);
    expect(M.isFinite(state.prestige.multiplier)).toBe(false);
    expect(M.toString(state.prestige.multiplier)).not.toContain('Infinity');
    expect(M.gt(state.prestige.multiplier, 1e308)).toBe(true);
  });
});

describe('prestige preview', () => {
  it('describes what the player gains and what the reset costs them', () => {
    const state = mineWithEarnings(THRESHOLD * 2);
    state.depthTier = 4;
    state.drills = { 'drill-1': 5, 'drill-2': 2 };
    state.workers = [{ id: 'worker-1', name: 'Gus Stone', level: 3, speed: 0.4, luck: 0.1 }];

    const preview = prestigePreview(state);

    expect(preview.ok).toBe(true);
    expect(preview.gain).toBeCloseTo(prestigeGain(state), 6);
    expect(preview.nextMultiplier).toBeCloseTo(1 + prestigeGain(state), 6);
    expect(preview.summary.drillsLost).toBe(7);
    expect(preview.summary.workersLost).toBe(1);
    expect(preview.summary.depthReached).toBe(4);
    expect(preview.summary.runEarned).toBe(THRESHOLD * 2);
    expect(preview.summary.lifetimeEarned).toBe(THRESHOLD * 2);
  });

  it('explains a refusal instead of promising a gain', () => {
    const preview = prestigePreview(mineWithEarnings(THRESHOLD - 1));

    expect(preview.ok).toBe(false);
    expect(preview.reason).toBe('below_threshold');
    expect(preview.gain).toBe(0);
  });

  it('does not change the mine it previews', () => {
    const state = mineWithEarnings(THRESHOLD * 2);
    const before = snapshot(state);

    prestigePreview(state);

    expect(state).toEqual(before);
  });
});

describe('first-prestige floor', () => {
  it('a run that just crossed the threshold grants at least +1 multiplier (x2 total)', () => {
    const state = createInitialState();
    creditEarnings(state, prestigeThreshold() * 1.05);

    const gain = prestigeGain(state);

    expect(gain).toBeGreaterThanOrEqual(1);
  });

  it('the floor does not change the curve once the run outgrows it', () => {
    const state = createInitialState();
    creditEarnings(state, 10_000_000);

    // 10M/1M * 0.25 = 2.5 -> rounds to 2.5, above the floor.
    expect(prestigeGain(state)).toBe(2.5);
  });
});
