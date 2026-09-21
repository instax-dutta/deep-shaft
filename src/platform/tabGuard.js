/**
 * Single-owner tab guard.
 *
 * Two tabs of the same mine would both tick and both autosave into one `localStorage` key:
 * last-writer-wins, diverging mines, and a reload that can resurrect stale state. This module
 * makes the mine single-owner: the first live tab claims the slot with a heartbeat, later tabs
 * run read-only ("secondary") and are told the mine is open elsewhere, and a secondary promotes
 * itself when the owner's heartbeat goes stale, so a crashed or closed tab never locks the mine.
 */

const KEY = 'deep-shaft.tab';

/** How long a claim stays trusted after its last heartbeat. Covers a crashed tab, not a slow one. */
export const TAB_STALE_MS = 15_000;

export const TAB_ROLES = Object.freeze({ PRIMARY: 'primary', SECONDARY: 'secondary' });

import { createLocalStorageBackend } from './storage.js';

/** Real browsers share localStorage across tabs; tests inject a backend instead. */
function defaultBackend() {
  return createLocalStorageBackend();
}

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tab-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function parseClaim(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  try {
    const claim = JSON.parse(raw);
    if (claim && typeof claim.tabId === 'string' && Number.isFinite(claim.at)) {
      return claim;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * The heartbeat lives in shared storage; other tabs' writes arrive as `storage` events and every
 * decision reads the injectable clock, so the whole rule is testable without real timers.
 */
export function createTabGuard({
  id = randomId(),
  backend = defaultBackend(),
  host = globalThis,
  clock = Date.now,
  staleMs = TAB_STALE_MS,
} = {}) {
  let role = null;
  let detached = false;

  const readClaim = () => {
    try {
      return parseClaim(backend.getItem(KEY));
    } catch {
      return null;
    }
  };

  const write = (tabId) => {
    try {
      backend.setItem(KEY, JSON.stringify({ tabId, at: clock() }));
    } catch {
      // Storage may be blocked; a single tab still plays correctly without the guard.
    }
  };

  const release = () => {
    try {
      backend.removeItem(KEY);
    } catch {
      // Nothing to recover.
    }
  };

  const isStale = (claim) => clock() - claim.at > staleMs;

  function onStorage(event) {
    if (detached || !event || event.key !== KEY) {
      return;
    }
    const claim = parseClaim(event.newValue);
    if (!claim || claim.tabId === id) {
      return;
    }
    // Another live tab owns the mine; step aside. The claim in storage is the owner's — leave it
    // there, or this tab's next heartbeat would find no owner and steal the slot.
    role = TAB_ROLES.SECONDARY;
  }

  return {
    start() {
      const claim = readClaim();
      if (claim && claim.tabId !== id && !isStale(claim)) {
        role = TAB_ROLES.SECONDARY;
      } else {
        role = TAB_ROLES.PRIMARY;
        write(id);
      }

      try {
        host.addEventListener('storage', onStorage);
      } catch {
        // No event support (old browsers, tests): boot-time detection still applies.
      }
      return role;
    },

    /** Writes this tab's heartbeat and takes the lock when the previous owner went stale. */
    heartbeat() {
      if (detached) {
        return;
      }
      const claim = readClaim();
      if (claim && claim.tabId !== id) {
        // A live owner keeps the slot; only a stale one hands it over.
        role = isStale(claim) ? TAB_ROLES.PRIMARY : TAB_ROLES.SECONDARY;
        if (role === TAB_ROLES.PRIMARY) {
          write(id);
        }
        return;
      }
      role = TAB_ROLES.PRIMARY;
      write(id);
    },

    role: () => role,

    /** Releases the claim and stops listening; called from the unload path. */
    stop() {
      detached = true;
      try {
        host.removeEventListener('storage', onStorage);
      } catch {
        // Nothing to detach.
      }
      release();
    },

    id: () => id,
  };
}
