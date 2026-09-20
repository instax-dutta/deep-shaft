/**
 * Art pack contract.
 *
 * The pack is committed binary art, so its correctness is a file contract rather than a behavior:
 * every declared key must name a real PNG at exactly the declared pixel size, the emitted manifest
 * must agree with the module, and the key helpers the scene uses must resolve to real keys. Without
 * these, a renamed tile or a stale manifest would only surface as a blank band in a browser.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { pngSize } from '../helpers/png.js';
import {
  ART_KEYS,
  RAIL_KEY,
  MARKER_KEY,
  STRATA_TILE_SIZE,
  artLoadList,
  artPack,
  artUrl,
  getArt,
  mineralKeyFor,
  strataKeyFor,
} from '../../src/data/artPack.js';
import { config } from '../../src/data/config.js';
import { RESOURCE_CATEGORIES } from '../../src/data/resources.js';

const ROOT = new URL('../../', import.meta.url);
const MANIFEST = JSON.parse(readFileSync(new URL('public/art/pack.json', ROOT), 'utf8'));

function readBytes(path) {
  return readFileSync(new URL(path, ROOT));
}

describe('art pack contract', () => {
  it('names a file that exists for every key', () => {
    for (const key of ART_KEYS) {
      expect(() => readBytes(`public/${getArt(key).file}`), key).not.toThrow();
    }
  });

  it('ships every file as a PNG at the declared pixel size', () => {
    for (const key of ART_KEYS) {
      const definition = getArt(key);

      expect(pngSize(readBytes(`public/${definition.file}`)), key).toEqual({
        width: definition.width,
        height: definition.height,
      });
    }
  });

  it('gives every depth tier its own rock tile', () => {
    for (let tier = 1; tier <= config.depth.tierCount; tier += 1) {
      const key = strataKeyFor(tier);

      expect(ART_KEYS).toContain(key);
      expect(getArt(key).tier).toBe(tier);
      expect(getArt(key).kind).toBe('strata');
    }
  });

  it('gives every resource category a mineral sprite', () => {
    for (const category of Object.values(RESOURCE_CATEGORIES)) {
      const key = mineralKeyFor(category);

      expect(ART_KEYS).toContain(key);
      expect(getArt(key).category).toBe(category);
    }
  });

  it('declares the rail and drill marker the shaft layout asks for', () => {
    expect(getArt(RAIL_KEY)).not.toBeNull();
    expect(getArt(MARKER_KEY)).not.toBeNull();
    expect(getArt(RAIL_KEY).kind).toBe('rail');
    expect(getArt(MARKER_KEY).kind).toBe('marker');
  });

  it('loads every key from a path relative to the page, not the server root', () => {
    const list = artLoadList();

    expect(list.map((item) => item.key)).toEqual([...ART_KEYS]);
    for (const item of list) {
      expect(item.url.startsWith('./')).toBe(true);
      expect(item.url).toBe(artUrl(item.key));
    }
  });

  it('publishes a manifest the service worker can cache from, matching this module', () => {
    // The worker cannot import this module, so it reads the emitted manifest at install time.
    // Drift between the two would mean art that never reaches the offline cache.
    expect(MANIFEST.files.map((file) => file.key)).toEqual([...ART_KEYS]);
    for (const file of MANIFEST.files) {
      expect(file).toEqual({
        key: file.key,
        file: getArt(file.key).file,
        width: getArt(file.key).width,
        height: getArt(file.key).height,
      });
    }
  });

  it('keeps every tile square and large enough to stretch across a band', () => {
    for (const key of ART_KEYS) {
      const definition = getArt(key);
      if (definition.kind === 'strata') {
        expect(definition.width).toBe(definition.height);
        expect(definition.width).toBe(STRATA_TILE_SIZE);
      }
    }
  });

  it('refuses an unknown key instead of inventing a path', () => {
    expect(getArt('strata-99')).toBeNull();
    expect(artUrl('strata-99')).toBeNull();
  });
});
