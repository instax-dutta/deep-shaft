import { describe, expect, it } from 'vitest';

import { exportSave, importSave } from '../../src/core/saveTransfer.js';
import { SAVE_SCHEMA_VERSION, createInitialState } from '../../src/core/state.js';

function populatedState() {
  const state = createInitialState();
  state.currency = 4_321.5;
  state.depthTier = 3;
  state.resources = { 'tier1-ore': 12.5, 'tier3-gems': 2 };
  state.drills = { 'drill-1': 4, 'drill-3': 1 };
  state.workers = [
    { id: 'worker-1', name: 'Ada Stone', level: 3, speed: 0.15, luck: 0.05, assignment: null },
  ];
  state.prestige.count = 2;
  state.prestige.multiplier = 2.5;
  state.prestige.lifetimeEarned = 99_000;
  state.stats.totalEarned = 12_345;
  state.stats.manualExtractions = 77;
  state.lastSavedAt = 1_700_000_000_000;
  return state;
}

describe('exportSave / importSave', () => {
  it('round-trips every field through export and import', () => {
    const state = populatedState();

    const result = importSave(exportSave(state));

    expect(result.ok).toBe(true);
    expect(result.state).toEqual(state);
  });

  it('produces a readable, non-empty string', () => {
    const exported = exportSave(createInitialState());

    expect(typeof exported).toBe('string');
    expect(exported.length).toBeGreaterThan(0);
    expect(exported).toContain('\n');
  });

  it('refuses empty input as empty', () => {
    expect(importSave('')).toEqual({ ok: false, reason: 'empty' });
    expect(importSave('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(importSave(null)).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses foreign JSON as not_a_save', () => {
    expect(importSave('{"hello":"world"}').reason).toBe('not_a_save');
    expect(importSave('{"app":"other-game","state":{}}').reason).toBe('not_a_save');
  });

  it('refuses a truncated export as corrupt', () => {
    const exported = exportSave(populatedState());
    const truncated = exported.slice(0, Math.floor(exported.length / 2));

    expect(importSave(truncated).reason).toBe('corrupt');
  });

  it('refuses a future-version export without dropping the current save', () => {
    const futureState = createInitialState();
    futureState.schemaVersion = SAVE_SCHEMA_VERSION + 5;
    futureState.currency = 1_000_000;

    const result = importSave(exportSave(futureState));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported_future');
    expect(result.state).toBeUndefined();
  });
});
