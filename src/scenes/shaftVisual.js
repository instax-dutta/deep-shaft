/**
 * Shaft layout geometry.
 *
 * Kept as a pure function so "how deep am I and what is down there" is verifiable without a
 * browser: the Phaser scene only draws what this returns. The shaft is deliberately simple per the
 * spec — it communicates depth, it is not a physics simulation — but it reads as stacked rock
 * strata with embedded minerals rather than flat colour bars.
 *
 * This module decides *which art and where*, never *what art looks like*. Every texture key comes
 * from `data/artPack.js` and every colour from `data/artPalette.js`, so the layout cannot drift from
 * the rendered pack, and placement is drawn from a deterministic hash of the tier so the same mine
 * looks identical on every frame instead of shimmering.
 */

import { config } from '../data/config.js';
import { getDepthTier } from '../data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../data/resources.js';
import {
  MARKER_KEY,
  RAIL_KEY,
  STRATA_TILE_SIZE,
  artPack,
  mineralKeyFor,
  strataKeyFor,
} from '../data/artPack.js';
import { MINERAL_COLORS, tierColor } from '../data/artPalette.js';

const CATEGORY_ORDER = Object.freeze([
  RESOURCE_CATEGORIES.ORE,
  RESOURCE_CATEGORIES.GEMS,
  RESOURCE_CATEGORIES.RARE,
]);

/** How many sprites each category contributes to a full-height band. */
const MINERALS_PER_CATEGORY = Object.freeze({
  [RESOURCE_CATEGORIES.ORE]: 2,
  [RESOURCE_CATEGORIES.GEMS]: 1,
  [RESOURCE_CATEGORIES.RARE]: 1,
});

/** Below these the band cannot hold a sprite without crowding the label or legend. */
const MIN_MINERAL_BAND_HEIGHT = 34;
const MIN_MINERAL_BAND_WIDTH = 120;
const ROOMY_BAND_HEIGHT = 64;

const MINERAL_MIN_SIZE = 10;
const MINERAL_MAX_SIZE = 22;

/** Used when the host reports a zero-sized viewport before layout settles. */
const FALLBACK_WIDTH = 320;
const FALLBACK_HEIGHT = 360;

const RAIL_MIN_WIDTH = 6;
const RAIL_MAX_WIDTH = 18;
const SURFACE_LINE_HEIGHT = 3;

const MARKER_MIN_SIZE = 20;
const MARKER_MAX_SIZE = 34;

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic 0..1 value from two integers. */
function hash01(a, b) {
  let hash = 2166136261 ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** The three resource categories of a tier, as a legend the player can read off the shaft. */
function createSwatches(depthTier) {
  return Object.freeze(
    CATEGORY_ORDER.map((category) => {
      const definition = resourceOfCategory(depthTier, category);
      return Object.freeze({
        category,
        name: definition ? definition.name : '—',
        color: MINERAL_COLORS[category],
      });
    }),
  );
}

/**
 * Mineral sprites embedded in one stratum.
 *
 * They sit in the right half of the band: the stratum name is written top-left and the legend
 * bottom-left, and a sprite under either of them would cost more readability than it adds.
 */
function createMinerals(depthTier, band) {
  if (band.height < MIN_MINERAL_BAND_HEIGHT || band.width < MIN_MINERAL_BAND_WIDTH) {
    return Object.freeze([]);
  }

  const size = clamp(band.height * 0.11, MINERAL_MIN_SIZE, MINERAL_MAX_SIZE);
  const roomy = band.height >= ROOMY_BAND_HEIGHT;
  const left = band.left + band.width * 0.44;
  const roomX = Math.max(0, band.left + band.width - size - 8 - left);
  const roomY = Math.max(0, band.top + band.height - size - 8 - (band.top + 8));

  const minerals = [];
  CATEGORY_ORDER.forEach((category, categoryIndex) => {
    const count = roomy ? MINERALS_PER_CATEGORY[category] : 1;

    for (let index = 0; index < count; index += 1) {
      const seed = (depthTier * 97 + categoryIndex * 13 + index) * 5;
      minerals.push(
        Object.freeze({
          category,
          key: mineralKeyFor(category),
          x: left + hash01(seed, 1) * roomX,
          y: band.top + 8 + hash01(seed, 2) * roomY,
          size,
        }),
      );
    }
  });

  return Object.freeze(minerals);
}

function createBand({ depthTier, index, bandHeight, width, reached }) {
  const definition = getDepthTier(depthTier);

  const band = {
    depthTier,
    left: 0,
    width,
    top: index * bandHeight,
    height: bandHeight,
    textureKey: strataKeyFor(depthTier),
    // One tile stretched across the band: repeating a scarce tile would read as wallpaper.
    tileScaleX: width / STRATA_TILE_SIZE,
    tileScaleY: bandHeight / STRATA_TILE_SIZE,
    color: tierColor(depthTier),
    /** 0 at the surface, rising to just under 1 at the deepest tier. */
    shade: index / Math.max(1, config.depth.tierCount),
    isCurrent: index + 1 === reached,
    label: definition ? definition.name : `Tier ${depthTier}`,
    depthMeters: definition ? definition.depthMeters : 0,
    swatches: createSwatches(depthTier),
  };

  return Object.freeze({ ...band, minerals: createMinerals(depthTier, band) });
}

/**
 * Builds the stacked strata representing the mine shaft.
 *
 * @param {object} state - Game state snapshot.
 * @param {{ width?: number, height?: number }} viewport - Available drawing area.
 * @param {{ caveIn?: boolean, luckyVein?: boolean }} [options] - Active event modifiers.
 */
export function shaftLayoutFor(state, viewport = {}, options = {}) {
  const width = positiveOr(viewport.width, FALLBACK_WIDTH);
  const height = positiveOr(viewport.height, FALLBACK_HEIGHT);
  const reached = Math.min(
    Math.max(1, Math.floor(Number.isFinite(state.depthTier) ? state.depthTier : 1)),
    config.depth.tierCount,
  );
  const bandHeight = height / reached;

  const bands = [];
  for (let index = 0; index < reached; index += 1) {
    bands.push(createBand({ depthTier: index + 1, index, bandHeight, width, reached }));
  }

  const railWidth = Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, width * 0.04));
  const rail = artPack[RAIL_KEY];
  const current = bands[bands.length - 1];

  return Object.freeze({
    width,
    height,
    bands: Object.freeze(bands),
    rails: Object.freeze([
      Object.freeze({
        left: 0,
        top: 0,
        width: railWidth,
        height,
        textureKey: RAIL_KEY,
        tileScaleX: railWidth / rail.width,
        // The rail art is a repeating ladder, so it is squashed to the strip width but left at its
        // natural height. Filling the shaft height instead stretched one rung into a huge block.
        tileScaleY: 1,
      }),
      Object.freeze({
        left: width - railWidth,
        top: 0,
        width: railWidth,
        height,
        textureKey: RAIL_KEY,
        tileScaleX: railWidth / rail.width,
        tileScaleY: 1,
      }),
    ]),
    surfaceLine: Object.freeze({ y: 0, height: SURFACE_LINE_HEIGHT }),
    // `y` is the sprite's vertical centre, drawn just inside the left rail.
    marker: Object.freeze({
      textureKey: MARKER_KEY,
      x: railWidth + 2,
      y: current.top + current.height / 2,
      size: clamp(width * 0.07, MARKER_MIN_SIZE, MARKER_MAX_SIZE),
    }),
    currentTier: reached,
    dimmed: Boolean(options.caveIn),
    glowing: Boolean(options.luckyVein),
  });
}
