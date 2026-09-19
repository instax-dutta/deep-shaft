import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, normalizeSettings, setSetting } from '../../src/core/settings.js';
import { createInitialState } from '../../src/core/state.js';

describe('DEFAULT_SETTINGS', () => {
  it('defaults are complete and frozen', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(DEFAULT_SETTINGS.notation).toBe('suffix');
    expect(DEFAULT_SETTINGS.reducedMotion).toBe(false);
    expect(DEFAULT_SETTINGS.sound).toBe(true);
    expect(DEFAULT_SETTINGS.haptics).toBe(true);
  });
});

describe('normalizeSettings', () => {
  it('fills missing keys and drops unknown keys', () => {
    const settings = normalizeSettings({ sound: false, nonsense: 42 });

    expect(settings).toEqual({ ...DEFAULT_SETTINGS, sound: false });
    expect(Object.prototype.hasOwnProperty.call(settings, 'nonsense')).toBe(false);
  });

  it('rejects invalid enum values and falls back to the default', () => {
    expect(normalizeSettings({ notation: 'roman' }).notation).toBe('suffix');
    expect(normalizeSettings({ notation: 'scientific' }).notation).toBe('scientific');
    expect(normalizeSettings({ reducedMotion: 'yes' }).reducedMotion).toBe(false);
  });

  it('normalizes absent and non-object input to the defaults', () => {
    expect(normalizeSettings(null)).toEqual({ ...DEFAULT_SETTINGS });
    expect(normalizeSettings('nope')).toEqual({ ...DEFAULT_SETTINGS });
  });
});

describe('setSetting', () => {
  it('stores a valid value', () => {
    const state = createInitialState();

    expect(setSetting(state, 'notation', 'engineering')).toEqual({
      ok: true,
      key: 'notation',
      value: 'engineering',
    });
    expect(state.settings.notation).toBe('engineering');
  });

  it('refuses an unknown key with state unchanged', () => {
    const state = createInitialState();
    const before = JSON.parse(JSON.stringify(state));

    expect(setSetting(state, 'nope', true)).toEqual({ ok: false, reason: 'unknown_setting' });
    expect(state).toEqual(before);
  });

  it('refuses an invalid value with state unchanged', () => {
    const state = createInitialState();
    const before = JSON.parse(JSON.stringify(state));

    expect(setSetting(state, 'notation', 'roman')).toEqual({ ok: false, reason: 'invalid_value' });
    expect(state).toEqual(before);
  });
});
