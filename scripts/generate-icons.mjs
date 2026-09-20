/**
 * Placeholder icon generator.
 *
 * The installable manifest needs real PNG icons, and nothing in the repository vendors an art
 * pack yet (see the art track in `docs/superpowers/plans/v2-production-refinement-plan.md`). Rather
 * than commit opaque binaries, the placeholders are derived here deterministically: same command,
 * same bytes. This is the one script in this directory that is not a verification gate — its
 * output is committed under `public/icons/` and it retires when the owner signs off on a real pack.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT_DIR = new URL('../public/icons/', import.meta.url);

/** The game's palette, so the placeholder still reads as Deep Shaft. */
const COLOR = Object.freeze({
  background: '#12100e',
  rock: '#2c2721',
  shaft: '#080706',
  rail: '#4a443c',
  steel: '#9a9188',
  ore: '#e0a343',
  gem: '#6fd1c0',
});

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** Encodes an RGBA pixel buffer as a PNG (8-bit truecolour with alpha, no filtering). */
function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draws the mine-shaft glyph.
 *
 * `contentScale` shrinks the artwork about the centre so a maskable icon keeps its glyph inside
 * the safe zone while the background still bleeds to the edges.
 */
function drawIcon(size, contentScale = 1) {
  const pixels = new Uint8Array(size * size * 4);
  const at = (u) => Math.round((0.5 + (u - 0.5) * contentScale) * size);

  function paint(x0, x1, y0, y1, hex) {
    const [r, g, b] = parseHex(hex);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x += 1) {
        const index = (y * size + x) * 4;
        pixels[index] = r;
        pixels[index + 1] = g;
        pixels[index + 2] = b;
        pixels[index + 3] = 255;
      }
    }
  }

  function rect(u0, v0, u1, v1, hex) {
    paint(at(u0), at(u1), at(v0), at(v1), hex);
  }

  /** A downward-pointing bit: full width at the top, a point at the bottom. */
  function bit(cx, top, halfWidth, height, hex) {
    const topRow = at(top);
    const bottomRow = Math.max(topRow + 1, at(top + height));
    for (let y = topRow; y < bottomRow; y += 1) {
      const progress = (y - topRow) / (bottomRow - topRow);
      const half = halfWidth * (1 - progress);
      paint(at(cx - half), at(cx + half), y, y + 1, hex);
    }
  }

  rect(0, 0, 1, 1, COLOR.background);
  rect(0.22, 0.03, 0.78, 0.97, COLOR.rock);
  rect(0.32, 0.07, 0.68, 1, COLOR.shaft);
  rect(0.38, 0.18, 0.4, 1, COLOR.rail);
  rect(0.6, 0.18, 0.62, 1, COLOR.rail);
  bit(0.5, 0.1, 0.14, 0.22, COLOR.steel);
  rect(0.25, 0.28, 0.29, 0.32, COLOR.ore);
  rect(0.71, 0.42, 0.75, 0.46, COLOR.ore);
  rect(0.26, 0.58, 0.3, 0.62, COLOR.gem);
  rect(0.7, 0.7, 0.74, 0.74, COLOR.ore);

  return pixels;
}

function writeIcon(name, size, contentScale = 1) {
  const png = encodePng(size, drawIcon(size, contentScale));
  writeFileSync(new URL(name, OUT_DIR), png);
  console.log(`${name} — ${size}×${size}, ${png.length} bytes`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeIcon('icon-192.png', 192);
writeIcon('icon-512.png', 512);
writeIcon('icon-maskable-512.png', 512, 0.62);
