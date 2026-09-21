import { describe, expect, it } from 'vitest';

import { createTabGuard } from '../../src/platform/tabGuard.js';

const KEY = 'deep-shaft.tab';

/** Storage backend + event target sharing one store, whose `storage` events tests fire manually. */
function makeHost() {
  const store = new Map();
  const listeners = new Map();
  const target = {
    addEventListener(type, handler) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    removeEventListener(type, handler) {
      listeners.set(type, (listeners.get(type) ?? []).filter((entry) => entry !== handler));
    },
  };
  const backend = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, String(value));
      for (const handler of listeners.get('storage') ?? []) {
        handler({ key, newValue: String(value) });
      }
    },
    removeItem: (key) => store.delete(key),
  };
  return {
    store,
    target,
    backend,
    fireStorage: (key, newValue) => {
      for (const handler of listeners.get('storage') ?? []) {
        handler({ key, newValue });
      }
    },
  };
}

describe('createTabGuard', () => {
  let host;
  let clockMs;

  function freshHost() {
    host = makeHost();
    clockMs = 1_000_000;
  }

  function guard(id, overrides = {}) {
    return createTabGuard({
      id,
      backend: host.backend,
      host: host.target,
      clock: () => clockMs,
      ...overrides,
    });
  }

  it('a missing heartbeat leaves this tab primary and claims the slot', () => {
    freshHost();
    const mine = guard('tab-a');

    expect(mine.start()).toBe('primary');
    expect(JSON.parse(host.store.get(KEY))).toMatchObject({ tabId: 'tab-a' });
  });

  it('a fresh foreign heartbeat makes this tab secondary and does not steal the slot', () => {
    freshHost();
    host.store.set(KEY, JSON.stringify({ tabId: 'tab-a', at: 1_000_000 }));
    clockMs = 1_003_000; // 3s old, inside the stale window.

    const mine = guard('tab-b');

    expect(mine.start()).toBe('secondary');
    expect(JSON.parse(host.store.get(KEY)).tabId).toBe('tab-a');
  });

  it('an expired foreign heartbeat is not a live owner, so this tab takes over', () => {
    freshHost();
    host.store.set(KEY, JSON.stringify({ tabId: 'tab-a', at: 1_000_000 }));
    clockMs = 1_020_000; // 20s old, past the stale window.

    const mine = guard('tab-b');

    expect(mine.start()).toBe('primary');
    expect(JSON.parse(host.store.get(KEY)).tabId).toBe('tab-b');
  });

  it('a malformed heartbeat is treated as no claim', () => {
    freshHost();
    host.store.set(KEY, '{not json');

    const mine = guard('tab-a');

    expect(mine.start()).toBe('primary');
  });

  it('a foreign takeover while playing demotes this tab without destroying the owner claim', () => {
    freshHost();
    const mine = guard('tab-a');
    mine.start();

    // Another tab writes its own claim through real storage, which fires the storage event.
    host.backend.setItem(KEY, JSON.stringify({ tabId: 'tab-b', at: clockMs + 1 }));

    expect(mine.role()).toBe('secondary');
    // The owner's claim must survive the demotion; releasing it would let the next heartbeat
    // of this tab steal the slot and put both tabs in the race the guard exists to prevent.
    expect(JSON.parse(host.store.get(KEY)).tabId).toBe('tab-b');
  });

  it('a secondary heartbeat with a fresh foreign claim stays secondary and keeps the claim', () => {
    freshHost();
    host.store.set(KEY, JSON.stringify({ tabId: 'tab-b', at: 1_000_000 }));
    clockMs = 1_004_000;

    const mine = guard('tab-a');
    expect(mine.start()).toBe('secondary');

    mine.heartbeat();

    expect(mine.role()).toBe('secondary');
    expect(JSON.parse(host.store.get(KEY)).tabId).toBe('tab-b');
  });

  it('another tab writing the same claim leaves the role unchanged', () => {
    freshHost();
    const mine = guard('tab-a');
    mine.start();

    host.backend.setItem(KEY, JSON.stringify({ tabId: 'tab-a', at: clockMs + 1 }));

    expect(mine.role()).toBe('primary');
  });

  it('a stale foreign claim releases the lock and this tab promotes to primary', () => {
    freshHost();
    host.store.set(KEY, JSON.stringify({ tabId: 'tab-b', at: 1_000_000 }));
    clockMs = 1_002_000;

    const mine = guard('tab-a');
    expect(mine.start()).toBe('secondary');

    clockMs = 1_020_000; // The other tab's heartbeat is now stale.
    mine.heartbeat();

    expect(mine.role()).toBe('primary');
  });

  it('heartbeats keep the claim fresh', () => {
    freshHost();
    const mine = guard('tab-a');
    mine.start();

    clockMs = 1_006_000;
    mine.heartbeat();

    expect(JSON.parse(host.store.get(KEY))).toMatchObject({ tabId: 'tab-a', at: 1_006_000 });
  });

  it('stop releases the claim and detaches listeners', () => {
    freshHost();
    const mine = guard('tab-a');
    mine.start();
    mine.stop();

    expect(host.store.has(KEY)).toBe(false);

    host.backend.setItem(KEY, JSON.stringify({ tabId: 'tab-z', at: clockMs + 1 }));
    expect(mine.role()).toBe('primary');
  });
});
