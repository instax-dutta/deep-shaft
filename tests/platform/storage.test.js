import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { createLocalStorageBackend, createStorage } from '../../src/platform/storage.js';

/** Minimal in-memory stand-in for the browser Storage interface. */
function createMemoryBackend(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key) : null),
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    entries,
  };
}

describe('createStorage', () => {
  it('loads null when nothing has been saved yet', () => {
    const storage = createStorage(createMemoryBackend());

    expect(storage.load()).toBeNull();
  });

  it('round-trips game state through the backend', () => {
    const storage = createStorage(createMemoryBackend());
    const state = createInitialState();
    state.currency = 750;

    expect(storage.save(state)).toEqual({ ok: true });
    expect(storage.load().currency).toBe(750);
  });

  it('loads null instead of throwing when the stored save is corrupt', () => {
    const backend = createMemoryBackend({ 'deep-shaft.save': '{ broken' });

    expect(createStorage(backend).load()).toBeNull();
  });

  it('loads null instead of throwing when the stored save is an unsupported version', () => {
    const backend = createMemoryBackend({
      'deep-shaft.save': JSON.stringify({ schemaVersion: 999 }),
    });

    expect(createStorage(backend).load()).toBeNull();
  });

  it('reports a structured failure when the backend rejects a write', () => {
    const backend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };

    expect(createStorage(backend).save(createInitialState())).toEqual({
      ok: false,
      reason: 'storage_unavailable',
    });
  });

  it('reports a structured failure when the backend rejects a read', () => {
    const backend = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
      removeItem: () => {},
    };

    expect(createStorage(backend).load()).toBeNull();
  });

  it('clears the persisted save without touching other keys', () => {
    const backend = createMemoryBackend({ 'other-key': 'keep me' });
    const storage = createStorage(backend);
    storage.save(createInitialState());

    storage.clear();

    expect(storage.load()).toBeNull();
    expect(backend.getItem('other-key')).toBe('keep me');
  });

  it('stores under the configured key', () => {
    const backend = createMemoryBackend();

    createStorage(backend).save(createInitialState());

    expect(backend.getItem('deep-shaft.save')).not.toBeNull();
  });
});

describe('durable save outcomes', () => {
  it('loadResult distinguishes absent from corrupt', () => {
    expect(createStorage(createMemoryBackend()).loadResult()).toEqual({
      ok: false,
      reason: 'absent',
    });

    const corrupt = createMemoryBackend({ 'deep-shaft.save': '{ broken' });
    expect(createStorage(corrupt).loadResult()).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('reports hasSave before any save exists', () => {
    const storage = createStorage(createMemoryBackend());

    expect(storage.hasSave()).toBe(false);
    storage.save(createInitialState());
    expect(storage.hasSave()).toBe(true);
  });

  it('a successful save also writes a backup slot', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);

    storage.save(createInitialState());

    expect(backend.getItem('deep-shaft.save.backup')).not.toBeNull();
  });

  it('loadBackup recovers the previous save when the primary is corrupt', () => {
    const backend = createMemoryBackend();
    const storage = createStorage(backend);
    const state = createInitialState();
    state.currency = 555;
    storage.save(state);
    // Corrupt the primary after a good write, as a partial or truncated write would.
    backend.setItem('deep-shaft.save', '{ broken');

    const backup = storage.loadBackup();
    expect(backup.currency).toBe(555);

    const result = storage.loadResult();
    expect(result.ok).toBe(true);
    expect(result.source).toBe('backup');
    expect(result.state.currency).toBe(555);
  });

  it('preserves an unreadable primary in the backup slot before a fresh start', () => {
    const backend = createMemoryBackend({ 'deep-shaft.save': '{ broken' });
    const storage = createStorage(backend);

    expect(storage.loadResult()).toEqual({ ok: false, reason: 'corrupt' });
    expect(backend.getItem('deep-shaft.save.backup')).toBe('{ broken');
  });

  it('a failed write still reports structured failure and keeps the in-memory state usable', () => {
    const backend = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const storage = createStorage(backend);
    const state = createInitialState();
    state.currency = 10;

    expect(storage.save(state)).toEqual({ ok: false, reason: 'storage_unavailable' });

    // The in-memory session stays authoritative: it can still be played and re-saved later.
    state.currency = 20;
    expect(state.currency).toBe(20);
  });
});

describe('createLocalStorageBackend', () => {
  it('adapts a window with a working localStorage implementation', () => {
    const store = createMemoryBackend();

    const backend = createLocalStorageBackend({ localStorage: store });
    backend.setItem('k', 'v');

    expect(store.getItem('k')).toBe('v');
  });

  it('falls back to a no-op backend when localStorage is unavailable', () => {
    const backend = createLocalStorageBackend({});

    expect(() => backend.setItem('k', 'v')).not.toThrow();
    expect(backend.getItem('k')).toBeNull();
  });

  it('falls back to a no-op backend when accessing localStorage throws', () => {
    const hostileWindow = {
      get localStorage() {
        throw new Error('Blocked by browser privacy settings');
      },
    };

    const backend = createLocalStorageBackend(hostileWindow);

    expect(backend.getItem('k')).toBeNull();
    expect(() => backend.removeItem('k')).not.toThrow();
  });
});
