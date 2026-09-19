/**
 * Player settings.
 *
 * Settings are persisted, so they can never be trusted: `normalizeSettings` rebuilds a complete,
 * valid object from whatever was stored, dropping unknown keys and substituting defaults for bad
 * values. `setSetting` is the only mutation path and refuses unknown keys and invalid values with
 * the state left byte-for-byte unchanged.
 */

export const DEFAULT_SETTINGS = Object.freeze({
  notation: 'suffix',
  reducedMotion: false,
  sound: true,
  haptics: true,
});

const NOTATIONS = Object.freeze(['suffix', 'scientific', 'engineering']);

/** Per-key validator. Presence here is what makes a key settable. */
const VALIDATORS = Object.freeze({
  notation: (value) => NOTATIONS.includes(value),
  reducedMotion: (value) => typeof value === 'boolean',
  sound: (value) => typeof value === 'boolean',
  haptics: (value) => typeof value === 'boolean',
});

/** Rebuilds a complete, valid settings block from untrusted input. */
export function normalizeSettings(candidate) {
  const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : {};
  const settings = {};

  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    settings[key] = VALIDATORS[key](source[key]) ? source[key] : fallback;
  }
  return settings;
}

/** Stores one setting, or reports why it was refused. */
export function setSetting(state, key, value) {
  if (!Object.prototype.hasOwnProperty.call(VALIDATORS, key)) {
    return { ok: false, reason: 'unknown_setting' };
  }
  if (!VALIDATORS[key](value)) {
    return { ok: false, reason: 'invalid_value' };
  }

  state.settings[key] = value;
  return { ok: true, key, value };
}
