/**
 * Audio adapter.
 *
 * Sound is an optional layer: the adapter never throws into the game loop, defaults to a no-op
 * backend when Web Audio is unavailable, and is muted by the player's setting rather than by
 * global state. Backends are injected so tests never play real audio.
 */

const MAX_VOLUME = 1;
const MIN_VOLUME = 0;

/** Backend used when none is provided: silently successful, costs nothing. */
const NOOP_BACKEND = Object.freeze({
  play: () => ({ ok: true }),
  setVolume: () => {},
});

function clampVolume(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return MIN_VOLUME;
  }
  return Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, value));
}

export function createAudio({ backend = NOOP_BACKEND } = {}) {
  let muted = false;

  return {
    play(eventId) {
      if (muted) {
        return { ok: true };
      }
      try {
        return backend.play(eventId) ?? { ok: true };
      } catch {
        return { ok: false, reason: 'audio_backend_failed' };
      }
    },

    setVolume(value) {
      const clamped = clampVolume(value);
      try {
        backend.setVolume?.(clamped);
      } catch {
        // A volume change must never break the loop; the next play attempt reports failures.
      }
      return { ok: true, volume: clamped };
    },

    mute() {
      muted = true;
      return { ok: true };
    },

    unmute() {
      muted = false;
      return { ok: true };
    },

    isMuted: () => muted,
  };
}

/**
 * Web Audio backend.
 *
 * Lazily creates the AudioContext on first play (autoplay policies forbid creating one early and
 * expecting sound), fetches and decodes each asset once, and caches decoded buffers. A buffer not
 * yet decoded plays nothing this time — one silent blip at worst, never an exception in the game
 * loop. `resolve(eventId)` maps an event id to its asset URL; returning `null` reports the sound
 * as unavailable.
 */
export function createWebAudioBackend({ host = globalThis, resolve = () => null } = {}) {
  let context = null;
  const pending = new Map();
  const ready = new Map();

  function ensureContext() {
    if (context) {
      return context;
    }
    if (!host || typeof host.AudioContext !== 'function') {
      return null;
    }
    try {
      context = new host.AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  async function decode(url) {
    try {
      const audioContext = ensureContext();
      if (!audioContext) {
        return;
      }
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }
      const bytes = await response.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(bytes);
      if (decoded) {
        ready.set(url, decoded);
      }
    } catch {
      // A sound that cannot load is skipped, never thrown into the game loop.
    }
  }

  return {
    play(eventId) {
      const url = resolve(eventId);
      if (!url) {
        return { ok: false, reason: 'sound_not_defined' };
      }
      const audioContext = ensureContext();
      if (!audioContext) {
        return { ok: false, reason: 'audio_unavailable' };
      }

      const buffer = ready.get(url);
      if (buffer) {
        void audioContext.resume?.();
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
        return { ok: true };
      }

      if (!pending.has(url)) {
        pending.set(url, decode(url));
      }
      return { ok: true };
    },

    setVolume() {
      // Per-play gain is not needed at this scale; the browser's output device owns loudness.
      return { ok: true };
    },
  };
}
