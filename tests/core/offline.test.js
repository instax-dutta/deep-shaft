import { describe, expect, it } from 'vitest';

import { applyOfflineProgress } from '../../src/core/offline.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { getDrill } from '../../src/data/drills.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const firstDrill = getDrill('drill-1');
const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE).id;
const HOUR_MS = 3_600_000;
const NOW = 1_700_000_000_000;

function savedMine({ gapMs = HOUR_MS, drills = { [firstDrill.id]: 1 } } = {}) {
  const state = createInitialState();
  state.drills = { ...drills };
  state.lastSavedAt = NOW - gapMs;
  return state;
}

describe('applyOfflineProgress', () => {
  it('grants nothing for a brand new mine that has never been saved', () => {
    const state = createInitialState();
    state.drills[firstDrill.id] = 1;
    state.lastSavedAt = 0;

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.seconds).toBe(0);
    expect(result.gains).toEqual({});
  });

  it('grants nothing when no time has passed', () => {
    const state = savedMine({ gapMs: 0 });

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.seconds).toBe(0);
    expect(result.gains).toEqual({});
  });

  it('banks production for the elapsed absence', () => {
    const state = savedMine();

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.seconds).toBe(3600);
    expect(state.resources[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 3600, 6);
  });

  it('reports the gains it credited', () => {
    const state = savedMine({ gapMs: 2 * HOUR_MS });

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.gains[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 7200, 6);
  });

  it('clamps a long absence to the configured cap', () => {
    const state = savedMine({ gapMs: 48 * HOUR_MS });
    const capSeconds = config.offline.capSeconds;

    const result = applyOfflineProgress(state, { nowMs: NOW, capSeconds });

    expect(result.seconds).toBe(capSeconds);
    expect(state.resources[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * capSeconds, 6);
  });

  it('honours a caller-supplied cap', () => {
    const state = savedMine({ gapMs: HOUR_MS });

    const result = applyOfflineProgress(state, { nowMs: NOW, capSeconds: 60 });

    expect(result.seconds).toBe(60);
  });

  it('grants nothing when the saved timestamp is in the future', () => {
    const state = savedMine({ gapMs: -HOUR_MS });

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.seconds).toBe(0);
    expect(state.resources).toEqual({});
  });

  it('grants nothing when no drills were running', () => {
    const state = savedMine({ drills: {} });

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.gains).toEqual({});
    expect(state.resources).toEqual({});
  });

  it('applies the permanent prestige multiplier to offline gains', () => {
    const state = savedMine();
    state.prestige.multiplier = 4;

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.gains[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 3600 * 4, 6);
  });

  it('handles non-finite clock values without corrupting the mine', () => {
    const state = savedMine();

    const result = applyOfflineProgress(state, { nowMs: Number.NaN });

    expect(result.seconds).toBe(0);
    expect(state.resources).toEqual({});
  });
});
