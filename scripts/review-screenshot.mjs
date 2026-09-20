/**
 * Terminal review of a rendered screenshot or art asset.
 *
 * The repository keeps `screenshots/*.png` for human review, but a PNG cannot be read in a terminal
 * and rendered pixels cannot be asserted without a decoder. This decodes one and reports what a
 * reviewer needs to judge it: a contrast-normalised luminance map (composition — is the shaft where
 * it should be, is a band blank?), plus colour statistics (a flat region shows up as a low
 * contrast and a tiny colour count).
 *
 * It is a review aid, not a gate: it always exits 0 unless the file cannot be decoded.
 *
 * Usage:
 *   node scripts/review-screenshot.mjs screenshots/shaft.png
 *   node scripts/review-screenshot.mjs screenshots/shaft.png --columns=100
 *   node scripts/review-screenshot.mjs screenshots/shaft.png --crop=0,0,390,420
 *   node scripts/review-screenshot.mjs public/art/strata-1.png
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CHANNELS_BY_COLOUR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) {
    return left;
  }
  return distanceUp <= distanceUpLeft ? up : upLeft;
}

/** Decodes an 8-bit, non-interlaced PNG into RGBA bytes. */
function decodePng(buffer) {
  if (!SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    throw new Error('Not a PNG');
  }

  let header = null;
  const data = [];
  let offset = 8;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        depth: chunk[8],
        colorType: chunk[9],
        interlace: chunk[12],
      };
    } else if (type === 'IDAT') {
      data.push(chunk);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (!header) {
    throw new Error('No IHDR chunk');
  }
  if (header.depth !== 8) {
    throw new Error(`Unsupported bit depth ${header.depth}; this reader handles 8-bit PNGs`);
  }
  const channels = CHANNELS_BY_COLOUR_TYPE[header.colorType];
  if (!channels) {
    throw new Error(`Unsupported colour type ${header.colorType}`);
  }
  if (header.interlace !== 0) {
    throw new Error('Interlaced PNGs are not supported');
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = header.width * channels;
  const pixels = new Uint8Array(header.width * header.height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let position = 0;

  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[position];
    position += 1;
    raw.copy(current, 0, position, position + stride);
    position += stride;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? current[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;

      let value = current[index];
      if (filter === 1) {
        value += left;
      } else if (filter === 2) {
        value += up;
      } else if (filter === 3) {
        value += (left + up) >> 1;
      } else if (filter === 4) {
        value += paeth(left, up, upLeft);
      }
      current[index] = value & 0xff;
    }

    for (let x = 0; x < header.width; x += 1) {
      const source = x * channels;
      const target = (y * header.width + x) * 4;
      if (channels === 1) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source];
        pixels[target + 2] = current[source];
        pixels[target + 3] = 255;
      } else if (channels === 2) {
        pixels[target] = current[source];
        pixels[target + 1] = current[source];
        pixels[target + 2] = current[source];
        pixels[target + 3] = current[source + 1];
      } else {
        pixels[target] = current[source];
        pixels[target + 1] = current[source + 1];
        pixels[target + 2] = current[source + 2];
        pixels[target + 3] = channels === 4 ? current[source + 3] : 255;
      }
    }

    current.copy(previous);
  }

  return { width: header.width, height: header.height, pixels };
}

/** Mean luminance, luminance standard deviation, and the most common colours of a region. */
function describe(image, region) {
  const { x0, y0, x1, y1 } = region;
  const luminances = [];
  const counts = new Map();

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * image.width + x) * 4;
      const [r, g, b, a] = [
        image.pixels[index],
        image.pixels[index + 1],
        image.pixels[index + 2],
        image.pixels[index + 3],
      ];
      if (a < 8) {
        continue;
      }
      luminances.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
      const key = `${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
        .toString(16)
        .padStart(2, '0')}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const mean = luminances.reduce((total, value) => total + value, 0) / Math.max(1, luminances.length);
  const variance =
    luminances.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, luminances.length);
  const total = Math.max(1, luminances.length);

  return {
    covered: luminances.length / ((x1 - x0) * (y1 - y0)),
    mean,
    contrast: Math.sqrt(variance),
    colours: new Set(counts.keys()).size,
    top: [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([hex, count]) => `#${hex} ${((count / total) * 100).toFixed(1)}%`),
  };
}

/** A luminance map of a region, normalised so low-contrast detail is still visible. */
function luminanceMap(image, region, columns) {
  const { x0, y0, x1, y1 } = region;
  const ramp = ' .:-=+*#%@';
  const step = Math.max(1, Math.floor((x1 - x0) / columns));
  const usedColumns = Math.floor((x1 - x0) / step);
  const rows = Math.floor((y1 - y0) / step / 2);

  const cells = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < usedColumns; column += 1) {
      const x = Math.min(x1 - 1, x0 + column * step);
      const y = Math.min(y1 - 1, y0 + row * step * 2);
      const index = (y * image.width + x) * 4;
      cells.push({
        row,
        column,
        value:
          (0.299 * image.pixels[index] +
            0.587 * image.pixels[index + 1] +
            0.114 * image.pixels[index + 2]) /
          255,
      });
    }
  }

  const values = cells.map((cell) => cell.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const lines = Array.from({ length: rows }, () => '');
  for (const cell of cells) {
    const level = Math.round(((cell.value - min) / range) * (ramp.length - 1));
    lines[cell.row] += ramp[level];
  }
  return lines;
}

function parseCrop(text, width, height) {
  if (!text) {
    return { x0: 0, y0: 0, x1: width, y1: height };
  }
  const [x, y, w, h] = text.split(',').map(Number);
  return {
    x0: Math.max(0, x),
    y0: Math.max(0, y),
    x1: Math.min(width, x + w),
    y1: Math.min(height, y + h),
  };
}

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

  const whole = describe(image, { x0: 0, y0: 0, x1: image.width, y1: image.height });
  console.log(`${target} — ${image.width}×${image.height}, ${buffer.length} bytes`);
  console.log(
    `whole image: mean ${whole.mean.toFixed(3)}, contrast ${(whole.contrast * 100).toFixed(1)}%, ` +
      `${whole.colours} colours`,
  );

  if (crop.x1 - crop.x0 !== image.width || crop.y1 - crop.y0 !== image.height) {
    const region = describe(image, crop);
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
