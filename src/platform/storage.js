/**
 * Persistence adapter.
 *
 * `localStorage` is a browser boundary here and nowhere else. Every operation reports failure
 * through a structured result instead of throwing, so a blocked or full storage quota can
 * never destroy the in-memory session.
 *
 * Writes are duplicated into a backup slot. If the primary save is later found unreadable,
 * `loadResult` falls through to the backup and reports that recovery rather than starting a
 * new mine over the player's existing progress.
 */

import { deserializeResult, serializeState } from '../core/state.js';
import { config } from '../data/config.js';

/** Storage stand-in used when the browser refuses to provide one. */
const UNAVAILABLE_BACKEND = Object.freeze({
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

/**
 * Wraps a Storage-like backend with save/load/backup/clear behavior.
 *
 * The backend is injected so tests can run without a browser.
 */
export function createStorage(
  backend,
  { key = config.persistence.storageKey, backupKey = config.persistence.backupKey } = {},
) {
  function readRaw(storageKey) {
    try {
      return backend.getItem(storageKey);
    } catch {
      return null;
    }
  }

  function writeRaw(storageKey, value) {
    try {
      backend.setItem(storageKey, value);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'storage_unavailable' };
    }
  }

  function removeRaw(storageKey) {
    try {
      backend.removeItem(storageKey);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'storage_unavailable' };
    }
  }

  return {
    key,
    backupKey,

    /** True when a primary save slot exists, readable or not. */
    hasSave() {
      return readRaw(key) !== null;
    },

    /**
     * Loads with a structured outcome.
     *
     * `{ ok: true, state, source: 'primary' | 'backup' }` on success, or
     * `{ ok: false, reason }` where `reason` is `'absent'`, `'corrupt'`, or
     * `'unsupported_future'`.
     */
    loadResult() {
      const rawPrimary = readRaw(key);
      const primary = deserializeResult(rawPrimary);
      if (primary.ok) {
        return { ok: true, state: primary.state, source: 'primary' };
      }

      // An empty primary slot is a fresh player. Do not silently resurrect a stale backup: a
      // completed reset should stay reset.
      if (primary.reason === 'absent') {
        return { ok: false, reason: 'absent' };
      }

      const rawBackup = readRaw(backupKey);
      const backup = deserializeResult(rawBackup);
      if (backup.ok) {
        return { ok: true, state: backup.state, source: 'backup' };
      }

      // Nothing usable anywhere. Preserve the unreadable primary in the backup slot so the
      // player's bytes are not destroyed by starting a new mine over them.
      if (rawBackup === null && typeof rawPrimary === 'string') {
        writeRaw(backupKey, rawPrimary);
      }

      return { ok: false, reason: primary.reason };
    },

    /** Backward-compatible convenience wrapper: the state, or `null`. */
    load() {
      const result = this.loadResult();
      return result.ok ? result.state : null;
    },

    /** The backup save, or `null` when there is none or it is unreadable. */
    loadBackup() {
      const result = deserializeResult(readRaw(backupKey));
      return result.ok ? result.state : null;
    },

    save(state) {
      const serialized = serializeState(state);
      // Backup first: if the primary write is interrupted, the recovery slot already holds the
      // last good save.
      writeRaw(backupKey, serialized);
      return writeRaw(key, serialized);
    },

    saveBackup(state) {
      return writeRaw(backupKey, serializeState(state));
    },

    clear() {
      const primary = removeRaw(key);
      const backup = removeRaw(backupKey);
      return primary.ok && backup.ok
        ? { ok: true }
        : { ok: false, reason: 'storage_unavailable' };
    },
  };
}

/**
 * Builds a Storage backend from a window-like host.
 *
 * Some browsers expose `localStorage` but throw on access (private mode, blocked cookies),
 * so the property is probed and each operation is guarded.
 */
export function createLocalStorageBackend(host = globalThis) {
  let store;
  try {
    store = host?.localStorage;
    if (!store) {
      return UNAVAILABLE_BACKEND;
    }
    // Probe once: access can throw even though the property exists.
    store.getItem(config.persistence.storageKey);
  } catch {
    return UNAVAILABLE_BACKEND;
  }

  return {
    getItem(key) {
      try {
        return store.getItem(key);
      } catch {
        return null;
      }
    },
    setItem(key, value) {
      try {
        store.setItem(key, value);
      } catch {
        // Ignore: the in-memory session stays authoritative.
      }
    },
    removeItem(key) {
      try {
        store.removeItem(key);
      } catch {
        // Ignore: nothing to recover.
      }
    },
  };
}
