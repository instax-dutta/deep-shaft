/**
 * Core game state: creation, validation, migration, and (de)serialization.
 *
 * This module is pure. It never touches Phaser, the DOM, `localStorage`, or the clock, so
 * every rule here is exercisable in Vitest with plain values.
 *
 * Loading is an *outcome*, not a boolean. "No save yet" and "this save is unreadable" are
 * different situations for the player — one is a fresh start, the other is a recovery — so
 * `migrateSave` reports which one happened instead of returning a bare `null` that the caller
 * cannot distinguish.
 */

import { getAchievement } from '../data/achievements.js';
import { AUTOMATION_KINDS } from '../data/automation.js';
import { config } from '../data/config.js';
import { getPrestigeUpgrade } from '../data/prestigeUpgrades.js';
import { createEventState } from './events.js';
import { M } from './numbers/magnitude.js';
import { normalizeSettings } from './settings.js';
import { createTutorialState } from './tutorial.js';
import { normalizeWorker } from './workers.js';

export const SAVE_SCHEMA_VERSION = config.persistence.schemaVersion;

/** Machine reasons a save could not be loaded. The composition layer maps these to copy. */
export const SAVE_LOAD_REASONS = Object.freeze({
  ABSENT: 'absent',
  CORRUPT: 'corrupt',
  UNSUPPORTED_FUTURE: 'unsupported_future',
  NOT_AN_OBJECT: 'not_an_object',
});

const AUTOMATION_KINDS_LIST = Object.freeze(Object.values(AUTOMATION_KINDS));

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNumber(value, fallback) {
  const numeric = toFiniteNumberOrNull(value);
  return numeric === null ? fallback : numeric;
}

function toNonNegativeIntegerOrNull(value) {
  const numeric = toFiniteNumberOrNull(value);
  return numeric !== null && numeric >= 0 ? Math.floor(numeric) : null;
}

function toCount(value, fallback) {
  const integer = toNonNegativeIntegerOrNull(value);
  return integer === null ? fallback : integer;
}

/** Revives a persisted magnitude (a plain number, a decimal string, or a live magnitude). */
function toMagnitude(value, fallback) {
  const magnitude = M.from(value);
  return magnitude === null ? fallback : magnitude;
}

function toNonNegativeMagnitudeOrNull(value) {
  const magnitude = M.from(value);
  return magnitude !== null && M.gte(magnitude, 0) ? magnitude : null;
}

/** Depth tiers are 1-based and clamped to the configured tier count. */
function toDepthTier(value) {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null || numeric < 1) {
    return 1;
  }
  return Math.min(Math.floor(numeric), config.depth.tierCount);
}

/** Copies an id -> amount map, discarding entries that are not usable amounts. */
function sanitizeAmountMap(value, { integer = false } = {}) {
  if (!isRecord(value)) {
    return {};
  }

  const result = {};
  for (const [id, raw] of Object.entries(value)) {
    const amount = integer ? toNonNegativeIntegerOrNull(raw) : toNonNegativeMagnitudeOrNull(raw);
    if (amount !== null) {
      result[id] = amount;
    }
  }
  return result;
}

/** Rebuilds the purchased upgrade map, dropping unknown ids and out-of-range levels. */
function sanitizeUpgrades(value) {
  if (!isRecord(value)) {
    return {};
  }

  const upgrades = {};
  for (const [id, raw] of Object.entries(value)) {
    const definition = getPrestigeUpgrade(id);
    if (!definition) {
      continue;
    }
    const level = toNonNegativeIntegerOrNull(raw);
    if (level !== null && level > 0) {
      upgrades[id] = Math.min(level, definition.maxLevel);
    }
  }
  return upgrades;
}

/** Rebuilds the earned-achievement bookkeeping, dropping unknown ids and bad timestamps. */
function sanitizeAchievements(value) {
  const candidate = isRecord(value) ? value : {};
  const earnedSource = isRecord(candidate.earned) ? candidate.earned : {};
  const earnedAtSource = isRecord(candidate.firstEarnedAt) ? candidate.firstEarnedAt : {};
  const earned = {};
  const firstEarnedAt = {};

  for (const [id, flag] of Object.entries(earnedSource)) {
    if (flag !== true || !getAchievement(id)) {
      continue;
    }
    earned[id] = true;
    const at = toFiniteNumberOrNull(earnedAtSource[id]);
    if (at !== null) {
      firstEarnedAt[id] = at;
    }
  }

  return { earned, firstEarnedAt };
}

/** Rebuilds the automation toggles, accepting only booleans and only known kinds. */
function sanitizeAutomation(value) {
  const candidate = isRecord(value) ? value : {};
  const automation = {};
  for (const kind of AUTOMATION_KINDS_LIST) {
    automation[kind] = candidate[kind] === true;
  }
  return automation;
}

/** Settings normalization is owned by `core/settings.js`; the schema (`settings`) was fixed
 * here in the version 1 -> 2 migration, and its rules live in one place. */
function sanitizeSettings(value) {
  return normalizeSettings(value);
}

/** Repairs the tutorial record: a fresh step count is the only usable fallback. */
function sanitizeTutorial(value) {
  const candidate = isRecord(value) ? value : {};
  const tutorial = createTutorialState();
  const step = toNonNegativeIntegerOrNull(candidate.step);
  if (step !== null && step >= 1) {
    tutorial.step = step;
  }
  tutorial.completed = candidate.completed === true;
  return tutorial;
}

/** A brand new mine: Tier 1, nothing owned, nothing earned. */
export function createInitialState() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    currency: config.economy.startingCurrency,
    depthTier: 1,
    resources: {},
    drills: {},
    workers: [],
    prestige: {
      count: 0,
      multiplier: 1,
      lifetimeEarned: 0,
      points: 0,
      upgrades: {},
    },
    stats: {
      totalEarned: 0,
      manualExtractions: 0,
    },
    settings: sanitizeSettings(null),
    // The first-run tutorial. A career fact, not run progress: prestige never re-runs it.
    tutorial: createTutorialState(),
    // Automation unlocks are gated by prestige upgrades; these toggles are the player's opt-in
    // and default off, so a locked or unused behaviour never runs.
    automation: sanitizeAutomation(null),
    // Career achievements: goals, not power, and never cleared by a prestige reset.
    achievements: sanitizeAchievements(null),
    events: createEventState(),
    lastSavedAt: 0,
  };
}

/**
 * Ordered migration steps, keyed by the version they upgrade *from*.
 *
 * Every v2 phase extends the `1 -> 2` default block rather than adding a new version number,
 * so a version 1 save always lands on the current shape in one hop.
 */
export const MIGRATIONS = Object.freeze({
  1: (save) => ({
    ...save,
    schemaVersion: 2,
    settings: sanitizeSettings(save.settings),
    tutorial: sanitizeTutorial(save.tutorial),
  }),
});

function runMigrations(save) {
  let current = save;
  let version = save.schemaVersion;

  while (version < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (typeof step !== 'function') {
      return null;
    }
    current = step(current);
    version = current.schemaVersion;
  }
  return current;
}

/** True when `candidate` carries a version the migration chain can reach. */
export function isSupportedSave(candidate) {
  return (
    isRecord(candidate) &&
    Number.isInteger(candidate.schemaVersion) &&
    candidate.schemaVersion >= 1 &&
    candidate.schemaVersion <= SAVE_SCHEMA_VERSION
  );
}

/** Normalizes a migrated save into a complete, trusted state object. */
function sanitizeState(candidate) {
  const base = createInitialState();
  const prestige = isRecord(candidate.prestige) ? candidate.prestige : {};
  const stats = isRecord(candidate.stats) ? candidate.stats : {};

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    currency: toMagnitude(candidate.currency, base.currency),
    depthTier: toDepthTier(candidate.depthTier),
    resources: sanitizeAmountMap(candidate.resources),
    drills: sanitizeAmountMap(candidate.drills, { integer: true }),
    workers: Array.isArray(candidate.workers)
      ? candidate.workers.map(normalizeWorker).filter(Boolean)
      : [],
    prestige: {
      count: toCount(prestige.count, base.prestige.count),
      multiplier: M.max(1, toMagnitude(prestige.multiplier, base.prestige.multiplier)),
      lifetimeEarned: toMagnitude(prestige.lifetimeEarned, base.prestige.lifetimeEarned),
      points: toCount(prestige.points, base.prestige.points),
      upgrades: sanitizeUpgrades(prestige.upgrades),
    },
    stats: {
      totalEarned: toMagnitude(stats.totalEarned, base.stats.totalEarned),
      manualExtractions: toCount(stats.manualExtractions, base.stats.manualExtractions),
    },
    settings: sanitizeSettings(candidate.settings),
    tutorial: sanitizeTutorial(candidate.tutorial),
    automation: sanitizeAutomation(candidate.automation),
    achievements: sanitizeAchievements(candidate.achievements),
    // Events are transient: a cave-in from the previous session must not still be stinging, so
    // the schedule restarts fresh on every load.
    events: createEventState(),
    lastSavedAt: toNumber(candidate.lastSavedAt, base.lastSavedAt),
  };
}

/**
 * Migrates and normalizes a parsed save candidate.
 *
 * Returns `{ ok: true, state, fromVersion }` on success, or `{ ok: false, reason }` where
 * `reason` is one of `SAVE_LOAD_REASONS`. Never throws and never mutates its input.
 */
export function migrateSave(candidate) {
  if (candidate === null || candidate === undefined) {
    return { ok: false, reason: SAVE_LOAD_REASONS.ABSENT };
  }
  if (!isRecord(candidate)) {
    return { ok: false, reason: SAVE_LOAD_REASONS.NOT_AN_OBJECT };
  }

  const fromVersion = candidate.schemaVersion;
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    return { ok: false, reason: SAVE_LOAD_REASONS.CORRUPT };
  }
  if (fromVersion > SAVE_SCHEMA_VERSION) {
    return { ok: false, reason: SAVE_LOAD_REASONS.UNSUPPORTED_FUTURE };
  }

  const migrated = runMigrations(candidate);
  if (!migrated) {
    return { ok: false, reason: SAVE_LOAD_REASONS.CORRUPT };
  }

  return { ok: true, state: sanitizeState(migrated), fromVersion };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

/**
 * Parses a persisted save string and reports a structured outcome.
 *
 * `absent` covers an empty slot; `corrupt` covers a string that is not JSON at all. Any other
 * reason comes from `migrateSave`.
 */
export function deserializeResult(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, reason: SAVE_LOAD_REASONS.ABSENT };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: SAVE_LOAD_REASONS.CORRUPT };
  }

  return migrateSave(parsed);
}

/** Backward-compatible convenience wrapper: the state, or `null` when it could not be read. */
export function deserializeState(raw) {
  const result = deserializeResult(raw);
  return result.ok ? result.state : null;
}
