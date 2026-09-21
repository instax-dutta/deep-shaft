import { describe, expect, it, vi } from 'vitest';

import { createAudio } from '../../src/platform/audio.js';

function fakeBackend() {
  const played = [];
  return {
    played,
    play(eventId) {
      played.push(eventId);
      return { ok: true };
    },
  };
}

describe('createAudio', () => {
  it('plays through the backend while unmuted', () => {
    const backend = fakeBackend();
    const audio = createAudio({ backend });

    const result = audio.play('mine');

    expect(result.ok).toBe(true);
    expect(backend.played).toEqual(['mine']);
  });

  it('does nothing while muted', () => {
    const backend = fakeBackend();
    const audio = createAudio({ backend });
    audio.mute();

    const result = audio.play('mine');

    expect(result.ok).toBe(true);
    expect(backend.played).toEqual([]);
  });

  it('unmuting restores playback', () => {
    const backend = fakeBackend();
    const audio = createAudio({ backend });
    audio.mute();
    audio.unmute();

    audio.play('mine');

    expect(backend.played).toEqual(['mine']);
  });

  it('a fresh audio instance is unmuted', () => {
    const backend = fakeBackend();

    createAudio({ backend }).play('mine');

    expect(backend.played).toEqual(['mine']);
  });

  it('volume is clamped to 0..1', () => {
    const seen = [];
    const backend = { play: () => ({ ok: true }), setVolume: (value) => seen.push(value) };
    const audio = createAudio({ backend });

    audio.setVolume(-1);
    audio.setVolume(0.5);
    audio.setVolume(4);

    expect(seen).toEqual([0, 0.5, 1]);
  });

  it('a throwing backend reports a structured failure instead of breaking the game', () => {
    const backend = { play: () => { throw new Error('audio died'); } };
    const audio = createAudio({ backend });

    const result = audio.play('mine');

    expect(result).toEqual({ ok: false, reason: 'audio_backend_failed' });
  });

  it('the default no-op backend never throws and reports success', () => {
    const audio = createAudio();

    expect(audio.play('mine')).toEqual({ ok: true });
  });
});
