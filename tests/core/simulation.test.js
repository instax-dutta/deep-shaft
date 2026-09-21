import { describe, expect, it } from 'vitest';

import { MAX_DEPTH_TIER } from '../../src/core/depth.js';
import { M } from '../../src/core/numbers/magnitude.js';
import { applyOfflineProgress } from '../../src/core/offline.js';
import { performPrestige, prestigeThreshold } from '../../src/core/prestige.js';
import { sellAll } from '../../src/core/resources.js';
import { STRATEGIES, simulateRun } from '../../src/core/simulation.js';
import { config } from '../../src/data/config.js';

/**
 * The approved economy targets, as agreed in the P12 owner decisions of
 * `docs/superpowers/plans/v2-production-refinement-plan.md`.
 *
 * These are product numbers, not implementation details: changing one is an explicit edit to the
 * plan and this table together, never a quiet edit to make a failing run pass.
 */
const APPROVED = Object.freeze({
  depth: Object.freeze({
    2: { minSeconds: 10 * 60, maxSeconds: 20 * 60 },
    3: { minSeconds: 60 * 60, maxSeconds: 2 * 60 * 60 },
    4: { minSeconds: 4 * 3_600, maxSeconds: 8 * 3_600 },
    5: { minSeconds: 24 * 3_600, maxSeconds: 48 * 3_600 },
  }),
  firstPrestigeMaxSeconds: 4 * 3_600,
  /** Offline at the 24h cap must stay a minor share of a day of active play. */
  offlineShareMax: 0.5,
});

const HORIZON_SECONDS = 96 * 3_600;
const STEP_SECONDS = 5;
/** Fixed on purpose: the comparison is against a real day, not against whatever the cap is set to. */
const DAY_SECONDS = 24 * 3_600;
const NOW_MS = 1_700_000_000_000;

/**
 * Runs are expensive (a 96h horizon is tens of thousands of ticks) and deterministic, so each
 * distinct option set is simulated once and shared by every test that needs it.
 */
const RUN_CACHE = new Map();

function run(options) {
  const key = JSON.stringify(options);
  if (!RUN_CACHE.has(key)) {
    RUN_CACHE.set(key, simulateRun(options));
  }
  return RUN_CACHE.get(key);
}

function greedyRun() {
  return run({ strategy: STRATEGIES.GREEDY, maxSeconds: HORIZON_SECONDS, stepSeconds: STEP_SECONDS });
}

function balancedRun() {
  return run({ strategy: STRATEGIES.BALANCED, maxSeconds: HORIZON_SECONDS, stepSeconds: STEP_SECONDS });
}

/** Minutes, for assertion messages a human can read. */
function minutes(seconds) {
  return (seconds / 60).toFixed(1);
}

function expectWithinWindow(label, seconds, window) {
  expect(seconds, `${label} was not reached within the ${HORIZON_SECONDS / 3_600}h horizon`).toBeDefined();
  expect(
    seconds,
    `${label} took ${minutes(seconds)}m, outside the approved window ` +
      `${minutes(window.minSeconds)}m–${minutes(window.maxSeconds)}m`,
  ).toBeGreaterThanOrEqual(window.minSeconds);
  expect(seconds).toBeLessThanOrEqual(window.maxSeconds);
}

/** Earnings banked by playing `seconds` of active play from `state`, without mutating it. */
function earnedByPlaying(state, seconds) {
  const mine = structuredClone(state);
  const before = M.toNumber(mine.prestige.lifetimeEarned);
  const played = simulateRun({ state: mine, maxSeconds: seconds, stepSeconds: 10 });
  return M.toNumber(played.finalState.prestige.lifetimeEarned) - before;
}

/** Earnings banked by one absence at the configured cap, without mutating `state`. */
function earnedWhileAway(state) {
  const mine = structuredClone(state);
  const capSeconds = config.offline.capSeconds;
  mine.lastSavedAt = NOW_MS - capSeconds * 1_000;
  const before = M.toNumber(mine.prestige.lifetimeEarned);
  applyOfflineProgress(mine, { nowMs: NOW_MS, capSeconds });
  // Offline banks resources, so selling them is what turns the absence into earnings.
  sellAll(mine);
  return M.toNumber(mine.prestige.lifetimeEarned) - before;
}

describe('simulateRun', () => {
  // These tests simulate whole runs; under full-suite parallelism a 5s default is too tight.
  it('is deterministic for a fixed seed', { timeout: 30_000 }, () => {
    const first = simulateRun({ strategy: STRATEGIES.GREEDY, maxSeconds: 1_800, stepSeconds: 5, seed: 7 });
    const second = simulateRun({ strategy: STRATEGIES.GREEDY, maxSeconds: 1_800, stepSeconds: 5, seed: 7 });

    expect(second.milestones).toEqual(first.milestones);
    expect(second.series).toEqual(first.series);
  });

  it('keeps the reference strategies independent of the random source', { timeout: 30_000 }, () => {
    // Both reference lines model expectation, not luck: the seed must not move a milestone. That is
    // what makes these pacing numbers a property of the economy rather than of one lucky run.
    const seeded = simulateRun({ strategy: STRATEGIES.GREEDY, maxSeconds: 3_600, stepSeconds: 10, seed: 1 });
    const other = simulateRun({ strategy: STRATEGIES.GREEDY, maxSeconds: 3_600, stepSeconds: 10, seed: 99_999 });

    expect(other.milestones).toEqual(seeded.milestones);
  });

  it('reports every milestone tier the approved windows describe', { timeout: 30_000 }, () => {
    const { milestones } = greedyRun();

    for (let tier = 2; tier <= MAX_DEPTH_TIER; tier += 1) {
      expect(milestones[`tier${tier}`], `tier${tier} was never recorded`).toBeTypeOf('number');
    }
    expect(milestones.prestige).toBeTypeOf('number');
  });

  it('the greedy strategy reaches Depth 2 within the approved minimum and maximum time', { timeout: 30_000 }, () => {
    expectWithinWindow('Depth 2 (greedy)', greedyRun().milestones.tier2, APPROVED.depth[2]);
  });

  it('the greedy strategy reaches Depth 3 within the approved window', { timeout: 30_000 }, () => {
    expectWithinWindow('Depth 3 (greedy)', greedyRun().milestones.tier3, APPROVED.depth[3]);
  });

  it('the greedy strategy reaches the deepest tiers within their approved windows', { timeout: 30_000 }, () => {
    const { milestones } = greedyRun();

    expectWithinWindow('Depth 4 (greedy)', milestones.tier4, APPROVED.depth[4]);
    expectWithinWindow('Depth 5 (greedy)', milestones.tier5, APPROVED.depth[5]);
  });

  it('the balanced strategy also stays inside the approved windows, but never ahead of greedy', { timeout: 30_000 }, () => {
    const greedy = greedyRun().milestones;
    const balanced = balancedRun().milestones;

    // Its cushion is what makes it a distinct line: without one it collapses into a copy of the
    // greedy strategy, which is exactly the regression this assertion exists to catch.
    expect(balanced.tier2).toBeGreaterThan(greedy.tier2);

    for (let tier = 2; tier <= MAX_DEPTH_TIER; tier += 1) {
      expectWithinWindow(`Depth ${tier} (balanced)`, balanced[`tier${tier}`], APPROVED.depth[tier]);
      expect(balanced[`tier${tier}`]).toBeGreaterThanOrEqual(greedy[`tier${tier}`]);
    }
  });

  it('never produces negative currency, resources, or drill counts', { timeout: 30_000 }, () => {
    const result = run({
      strategy: STRATEGIES.GREEDY,
      maxSeconds: HORIZON_SECONDS,
      stepSeconds: STEP_SECONDS,
      sampleSeconds: 300,
    });

    expect(result.series.length).toBeGreaterThan(100);
    for (const point of result.series) {
      expect(point.currency).toBeGreaterThanOrEqual(0);
      expect(point.lifetimeEarned).toBeGreaterThanOrEqual(0);
      expect(point.totalDrills).toBeGreaterThanOrEqual(0);
    }

    expect(result.finalState.currency).toBeGreaterThanOrEqual(0);
    for (const count of Object.values(result.finalState.drills)) {
      expect(count).toBeGreaterThanOrEqual(0);
    }
    for (const amount of Object.values(result.finalState.resources)) {
      expect(amount).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps currency monotonic across the sell-only region before the first drill', { timeout: 30_000 }, () => {
    // Before any drill is owned the mine only taps and sells, so banked currency can never fall.
    // Sampled per second so the opening is actually observed rather than skipped over.
    const opening = run({
      strategy: STRATEGIES.GREEDY,
      maxSeconds: 600,
      stepSeconds: 1,
      sampleSeconds: 1,
    }).series.filter((point) => point.totalDrills === 0);

    expect(opening.length).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < opening.length; index += 1) {
      expect(opening[index].currency).toBeGreaterThanOrEqual(opening[index - 1].currency);
    }
  });

  it('never lets lifetime earnings fall, in any region', { timeout: 30_000 }, () => {
    const { series } = greedyRun();

    for (let index = 1; index < series.length; index += 1) {
      expect(series[index].lifetimeEarned).toBeGreaterThanOrEqual(series[index - 1].lifetimeEarned);
    }
  });

  it('crosses the first prestige threshold within the approved window', { timeout: 30_000 }, () => {
    const { milestones } = greedyRun();

    expect(milestones.prestige).toBeGreaterThan(0);
    expect(milestones.prestige).toBeLessThanOrEqual(APPROVED.firstPrestigeMaxSeconds);
  });

  it('a later cycle with a permanent multiplier is faster than the first', { timeout: 30_000 }, () => {
    const fresh = simulateRun({ strategy: STRATEGIES.GREEDY, maxSeconds: 4 * 3_600, stepSeconds: 5 });
    const firstCycleSeconds = fresh.milestones.tier3;

    const retired = structuredClone(fresh.finalState);
    const prestige = performPrestige(retired);
    expect(prestige.ok).toBe(true);
    expect(retired.prestige.multiplier).toBeGreaterThan(1);

    const secondCycle = simulateRun({ state: retired, maxSeconds: 4 * 3_600, stepSeconds: 5 });

    expect(secondCycle.milestones.tier3).toBeLessThan(firstCycleSeconds);
  });

  it('keeps offline catch-up at the approved 24h cap a minor share of a day of active play', { timeout: 30_000 }, () => {
    // The cap is itself one of the approved P12 numbers, so pin it: raising it is an edit to the
    // plan rather than a quiet tuning tweak, and it is what bounds the absence below.
    expect(config.offline.capSeconds).toBe(DAY_SECONDS);

    for (const startingSeconds of [2 * 3_600, 6 * 3_600]) {
      const started = simulateRun({
        strategy: STRATEGIES.GREEDY,
        maxSeconds: startingSeconds,
        stepSeconds: 5,
      }).finalState;

      const active = earnedByPlaying(started, DAY_SECONDS);
      const away = earnedWhileAway(started);

      expect(away, 'an absence must still be worth something').toBeGreaterThan(0);
      expect(
        away / active,
        `offline share after ${startingSeconds / 3_600}h was ${(away / active) * 100}%`,
      ).toBeLessThanOrEqual(APPROVED.offlineShareMax);
    }
  });

  it('a long-horizon simulation over many prestige cycles never produces Infinity', { timeout: 30_000 }, () => {
    const result = simulateRun({
      strategy: STRATEGIES.GREEDY,
      maxSeconds: 30 * 86_400,
      stepSeconds: 60,
      sampleSeconds: 3_600,
      prestigeAt: prestigeThreshold(),
    });

    expect(result.prestiges).toBeGreaterThan(1);
    for (const point of result.series) {
      expect(Number.isFinite(point.currency)).toBe(true);
      expect(Number.isFinite(point.lifetimeEarned)).toBe(true);
    }
    expect(Number.isFinite(M.toNumber(result.finalState.currency))).toBe(true);
  }, 120_000);
});
