import { describe, expect, it } from 'vitest';

import {
  achievementProgress,
  earnedAchievements,
  evaluateAchievements,
} from '../../src/core/achievements.js';
import { performPrestige } from '../../src/core/prestige.js';
import { creditEarnings } from '../../src/core/resources.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';

function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

describe('evaluating achievements', () => {
  it('a fresh mine has earned nothing', () => {
    const state = createInitialState();

    expect(state.achievements.earned).toEqual({});
    expect(earnedAchievements(state)).toEqual([]);
  });

  it('evaluating below every threshold awards nothing', () => {
    const state = createInitialState();

    const result = evaluateAchievements(state);

    expect(result.ok).toBe(true);
    expect(result.newlyEarned).toEqual([]);
  });

  it('crossing a threshold awards exactly that achievement, once', () => {
    const state = createInitialState();
    state.stats.manualExtractions = 1;

    const result = evaluateAchievements(state);

    expect(result.newlyEarned.map((entry) => entry.id)).toEqual(['firstOre']);
    expect(state.achievements.earned.firstOre).toBe(true);
  });

  it('re-evaluating an already-earned achievement awards nothing', () => {
    const state = createInitialState();
    state.stats.manualExtractions = 1;
    evaluateAchievements(state);

    const second = evaluateAchievements(state);

    expect(second.newlyEarned).toEqual([]);
  });

  it('does not mutate the mine when nothing is newly earned', () => {
    const state = createInitialState();
    const before = snapshot(state);

    evaluateAchievements(state);

    expect(state).toEqual(before);
  });
});

describe('achievement progress', () => {
  it('progress reports current, target, and a ratio clamped to 0..1', () => {
    const state = createInitialState();

    expect(achievementProgress(state, 'firstOre')).toMatchObject({ current: 0, target: 1, ratio: 0 });

    state.stats.manualExtractions = 5;
    expect(achievementProgress(state, 'firstOre').ratio).toBe(1);
  });

  it('an unknown achievement has no progress', () => {
    expect(achievementProgress(createInitialState(), 'nope')).toBeNull();
  });
});

describe('achievement persistence', () => {
  it('achievements are not cleared by prestige', () => {
    const state = createInitialState();
    creditEarnings(state, config.prestige.thresholdCurrency);
    state.stats.manualExtractions = 1;
    evaluateAchievements(state);

    performPrestige(state);

    expect(state.achievements.earned.firstOre).toBe(true);
    expect(state.achievements.earned.millionaire).toBe(true);
  });
});
