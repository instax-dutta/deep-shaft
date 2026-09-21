/**
 * Terminal review of a rendered screenshot or art asset.
 *
 * The repository keeps `screenshots/*.png` for human review, but a PNG cannot be read in a terminal
 * and rendered pixels cannot be asserted without a decoder. This decodes one and reports what a
 * reviewer needs to judge it: a contrast-normalised luminance map (composition — is the shaft where
 * it should be, is a band blank?) plus colour statistics (flat regions show up as low contrast and a
 * tiny colour count).
 *
 * It is a review aid, not a gate. Its automated counterpart, which asserts the shaft's rendering
 * properties and runs in `npm run gate`, is `browser-shaft-render.mjs`.
 *
 * Usage:
 *   node scripts/review-screenshot.mjs screenshots/shaft.png
 *   node scripts/review-screenshot.mjs screenshots/shaft.png --columns=100
 *   node scripts/review-screenshot.mjs screenshots/shaft.png --crop=0,0,390,420
 *   node scripts/review-screenshot.mjs public/art/strata-1.png
 */

import { readFileSync } from 'node:fs';

import { decodePng, describeRegion, luminanceMap, parseCrop } from './png.mjs';

const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/review-screenshot.mjs <png> [--crop=x,y,w,h] [--columns=N]');
  process.exit(1);
}

try {
  const buffer = readFileSync(target);
  const image = decodePng(buffer);
  const columns = Number(argument('columns', 96));
  const crop = parseCrop(argument('crop', ''), image.width, image.height);

  const whole = describeRegion(image, { x0: 0, y0: 0, x1: image.width, y1: image.height });
  console.log(`${target} — ${image.width}×${image.height}, ${buffer.length} bytes`);
  console.log(
    `whole image: mean ${whole.mean.toFixed(3)}, contrast ${(whole.contrast * 100).toFixed(1)}%, ` +
      `${whole.colours} colours`,
  );

  const cropped = crop.x1 - crop.x0 !== image.width || crop.y1 - crop.y0 !== image.height;
  if (cropped) {
    const region = describeRegion(image, crop);
    console.log(
      `\ncrop ${crop.x0},${crop.y0} ${crop.x1 - crop.x0}×${crop.y1 - crop.y0}: ` +
        `mean ${region.mean.toFixed(3)}, contrast ${(region.contrast * 100).toFixed(1)}%, ` +
        `${region.colours} colours, covered ${(region.covered * 100).toFixed(1)}%`,
    );
    console.log(`top colours: ${region.top.join('  ')}`);
  } else {
    console.log(`top colours: ${whole.top.join('  ')}`);
  }

  console.log('');
  for (const line of luminanceMap(image, crop, columns)) {
    console.log(line);
  }
} catch (error) {
  console.error(`${target}: ${error.message}`);
  process.exit(1);
}
