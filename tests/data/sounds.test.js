import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOUND_IDS, getSound, sounds } from '../../src/data/sounds.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = join(root, 'public');

describe('audio pack (file contract)', () => {
  it('binds every sound id to a real file in public/', () => {
    for (const id of Object.values(SOUND_IDS)) {
      const path = getSound(id);
      expect(path, `sound id ${id}`).not.toBeNull();
      expect(existsSync(join(publicDir, path)), `missing file for ${id}: ${path}`).toBe(true);
    }
  });

  it('every sound file is a real 16-bit PCM WAV', () => {
    for (const path of Object.values(sounds)) {
      const bytes = readFileSync(join(publicDir, path));
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WAVE');
      expect(bytes.readUint16LE(20)).toBe(1);
      expect(bytes.readUint16LE(34)).toBe(16);
    }
  });

  it('every sound file is small enough to ship', () => {
    for (const path of Object.values(sounds)) {
      const bytes = readFileSync(join(publicDir, path));
      expect(bytes.length, path).toBeLessThan(32 * 1024);
    }
  });

  it('unknown sound ids resolve to nothing', () => {
    expect(getSound('nope')).toBeNull();
  });
});
