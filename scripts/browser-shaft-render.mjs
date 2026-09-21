/**
 * Shaft rendering regression check.
 *
 * The shaft is drawn on a canvas, so nothing in Vitest can see it: the layout tests prove what the
 * scene *asks* for, not what the GPU produced. `screenshots/*.png` covered the gap for a human, and
 * a human review is exactly what found the rail texture stretched into a single wooden block — a
 * defect where every assertion passed and the picture was still wrong.
 *
 * This turns that review into an assertion. It seeds the deepest mine, screenshots the shaft canvas,
 * decodes it, and measures the properties a broken render would lose: enough colour to not be blank,
 * a distinct rock colour per stratum, a darker rock with depth, and a lining pattern that repeats
 * down the shaft rather than stretching once. Thresholds are deliberately loose — this is not a
 * pixel-perfect golden image, it is a check that the shaft is drawn at all and drawn as designed.
 *
 * Run: npm run test:browser:render
 */

import { artPack } from '../src/data/artPack.js';
import { config } from '../src/data/config.js';
import {
  colorDistance,
  decodePng,
  describeRegion,
  luminanceOfColor,
  medianColor,
  runsAboveMean,
  stripRowLuminance,
  toHex,
} from './png.mjs';

const { createReporter, failProcessIfNeeded, launch, serve } = await import('./browser-harness.mjs');

const PORT = 4324;

/** Enough currency that nothing on screen is gated by affordability. */
const SAVE = JSON.stringify({
  schemaVersion: 1,
  currency: 1_000_000,
  depthTier: config.depth.tierCount,
  resources: { [`tier${config.depth.tierCount}-ore`]: 5_000 },
  drills: { 'drill-1': 6 },
  workers: [],
  prestige: { count: 0, multiplier: 1, lifetimeEarned: 0 },
  stats: { totalEarned: 1_000_000, manualExtractions: 10 },
  lastSavedAt: 0,
});

/** A shaft that is drawn but flat fails these; so does an untextured fill. */
const MIN_COLOURS = 150;
const MIN_CONTRAST = 0.05;

/** Adjacent strata must be visually distinguishable, and the deepest must be darker. */
const MIN_BAND_COLOUR_DISTANCE = 8;

/** The lining occupies the outer few pixels of each edge, whatever the configured width is. */
const LINING_SAMPLE_WIDTH = 6;

/**
 * How many repeats the lining must show.
 *
 * Derived from the pack's own tile height rather than picked: the shaft should show the pattern at
 * least half as often as the tile would repeat at its natural size. A stretched tile collapses to a
 * handful of repeats, so this separates the two cases with room to spare while still following the
 * canvas size and the art if either changes.
 */
function minimumLiningRuns(canvasHeight) {
  return Math.max(3, Math.floor(canvasHeight / (artPack.rail.height * 2)));
}

const reporter = createReporter('shaft-render');
const server = await serve({ port: PORT });
const session = await launch();

try {
  const context = await session.newContext();
  const page = await context.newPage();
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ['deep-shaft.save', SAVE],
  );
  await page.goto(server.url, { waitUntil: 'load' });
  await page.waitForSelector('#shaft canvas');
  // Let the art finish loading and the first frames settle before measuring.
  await page.waitForTimeout(1_200);

  const canvas = page.locator('#shaft canvas');
  const shot = await canvas.screenshot({ path: 'screenshots/shaft-depth5.png' });
  const image = decodePng(shot);

  const whole = describeRegion(image, { x0: 0, y0: 0, x1: image.width, y1: image.height });
  reporter.check(
    'the shaft canvas is drawn with real texture, not a flat fill',
    whole.colours >= MIN_COLOURS && whole.contrast >= MIN_CONTRAST,
    `${image.width}×${image.height}, ${whole.colours} colours, contrast ${(
      whole.contrast * 100
    ).toFixed(1)}%`,
  );

  // Strata are equal divisions of the canvas height. Sampling the right half of each band keeps the
  // median clear of the stratum label (top-left) and the legend swatches (bottom-left).
  const tiers = config.depth.tierCount;
  const bandHeight = image.height / tiers;
  const bands = [];
  for (let index = 0; index < tiers; index += 1) {
    const centre = Math.round(bandHeight * (index + 0.5));
    const colour = medianColor(image, {
      x0: Math.round(image.width * 0.5),
      y0: Math.max(0, centre - 4),
      x1: Math.round(image.width * 0.95),
      y1: Math.min(image.height, centre + 4),
    });
    bands.push({ tier: index + 1, colour, luminance: luminanceOfColor(colour) });
  }

  const tooSimilar = [];
  for (let index = 1; index < bands.length; index += 1) {
    const distance = colorDistance(bands[index - 1].colour, bands[index].colour);
    if (distance < MIN_BAND_COLOUR_DISTANCE) {
      tooSimilar.push(`tier ${bands[index - 1].tier}/${bands[index].tier} distance ${distance.toFixed(1)}`);
    }
  }
  reporter.check(
    'every stratum is drawn in its own rock colour',
    tooSimilar.length === 0,
    tooSimilar.length > 0
      ? tooSimilar.join('; ')
      : bands.map((band) => `t${band.tier} ${toHex(band.colour)}`).join(' '),
  );

  reporter.check(
    'the rock darkens as the shaft goes deeper',
    bands.at(-1).luminance < bands[0].luminance,
    `surface ${bands[0].luminance.toFixed(3)} → deepest ${bands.at(-1).luminance.toFixed(3)}`,
  );

  const lining = [
    { edge: 'left', from: 0, to: LINING_SAMPLE_WIDTH },
    { edge: 'right', from: image.width - LINING_SAMPLE_WIDTH, to: image.width },
  ].map(({ edge, from, to }) => ({
    edge,
    runs: runsAboveMean(stripRowLuminance(image, from, to, 0, image.height)),
  }));

  const requiredRuns = minimumLiningRuns(image.height);
  reporter.check(
    'the shaft lining repeats down both edges instead of stretching one tile',
    lining.every(({ runs }) => runs >= requiredRuns),
    `${lining.map(({ edge, runs }) => `${edge} ${runs} repeats`).join(', ')}; needs ${requiredRuns}`,
  );

  reporter.check(
    'no JavaScript errors were reported',
    session.errors.length === 0,
    session.errors.join('; '),
  );

  console.log('\nWrote screenshots/shaft-depth5.png for human review.');
} finally {
  await session.close();
  await server.close();
}

failProcessIfNeeded(reporter);
