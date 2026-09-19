/**
 * Save export and import.
 *
 * The player owns their save: it can be copied out as text and pasted back later or on
 * another device. The export wraps the state in a small envelope so an import can tell "this
 * is a Deep Shaft save" from "this is some other JSON" before it touches anything.
 *
 * Pure and browser-free: this module only turns strings into states and states into strings.
 */

import { SAVE_LOAD_REASONS, migrateSave } from './state.js';

/** Fields that identify an export as ours. Versioning is delegated to the state schema. */
export const SAVE_FILE_KIND = 'deep-shaft-save';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Serializes a state into a human-readable export string.
 *
 * Pretty-printed deliberately: an export is a recovery artifact, and a player who opens it
 * should be able to see that it contains their mine.
 */
export function exportSave(state) {
  return JSON.stringify(
    {
      kind: SAVE_FILE_KIND,
      schemaVersion: state.schemaVersion,
      exportedAt: state.lastSavedAt ?? 0,
      state,
    },
    null,
    2,
  );
}

/**
 * Parses an export string back into a trusted state.
 *
 * Returns `{ ok: true, state }` or `{ ok: false, reason }` where `reason` is one of
 * `'empty' | 'corrupt' | 'not_a_save' | 'unsupported_future'`. Never throws, and never
 * touches an existing save — the caller decides whether to replace anything.
 */
export function importSave(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'empty' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'corrupt' };
  }

  if (!isRecord(parsed) || parsed.kind !== SAVE_FILE_KIND || !isRecord(parsed.state)) {
    return { ok: false, reason: 'not_a_save' };
  }

  const migrated = migrateSave(parsed.state);
  if (!migrated.ok) {
    // A future-version export is a specific, explainable refusal; anything else is simply not
    // a save we can use.
    const reason =
      migrated.reason === SAVE_LOAD_REASONS.UNSUPPORTED_FUTURE
        ? 'unsupported_future'
        : 'not_a_save';
    return { ok: false, reason };
  }

  return { ok: true, state: migrated.state };
}
