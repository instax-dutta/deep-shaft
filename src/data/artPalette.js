/**
 * The art pack's palette.
 *
 * One palette, two consumers: `scripts/generate-art.mjs` paints the pack with it, and the scene
 * draws its non-textured details (labels, swatch legend, event tints) with the same values. Keeping
 * it in the data layer is what makes the in-game art and the app icons look like one set instead of
 * two unrelated drawings.
 */

/** One earthy colour per v1 depth tier, darkest at the bottom. */
export const TIER_COLORS = Object.freeze([
  '#8a5a2b',
  '#7d6a3c',
  '#5f6b63',
  '#4a5a72',
  '#3b3f5c',
]);

/** Legend colours for the three resource categories, consistent at every depth. */
export const MINERAL_COLORS = Object.freeze({
  ore: '#a08e6c',
  gems: '#5fb8c9',
  rare: '#e2b24c',
});

/** Steel rails, dark sleepers, and the warm ink used for the shaft's own markings. */
export const RAIL_COLOR = '#d9c9a3';
export const SLEEPER_COLOR = '#14110e';
export const INK_COLOR = '#f4e3c1';
export const INK_DIM_COLOR = '#cbbba0';

/** Background behind the shaft opening, used by both the tiles and the app icons. */
export const CAVERN_COLOR = '#12100e';

function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function toHex(channel) {
  return Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0');
}

/** Blends two hex colours, `t` = 0 returning `a` and `t` = 1 returning `b`. */
export function mixHex(a, b, t) {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  return `#${toHex(ar + (br - ar) * t)}${toHex(ag + (bg - ag) * t)}${toHex(ab + (bb - ab) * t)}`;
}

/** The tier's rock colour, lightened or darkened by `amount` (negative darkens). */
export function shadeHex(hex, amount) {
  const target = amount >= 0 ? '#ffffff' : '#000000';
  return mixHex(hex, target, Math.abs(amount));
}

/** Base rock colour for a 1-based depth tier. */
export function tierColor(tier) {
  return TIER_COLORS[(tier - 1) % TIER_COLORS.length];
}
