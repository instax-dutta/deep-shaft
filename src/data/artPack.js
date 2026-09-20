/**
 * The Deep Shaft art pack contract.
 *
 * This module is the single source of truth for the in-game art: `scripts/generate-art.mjs` renders
 * exactly these keys, the boot scene loads exactly these keys, and `tests/data/artPack.test.js`
 * checks that the committed PNGs match the file and pixel size declared here. Nothing else may
 * restate a texture key or an art path.
 *
 * The pack is authored in-house and rendered deterministically, so it carries no third-party
 * licence and no art dependency to track. `public/art/pack.json` is the same list emitted for the
 * service worker, which cannot import this module; the test keeps the two in lockstep.
 */

/** Tile edge, chosen so a band stretched to a phone or desktop width stays crisp. */
export const STRATA_TILE_SIZE = 192;

const STRATA = Object.freeze({ width: STRATA_TILE_SIZE, height: STRATA_TILE_SIZE });
const RAIL = Object.freeze({ width: 32, height: 32 });
const MINERAL = Object.freeze({ width: 24, height: 24 });
const MARKER = Object.freeze({ width: 32, height: 32 });

function entry(kind, size, extra = {}) {
  return Object.freeze({ kind, ...size, ...extra });
}

/**
 * Every art key the game uses.
 *
 * - `strata-<tier>` — one rock tile per depth tier, tinted by depth at draw time.
 * - `rail` — the shaft lining, tiled down both edges.
 * - `mineral-<category>` — a light neutral sprite the scene tints with the category's legend
 *   colour, so the shaft and the legend cannot disagree.
 * - `marker-drill` — the drill head marking where the mine is working.
 */
export const artPack = Object.freeze({
  'strata-1': entry('strata', STRATA, { file: 'art/strata-1.png', tier: 1 }),
  'strata-2': entry('strata', STRATA, { file: 'art/strata-2.png', tier: 2 }),
  'strata-3': entry('strata', STRATA, { file: 'art/strata-3.png', tier: 3 }),
  'strata-4': entry('strata', STRATA, { file: 'art/strata-4.png', tier: 4 }),
  'strata-5': entry('strata', STRATA, { file: 'art/strata-5.png', tier: 5 }),
  rail: entry('rail', RAIL, { file: 'art/rail.png' }),
  'mineral-ore': entry('mineral', MINERAL, { file: 'art/mineral-ore.png', category: 'ore' }),
  'mineral-gems': entry('mineral', MINERAL, { file: 'art/mineral-gems.png', category: 'gems' }),
  'mineral-rare': entry('mineral', MINERAL, { file: 'art/mineral-rare.png', category: 'rare' }),
  'marker-drill': entry('marker', MARKER, { file: 'art/marker-drill.png' }),
});

export const ART_KEYS = Object.freeze(Object.keys(artPack));

/** Where the pack is published, relative so the build stays deployable from any path. */
export const ART_BASE = 'art/';

export function getArt(key) {
  return Object.prototype.hasOwnProperty.call(artPack, key) ? artPack[key] : null;
}

/** Relative URL for a key, matching `base: './'` in `vite.config.js`. */
export function artUrl(key) {
  const definition = getArt(key);
  return definition ? `./${definition.file}` : null;
}

/** The boot-time load list, in declaration order. */
export function artLoadList() {
  return Object.freeze(
    ART_KEYS.map((key) => Object.freeze({ key, url: artUrl(key) })),
  );
}

/** Texture key for a depth tier's rock. */
export function strataKeyFor(tier) {
  return `strata-${tier}`;
}

/** Texture key for a resource category's mineral sprite. */
export function mineralKeyFor(category) {
  return `mineral-${category}`;
}

export const RAIL_KEY = 'rail';
export const MARKER_KEY = 'marker-drill';
