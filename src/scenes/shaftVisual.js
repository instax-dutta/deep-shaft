/**
 * Shaft layout geometry.
 *
 * Kept as a pure function so "how deep am I and what is down there" is verifiable without a
 * browser: the Phaser scene only strokes what this returns. The shaft is deliberately simple per
 * the spec — it communicates depth, it is not a physics simulation — but it does read as stacked
 * rock strata rather than flat colour bars.
 *
 * Rock texture is generated from a hash of the tier, so it is identical on every frame instead of
 * shimmering, and it can be asserted on in tests.
 */

import { config } from '../data/config.js';
import { getDepthTier } from '../data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../data/resources.js';

/** One earthy colour per v1 depth tier, darkest at the bottom. */
const TIER_COLORS = Object.freeze([
  '#8a5a2b',
  '#7d6a3c',
  '#5f6b63',
  '#4a5a72',
  '#3b3f5c',
]);

/** Legend colours for the three resource categories, consistent at every depth. */
const SWATCH_COLORS = Object.freeze({
  [RESOURCE_CATEGORIES.ORE]: '#a08e6c',
  [RESOURCE_CATEGORIES.GEMS]: '#5fb8c9',
  [RESOURCE_CATEGORIES.RARE]: '#e2b24c',
});

const CATEGORY_ORDER = Object.freeze([
  RESOURCE_CATEGORIES.ORE,
  RESOURCE_CATEGORIES.GEMS,
  RESOURCE_CATEGORIES.RARE,
]);

/** Used when the host reports a zero-sized viewport before layout settles. */
const FALLBACK_WIDTH = 320;
const FALLBACK_HEIGHT = 360;

const MARKS_PER_BAND = 6;
const RAIL_MIN_WIDTH = 6;
const RAIL_MAX_WIDTH = 18;
const SURFACE_LINE_HEIGHT = 3;

function positiveOr(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Deterministic 0..1 value from two integers. */
function hash01(a, b) {
  let hash = 2166136261 ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/** Short dashes suggesting rock grain inside one stratum. */
function createStrataMarks(depthTier, band) {
  const markHeight = Math.max(1, Math.min(2, Math.floor(band.height / 6)));
  const roomY = Math.max(0, band.height - markHeight - 2);
  const roomX = Math.max(0, band.width - 8);
  const marks = [];

  for (let index = 0; index < MARKS_PER_BAND; index += 1) {
    const width = Math.max(1, Math.min(6 + hash01(depthTier, index * 3 + 2) * 16, roomX));
    const x = band.left + 4 + hash01(depthTier, index * 3) * Math.max(0, roomX - width);
    const y = band.top + Math.min(roomY, 1 + hash01(depthTier, index * 3 + 1) * roomY);

    marks.push(Object.freeze({ x, y, width, height: markHeight }));
  }

  return Object.freeze(marks);
}

/** The three resource categories of a tier, as a legend the player can read off the shaft. */
function createSwatches(depthTier) {
  return Object.freeze(
    CATEGORY_ORDER.map((category) => {
      const definition = resourceOfCategory(depthTier, category);
      return Object.freeze({
        category,
        name: definition ? definition.name : '—',
        color: SWATCH_COLORS[category],
      });
    }),
  );
}

function createBand({ depthTier, index, bandHeight, width, reached }) {
  const definition = getDepthTier(depthTier);

  const band = {
    depthTier,
    left: 0,
    width,
    top: index * bandHeight,
    height: bandHeight,
    color: TIER_COLORS[(depthTier - 1) % TIER_COLORS.length],
    /** 0 at the surface, rising to just under 1 at the deepest tier. */
    shade: index / Math.max(1, config.depth.tierCount),
    isCurrent: index + 1 === reached,
    label: definition ? definition.name : `Tier ${depthTier}`,
    depthMeters: definition ? definition.depthMeters : 0,
    swatches: createSwatches(depthTier),
  };

  return Object.freeze({ ...band, marks: createStrataMarks(depthTier, band) });
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
  const current = bands[bands.length - 1];

  return Object.freeze({
    width,
    height,
    bands: Object.freeze(bands),
    rails: Object.freeze([
      Object.freeze({ left: 0, top: 0, width: railWidth, height }),
      Object.freeze({ left: width - railWidth, top: 0, width: railWidth, height }),
    ]),
    surfaceLine: Object.freeze({ y: 0, height: SURFACE_LINE_HEIGHT }),
    markerTop: current.top + current.height / 2,
    currentTier: reached,
    dimmed: Boolean(options.caveIn),
    glowing: Boolean(options.luckyVein),
  });
}
