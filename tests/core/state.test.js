import { describe, expect, it } from 'vitest';

import { M } from '../../src/core/numbers/magnitude.js';
import {
  SAVE_SCHEMA_VERSION,
  createInitialState,
  deserializeResult,
  deserializeState,
  isSupportedSave,
  migrateSave,
  serializeState,
} from '../../src/core/state.js';

describe('createInitialState', () => {
  it('starts a new mine at Tier 1 with no currency and empty inventories', () => {
    const state = createInitialState();

    expect(state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(state.depthTier).toBe(1);
    expect(state.currency).toBe(0);
    expect(state.resources).toEqual({});
    expect(state.drills).toEqual({});
    expect(state.workers).toEqual([]);
  });

  it('starts with no prestige progress but a neutral production multiplier', () => {
    const state = createInitialState();

    expect(state.prestige.count).toBe(0);
    expect(state.prestige.multiplier).toBe(1);
    expect(state.prestige.lifetimeEarned).toBe(0);
  });

  it('records lifetime statistics used by prestige and offline reporting', () => {
    const state = createInitialState();

    expect(state.stats.totalEarned).toBe(0);
    expect(state.stats.manualExtractions).toBe(0);
    expect(state.lastSavedAt).toBe(0);
  });

  it('carries a complete settings block introduced in schema version 2', () => {
    const state = createInitialState();

    expect(state.settings.notation).toBe('suffix');
    expect(state.settings.reducedMotion).toBe(false);
  });
});

describe('save serialization', () => {
  it('round-trips a state object through JSON without losing fields', () => {
    const state = createInitialState();
    state.currency = 1234.5;
    state.resources = { 'tier1-ore': 42.25 };
    state.drills = { 'drill-1': 3 };

    expect(deserializeState(serializeState(state))).toEqual(state);
  });

  it('returns null for malformed JSON instead of throwing', () => {
    expect(deserializeState('{ not json')).toBeNull();
  });

  it('returns null for absent and non-string input', () => {
    expect(deserializeState(null)).toBeNull();
    expect(deserializeState(undefined)).toBeNull();
    expect(deserializeState('')).toBeNull();
  });

  it('round-trips a beyond-float value through serialization', () => {
    const state = createInitialState();
    state.currency = M.from('1e400');

    const restored = deserializeState(serializeState(state));

    expect(M.toString(restored.currency)).toBe(M.toString(state.currency));
    expect(M.isFinite(restored.currency)).toBe(false);
  });
});

describe('deserializeResult', () => {
  it('reports corrupt JSON as corrupt, not as a fresh player', () => {
    expect(deserializeResult('{ not json')).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('reports an absent save as absent', () => {
    expect(deserializeResult(null)).toEqual({ ok: false, reason: 'absent' });
    expect(deserializeResult(undefined)).toEqual({ ok: false, reason: 'absent' });
    expect(deserializeResult('')).toEqual({ ok: false, reason: 'absent' });
  });

  it('returns the migrated state and its origin version for a valid save', () => {
    const result = deserializeResult(
      JSON.stringify({ schemaVersion: 1, currency: 321 }),
    );

    expect(result.ok).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.state.currency).toBe(321);
    expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });
});

describe('isSupportedSave', () => {
  it('accepts every version the migration chain knows how to reach', () => {
    expect(isSupportedSave({ schemaVersion: 1 })).toBe(true);
    expect(isSupportedSave({ schemaVersion: SAVE_SCHEMA_VERSION })).toBe(true);
  });

  it('rejects absent, non-object, array, and future-version candidates', () => {
    expect(isSupportedSave(null)).toBe(false);
    expect(isSupportedSave('save')).toBe(false);
    expect(isSupportedSave([])).toBe(false);
    expect(isSupportedSave({ schemaVersion: SAVE_SCHEMA_VERSION + 1 })).toBe(false);
    expect(isSupportedSave({})).toBe(false);
  });
});

describe('migrateSave', () => {
  it('reports an absent candidate as absent', () => {
    expect(migrateSave(null)).toEqual({ ok: false, reason: 'absent' });
    expect(migrateSave(undefined)).toEqual({ ok: false, reason: 'absent' });
  });

  it('reports a non-object candidate as not_an_object', () => {
    expect(migrateSave('save').reason).toBe('not_an_object');
    expect(migrateSave(42).reason).toBe('not_an_object');
    expect(migrateSave([]).reason).toBe('not_an_object');
  });

  it('refuses a save from an unsupported future version with a reason instead of wiping it', () => {
    const candidate = { schemaVersion: SAVE_SCHEMA_VERSION + 4, currency: 12_345 };
    const snapshot = structuredClone(candidate);

    const result = migrateSave(candidate);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsupported_future');
    expect(candidate).toEqual(snapshot);
  });

  it('migrates a version 1 save to version 2 and keeps currency, drills, workers, and prestige', () => {
    const result = migrateSave({
      schemaVersion: 1,
      currency: 900,
      depthTier: 3,
      resources: { 'tier1-ore': 10 },
      drills: { 'drill-1': 2 },
      workers: [
        { id: 'worker-1', name: 'Ada Stone', level: 2, speed: 0.1, luck: 0.03, assignment: null },
      ],
      prestige: { count: 4, multiplier: 1.5, lifetimeEarned: 5_000 },
    });

    expect(result.ok).toBe(true);
    expect(result.fromVersion).toBe(1);
    expect(result.state.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(result.state.currency).toBe(900);
    expect(result.state.depthTier).toBe(3);
    expect(result.state.resources).toEqual({ 'tier1-ore': 10 });
    expect(result.state.drills).toEqual({ 'drill-1': 2 });
    expect(result.state.workers).toHaveLength(1);
    expect(result.state.workers[0].name).toBe('Ada Stone');
    expect(result.state.prestige.count).toBe(4);
    expect(result.state.prestige.multiplier).toBe(1.5);
    expect(result.state.prestige.lifetimeEarned).toBe(5_000);
  });

  it('fills fields introduced in version 2 with defaults', () => {
    const result = migrateSave({ schemaVersion: 1, currency: 5 });

    expect(result.state.settings).toEqual(createInitialState().settings);
  });

  it('fills fields missing from a save with defaults', () => {
    const result = migrateSave({ schemaVersion: SAVE_SCHEMA_VERSION, currency: 5 });

    expect(result.state.stats.totalEarned).toBe(0);
    expect(result.state.prestige.count).toBe(0);
    expect(result.state.prestige.multiplier).toBe(1);
    expect(result.state.prestige.lifetimeEarned).toBe(0);
    expect(result.state.workers).toEqual([]);
    expect(result.state.depthTier).toBe(1);
  });

  it('repairs a save with a valid version but unusable fields field by field', () => {
    const result = migrateSave({
      schemaVersion: SAVE_SCHEMA_VERSION,
      currency: 'lots',
      lastSavedAt: Number.NaN,
      depthTier: -3,
      resources: { 'tier1-ore': 'x', 'tier1-gems': 5 },
      drills: { 'drill-1': 2.9, 'drill-2': -1 },
      workers: { 'worker-1': {} },
      settings: { notation: 'bogus', reducedMotion: 'yes' },
    });

    expect(result.ok).toBe(true);
    expect(result.state.currency).toBe(0);
    expect(result.state.lastSavedAt).toBe(0);
    expect(result.state.depthTier).toBe(1);
    expect(result.state.resources).toEqual({ 'tier1-gems': 5 });
    expect(result.state.drills).toEqual({ 'drill-1': 2 });
    expect(result.state.workers).toEqual([]);
  });

  it('does not mutate the candidate save it is given', () => {
    const candidate = { schemaVersion: SAVE_SCHEMA_VERSION, currency: 12 };
    const snapshot = structuredClone(candidate);

    migrateSave(candidate);

    expect(candidate).toEqual(snapshot);
  });
});
