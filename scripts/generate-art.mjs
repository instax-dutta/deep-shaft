/**
 * Deep Shaft art pack generator.
 *
 * The pack is authored in-house and rendered here, deterministically: same command, same bytes.
 * It lives in a script rather than as unexplained committed binaries so the art has provenance,
 * can be retuned by editing one palette, and carries no third-party licence to honour.
 *
 * Everything rendered comes from `src/data/artPack.js` (which keys exist and at what pixel size)
 * and `src/data/artPalette.js` (the colours), so the in-game tiles, the mineral sprites, and the
 * app icons are visibly one set. A key with no recipe here is an error, not a silent skip.
 *
 * Run: node scripts/generate-art.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import {
  CAVERN_COLOR,
  MINERAL_COLORS,
  RAIL_COLOR,
  SLEEPER_COLOR,
  mixHex,
  shadeHex,
  tierColor,
} from '../src/data/artPalette.js';
import { ART_KEYS, artPack, strataKeyFor } from '../src/data/artPack.js';

const PUBLIC_ROOT = new URL('../public/', import.meta.url);
const PACK_MANIFEST_FILE = 'art/pack.json';

/** Steel and warm accents the drill head and icons share. */
const STEEL = '#9a9188';
const STEEL_LIGHT = '#d6cfc6';
const STEEL_DARK = '#5c564e';
const WOOD = '#6b5233';

/* ------------------------------------------------------------------ PNG encoding */

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

/** Encodes straight-alpha RGBA bytes as an 8-bit truecolour-with-alpha PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------------ drawing */

function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Deterministic 0..1 value from two integers, so the pack never changes between runs. */
function hash01(a, b) {
  let hash = 2166136261 ^ Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

/**
 * A tiny software rasteriser.
 *
 * Every shape is drawn into a buffer that is `scale` times the output resolution and then averaged
 * down, which is what gives curved and diagonal edges clean coverage without per-shape coverage
 * maths. Coordinates are in *output* pixels; the scale stays internal.
 */
class Raster {
  constructor(width, height, scale = 4) {
    this.width = width;
    this.height = height;
    this.scale = scale;
    this.w = width * scale;
    this.h = height * scale;
    this.data = new Float32Array(this.w * this.h * 4);
  }

  /** Source-over blend of one device pixel. */
  blend(x, y, rgb, alpha) {
    if (alpha <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) {
      return;
    }
    const index = (y * this.w + x) * 4;
    const data = this.data;
    const destination = data[index + 3];
    const outAlpha = alpha + destination * (1 - alpha);
    if (outAlpha <= 0) {
      return;
    }
    const weight = (destination * (1 - alpha)) / outAlpha;
    const source = alpha / outAlpha;
    data[index] = data[index] * weight + rgb[0] * source;
    data[index + 1] = data[index + 1] * weight + rgb[1] * source;
    data[index + 2] = data[index + 2] * weight + rgb[2] * source;
    data[index + 3] = outAlpha;
  }

  rect(x0, y0, x1, y1, color, alpha = 1) {
    const rgb = parseHex(color);
    const scale = this.scale;
    const dx0 = Math.max(0, Math.round(x0 * scale));
    const dx1 = Math.min(this.w, Math.round(x1 * scale));
    const dy0 = Math.max(0, Math.round(y0 * scale));
    const dy1 = Math.min(this.h, Math.round(y1 * scale));

    for (let y = dy0; y < dy1; y += 1) {
      for (let x = dx0; x < dx1; x += 1) {
        this.blend(x, y, rgb, alpha);
      }
    }
  }

  gradientV(x0, y0, x1, y1, topColor, bottomColor, alpha = 1) {
    const scale = this.scale;
    const dy0 = Math.max(0, Math.round(y0 * scale));
    const dy1 = Math.min(this.h, Math.round(y1 * scale));
    const height = Math.max(1, dy1 - dy0);

    for (let y = dy0; y < dy1; y += 1) {
      const t = (y + 0.5 - dy0) / height;
      const rgb = parseHex(mixHex(topColor, bottomColor, t));
      this.rect(x0, y / scale, x1, (y + 1) / scale, `#${rgb
        .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
        .join('')}`, alpha);
    }
  }

  disc(cx, cy, radius, color, alpha = 1) {
    const rgb = parseHex(color);
    const scale = this.scale;
    const r = radius * scale;
    const dcx = cx * scale;
    const dcy = cy * scale;

    for (let y = Math.max(0, Math.floor(dcy - r)); y < Math.min(this.h, Math.ceil(dcy + r)); y += 1) {
      for (let x = Math.max(0, Math.floor(dcx - r)); x < Math.min(this.w, Math.ceil(dcx + r)); x += 1) {
        const dx = x + 0.5 - dcx;
        const dy = y + 0.5 - dcy;
        if (dx * dx + dy * dy <= r * r) {
          this.blend(x, y, rgb, alpha);
        }
      }
    }
  }

  /** Even-odd scanline fill; `points` is a closed polygon in output pixels. */
  poly(points, color, alpha = 1) {
    const rgb = parseHex(color);
    const scale = this.scale;
    const pts = points.map(([x, y]) => [x * scale, y * scale]);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h, Math.ceil(maxY));

    for (let y = y0; y < y1; y += 1) {
      const cy = y + 0.5;
      const crossings = [];
      for (let index = 0; index < pts.length; index += 1) {
        const [ax, ay] = pts[index];
        const [bx, by] = pts[(index + 1) % pts.length];
        if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
          crossings.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
        }
      }
      crossings.sort((a, b) => a - b);

      for (let index = 0; index + 1 < crossings.length; index += 2) {
        const from = Math.max(0, Math.ceil(crossings[index] - 0.5));
        const to = Math.min(this.w, Math.ceil(crossings[index + 1] - 0.5));
        for (let x = from; x < to; x += 1) {
          this.blend(x, y, rgb, alpha);
        }
      }
    }
  }

  /** A thick segment with rounded ends, so cracks and grain do not end in hard corners. */
  line(x0, y0, x1, y1, thickness, color, alpha = 1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      this.disc(x0, y0, thickness / 2, color, alpha);
      return;
    }
    const nx = (-dy / length) * (thickness / 2);
    const ny = (dx / length) * (thickness / 2);

    this.poly(
      [
        [x0 + nx, y0 + ny],
        [x1 + nx, y1 + ny],
        [x1 - nx, y1 - ny],
        [x0 - nx, y0 - ny],
      ],
      color,
      alpha,
    );
    this.disc(x0, y0, thickness / 2, color, alpha);
    this.disc(x1, y1, thickness / 2, color, alpha);
  }

  /**
   * The finished image: the supersampled buffer averaged down to the output resolution.
   *
   * Colour is averaged weighted by coverage, not straight, so an edge pixel does not darken
   * towards whatever the buffer held where nothing was drawn. This is the step that turns
   * supersampling into clean edges, so it must run before encoding rather than after.
   */
  toPixels() {
    const out = new Uint8Array(this.width * this.height * 4);
    const scale = this.scale;
    const samples = scale * scale;

    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        let red = 0;
        let green = 0;
        let blue = 0;
        let alpha = 0;

        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            const index = ((y * scale + sy) * this.w + (x * scale + sx)) * 4;
            const coverage = this.data[index + 3];
            red += this.data[index] * coverage;
            green += this.data[index + 1] * coverage;
            blue += this.data[index + 2] * coverage;
            alpha += coverage;
          }
        }

        const outIndex = (y * this.width + x) * 4;
        out[outIndex] = alpha > 0 ? clampByte(red / alpha) : 0;
        out[outIndex + 1] = alpha > 0 ? clampByte(green / alpha) : 0;
        out[outIndex + 2] = alpha > 0 ? clampByte(blue / alpha) : 0;
        out[outIndex + 3] = clampByte((alpha / samples) * 255);
      }
    }

    return out;
  }

  /**
   * Shape and texture statistics.
   *
   * Art is judged by eye, but two failure modes have a number: an asset that is blank or a single
   * flat tone, and a "textured" tile whose variation is so slight it reads as flat colour once
   * stretched across a band. `contrast` is the luminance standard deviation as a share of the
   * range, which is what tells the two apart.
   */
  stats() {
    const pixels = this.toPixels();
    let covered = 0;
    const colors = new Set();
    const luminances = [];

    for (let index = 0; index < this.width * this.height; index += 1) {
      if (pixels[index * 4 + 3] > 8) {
        covered += 1;
        colors.add(`${pixels[index * 4]},${pixels[index * 4 + 1]},${pixels[index * 4 + 2]}`);
        luminances.push(
          (0.299 * pixels[index * 4] + 0.587 * pixels[index * 4 + 1] + 0.114 * pixels[index * 4 + 2]) /
            255,
        );
      }
    }

    const mean = luminances.reduce((total, value) => total + value, 0) / Math.max(1, luminances.length);
    const variance =
      luminances.reduce((total, value) => total + (value - mean) ** 2, 0) /
      Math.max(1, luminances.length);

    return {
      coverage: covered / (this.width * this.height),
      colors: colors.size,
      contrast: Math.sqrt(variance),
    };
  }
}

/** Irregular blob outline, deterministic per seed. */
function blobPoints(cx, cy, width, height, seed) {
  const points = [];
  const steps = 9;
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const wobble = 0.7 + hash01(seed, index) * 0.55;
    points.push([
      cx + Math.cos(angle) * (width / 2) * wobble,
      cy + Math.sin(angle) * (height / 2) * wobble,
    ]);
  }
  return points;
}

function diamondPoints(cx, cy, radius) {
  return [
    [cx, cy - radius],
    [cx + radius * 0.8, cy],
    [cx, cy + radius],
    [cx - radius * 0.8, cy],
  ];
}

/** Rounded-rectangle outline as a polygon, for icon corners the eye reads as deliberate. */
function roundedRectPoints(x0, y0, x1, y1, radius) {
  const points = [];
  const corners = [
    [x1 - radius, y1 - radius, 0],
    [x0 + radius, y1 - radius, Math.PI / 2],
    [x0 + radius, y0 + radius, Math.PI],
    [x1 - radius, y0 + radius, Math.PI * 1.5],
  ];
  const steps = 10;

  for (const [cx, cy, start] of corners) {
    for (let index = 0; index <= steps; index += 1) {
      const angle = start + (index / steps) * (Math.PI / 2);
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
  }
  return points;
}

/* ------------------------------------------------------------------------ recipes */

function drawStrataTile(definition) {
  const size = definition.width;
  const tier = definition.tier;
  const base = tierColor(tier);
  const light = shadeHex(base, 0.16);
  const dark = shadeHex(base, -0.32);
  const raster = new Raster(size, size, 3);

  raster.rect(0, 0, size, size, base);

  // Broad clumps of lighter and darker rock, so a band does not read as flat colour.
  for (let index = 0; index < 9; index += 1) {
    const cx = hash01(tier, index * 7) * size;
    const cy = hash01(tier, index * 7 + 1) * size;
    const width = 24 + hash01(tier, index * 7 + 2) * 56;
    const height = 14 + hash01(tier, index * 7 + 3) * 32;
    const lighter = hash01(tier, index * 7 + 4) > 0.45;
    raster.poly(blobPoints(cx, cy, width, height, tier * 31 + index), lighter ? light : dark, 0.3);
  }

  // Two broad washes, so the tile still varies at a distance once it is stretched over a band.
  raster.gradientV(0, 0, size, size * 0.5, shadeHex(base, -0.18), base, 0.3);
  raster.gradientV(0, size * 0.5, size, size, base, shadeHex(base, -0.22), 0.3);

  // Strata seams, evenly spaced so the tile stays seamless when it tiles vertically.
  for (const y of [10, 58, 106, 154]) {
    raster.rect(0, y, size, y + 2, shadeHex(base, -0.6), 0.45);
    raster.rect(0, y + 2, size, y + 3.5, shadeHex(base, 0.3), 0.16);
  }

  // Grain: many small specks, alternating lighter and darker like broken rock.
  for (let index = 0; index < 1100; index += 1) {
    const x = hash01(tier + 11, index) * size;
    const y = hash01(tier + 23, index) * size;
    const lighter = hash01(tier + 37, index) > 0.5;
    const side = hash01(tier + 53, index) > 0.85 ? 2 : 1;
    raster.rect(x, y, x + side, y + side, lighter ? light : dark, lighter ? 0.18 : 0.24);
  }

  // A few short cracks, so the rock has structure.
  for (let index = 0; index < 5; index += 1) {
    const x = 8 + hash01(tier + 71, index) * (size - 16);
    const y = 8 + hash01(tier + 83, index) * (size - 28);
    const length = 16 + hash01(tier + 97, index) * 28;
    raster.line(x, y, x + length * 0.6, y + length * 0.75, 1.6, shadeHex(base, -0.7), 0.32);
  }

  // Embedded minerals in the legend colours, so the shaft and the swatch legend agree.
  const flecks = [
    { color: MINERAL_COLORS.ore, count: 5, radius: 2.6 },
    {
      color: hash01(tier, 5) > 0.5 ? MINERAL_COLORS.rare : MINERAL_COLORS.gems,
      count: 2,
      radius: 2.2,
    },
  ];
  for (const fleck of flecks) {
    for (let index = 0; index < fleck.count; index += 1) {
      const cx = 12 + hash01(tier + 101, index * 3) * (size - 24);
      const cy = 12 + hash01(tier + 113, index * 3 + 1) * (size - 24);
      const radius = fleck.radius * (0.8 + hash01(tier + 127, index * 3 + 2) * 0.5);
      raster.poly(diamondPoints(cx, cy, radius), fleck.color, 0.92);
      // A single bright pixel is what makes a fleck read as a glint rather than a stain.
      raster.rect(cx - radius * 0.5, cy - radius * 0.6, cx - radius * 0.1, cy - radius * 0.1, '#ffffff', 0.55);
    }
  }

  return raster;
}

function drawRailTile(definition) {
  const { width, height } = definition;
  const raster = new Raster(width, height, 4);

  raster.rect(0, 0, width, height, shadeHex(CAVERN_COLOR, 0.08));

  // Sleepers sit behind the steel; one per tile keeps the ladder repeating cleanly.
  raster.rect(0, 7, width, 14, WOOD);
  raster.rect(0, 14, width, 15.5, shadeHex(WOOD, -0.45));

  // Two steel rails near the edges, so a squashed strip still shows rail at both sides.
  for (const x of [2, 24]) {
    raster.rect(x, 0, x + 6, height, RAIL_COLOR);
    raster.rect(x, 0, x + 1.5, height, '#ffffff', 0.4);
    raster.rect(x + 4.5, 0, x + 6, height, shadeHex(SLEEPER_COLOR, 0.25), 0.5);
    raster.disc(x + 3, 4, 1.2, shadeHex(SLEEPER_COLOR, 0.1), 0.8);
  }

  return raster;
}

/**
 * Mineral sprites are drawn in neutral tones and tinted at draw time with the category's legend
 * colour, so one sprite serves every tier and can never disagree with the legend.
 */
function drawMineralSprite(definition) {
  const { width, height } = definition;
  const raster = new Raster(width, height, 4);
  const light = '#f6f3ea';
  const mid = '#cdc6b6';
  const dark = '#8b8474';

  if (definition.category === 'ore') {
    // A cluster of rounded pebbles: common, chunky, unglamorous.
    const pebbles = [
      [8, 15, 4.8],
      [15.5, 16, 3.8],
      [12.5, 9, 3.2],
    ];
    for (const [cx, cy, radius] of pebbles) {
      raster.disc(cx, cy, radius, dark);
      raster.disc(cx - radius * 0.15, cy - radius * 0.18, radius * 0.82, mid);
      raster.disc(cx - radius * 0.42, cy - radius * 0.45, radius * 0.34, light, 0.85);
    }
  } else if (definition.category === 'gems') {
    // A faceted cut stone: symmetric, brighter, clearly worked rather than found.
    const outline = [
      [12, 1.5],
      [20.5, 9],
      [12, 22.5],
      [3.5, 9],
    ];
    raster.poly(outline, mid);
    raster.poly([outline[0], outline[1], [12, 12], outline[3]], light, 0.9);
    raster.poly([outline[3], [12, 12], outline[2]], dark, 0.5);
    raster.poly([outline[0], [12, 12], outline[1]], '#ffffff', 0.35);
  } else {
    // A taller crystal cluster: rare minerals read as shards, not stones.
    const shards = [
      [7, 6, 4, 20],
      [12.5, 2, 4.6, 21.5],
      [18, 8, 3.6, 18],
    ];
    for (const [cx, top, half, bottom] of shards) {
      raster.poly(
        [
          [cx, top],
          [cx + half, top + (bottom - top) * 0.3],
          [cx + half * 0.55, bottom],
          [cx - half * 0.6, bottom],
          [cx - half, top + (bottom - top) * 0.35],
        ],
        mid,
      );
      raster.poly(
        [
          [cx, top],
          [cx - half, top + (bottom - top) * 0.35],
          [cx - half * 0.6, bottom],
          [cx - half * 0.1, bottom],
        ],
        light,
        0.7,
      );
      // A dark shadow face, so each shard keeps its shape once the scene tints it.
      raster.poly(
        [
          [cx + half * 0.2, top + (bottom - top) * 0.25],
          [cx + half, top + (bottom - top) * 0.3],
          [cx + half * 0.55, bottom],
          [cx + half * 0.05, bottom],
        ],
        dark,
        0.55,
      );
    }
  }

  return raster;
}

/** The drill head that marks where the mine is working, pointing right down the shaft. */
function drawMarkerDrill(definition) {
  const { width, height } = definition;
  const raster = new Raster(width, height, 4);
  const midY = height / 2;

  raster.poly(
    [
      [2, midY - 6],
      [20, midY - 6],
      [24, midY],
      [20, midY + 6],
      [2, midY + 6],
    ],
    STEEL,
  );
  raster.rect(2, midY - 6, 20, midY - 3.5, STEEL_LIGHT, 0.55);
  raster.rect(2, midY + 3.5, 20, midY + 6, STEEL_DARK, 0.6);
  raster.poly(
    [
      [22, midY - 4.5],
      [31, midY],
      [22, midY + 4.5],
    ],
    STEEL_LIGHT,
  );
  raster.rect(6, midY - 8, 9, midY + 8, MINERAL_COLORS.rare, 0.85);
  raster.rect(6, midY - 8, 9, midY - 6, '#ffffff', 0.4);
  raster.disc(14, midY, 1.6, STEEL_DARK, 0.8);

  return raster;
}

/**
 * The installable icon: the same shaft the game draws, at icon scale.
 *
 * `maskable` keeps the artwork inside the safe zone and bleeds the background to the edges, which
 * is what stops a launcher's circular mask from cropping the shaft opening.
 */
function drawIcon(definition) {
  const size = definition.size;
  const maskable = definition.maskable === true;
  const raster = new Raster(size, size, size >= 512 ? 2 : 3);
  const inset = maskable ? 0.62 : 1;
  const at = (value) => (0.5 + (value - 0.5) * inset) * size;

  if (maskable) {
    raster.rect(0, 0, size, size, CAVERN_COLOR);
  } else {
    raster.poly(roundedRectPoints(0, 0, size, size, size * 0.2), CAVERN_COLOR);
  }

  // The shaft opening, receding into the rock.
  raster.rect(at(0.3), at(0.1), at(0.7), at(0.94), shadeHex(CAVERN_COLOR, -0.55));

  const bands = [
    { from: 0.14, to: 0.4, tier: 4 },
    { from: 0.4, to: 0.66, tier: 2 },
    { from: 0.66, to: 0.92, tier: 5 },
  ];
  for (const band of bands) {
    const color = tierColor(band.tier);
    raster.rect(at(0.3), at(band.from), at(0.7), at(band.to), color);
    raster.rect(at(0.3), at(band.to) - size * 0.012 * inset, at(0.7), at(band.to), shadeHex(color, -0.55), 0.75);
    raster.rect(at(0.3), at(band.from), at(0.7), at(band.from) + size * 0.008 * inset, shadeHex(color, 0.3), 0.5);
  }

  // Lining rails down both walls of the opening.
  for (const x of [0.28, 0.66]) {
    raster.rect(at(x), at(0.1), at(x + 0.04), at(0.94), RAIL_COLOR);
    raster.rect(at(x), at(0.1), at(x + 0.012), at(0.94), '#ffffff', 0.35);
  }

  // The surface line, so the top of the icon reads as daylight above the shaft.
  raster.rect(at(0.22), at(0.1), at(0.78), at(0.128), RAIL_COLOR);

  // A drill head starting the cut, and mineral glints in the rock.
  const midY = at(0.3);
  raster.poly(
    [
      [at(0.42), midY - size * 0.045 * inset],
      [at(0.56), midY - size * 0.045 * inset],
      [at(0.6), midY],
      [at(0.56), midY + size * 0.045 * inset],
      [at(0.42), midY + size * 0.045 * inset],
    ],
    STEEL,
  );
  raster.poly(
    [
      [at(0.58), midY - size * 0.032 * inset],
      [at(0.66), midY],
      [at(0.58), midY + size * 0.032 * inset],
    ],
    STEEL_LIGHT,
  );

  const glints = [
    [0.4, 0.52, MINERAL_COLORS.ore],
    [0.58, 0.62, MINERAL_COLORS.gems],
    [0.44, 0.8, MINERAL_COLORS.rare],
  ];
  for (const [x, y, color] of glints) {
    raster.poly(diamondPoints(at(x), at(y), size * 0.035 * inset), color, 0.95);
    raster.rect(
      at(x) - size * 0.012 * inset,
      at(y) - size * 0.018 * inset,
      at(x),
      at(y) - size * 0.006 * inset,
      '#ffffff',
      0.5,
    );
  }

  return raster;
}

const RECIPES = Object.freeze({
  strata: drawStrataTile,
  rail: drawRailTile,
  mineral: drawMineralSprite,
  marker: drawMarkerDrill,
});

/** App icons are not game art, so they are not part of `artPack`; they share its palette. */
const ICONS = Object.freeze([
  { file: 'icons/icon-32.png', size: 32 },
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/apple-touch-icon-180.png', size: 180 },
  { file: 'icons/icon-maskable-512.png', size: 512, maskable: true },
]);

/* --------------------------------------------------------------------------- main */

function writePng(relativePath, raster, width, height) {
  const target = new URL(relativePath, PUBLIC_ROOT);
  mkdirSync(new URL('.', target), { recursive: true });
  const png = encodePng(width, height, raster.toPixels());
  writeFileSync(target, png);
  return png.length;
}

/**
 * Prints a luminance map of one asset.
 *
 * Art has to be judged by eye, and the only eye available while authoring is the terminal. `--preview`
 * makes a shape's composition checkable (is the drill off-centre? does the crystal read as a
 * crystal?) without opening a browser, and it doubles as a review aid for a human.
 *
 * Usage: node scripts/generate-art.mjs --preview=icons/icon-192.png
 */
function previewLines(pixels, width, height, columns = 64) {
  const ramp = ' .:-=+*#%@';
  const step = Math.max(1, Math.floor(width / columns));
  const usedColumns = Math.floor(width / step);
  const rows = Math.round(height / step / 2);

  const grid = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < usedColumns; column += 1) {
      const x = Math.min(width - 1, column * step);
      const y = Math.min(height - 1, row * step * 2);
      const index = (y * width + x) * 4;
      grid.push({
        row,
        column,
        alpha: pixels[index + 3] / 255,
        luminance:
          (0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]) / 255,
      });
    }
  }

  // Normalise across the sampled cells. A rock tile varies by a few percent, which a fixed ramp
  // would flatten into one character and hide exactly the texture worth reviewing.
  const covered = grid.filter((cell) => cell.alpha > 0.05);
  const values = covered.map((cell) => cell.luminance * cell.alpha);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 1;
  const range = max - min || 1;

  const lines = Array.from({ length: rows }, () => '');
  for (const cell of grid) {
    const edges = ramp.length - 2;
    const value = cell.alpha <= 0.05 ? 0 : 1 + ((cell.luminance * cell.alpha - min) / range) * edges;
    lines[cell.row] += ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(value)))];
  }

  return lines;
}

const report = [];
/** Every rendered asset, kept so `--preview` can redraw one without rebuilding it. */
const ALL_ASSETS = [];

for (const key of ART_KEYS) {
  const definition = artPack[key];
  const recipe = RECIPES[definition.kind];
  if (!recipe) {
    throw new Error(`No recipe for art key "${key}" of kind "${definition.kind}"`);
  }

  const raster = recipe(definition);
  const bytes = writePng(definition.file, raster, definition.width, definition.height);
  ALL_ASSETS.push({ key, file: definition.file, raster });
  report.push({ file: definition.file, detail: `${definition.width}×${definition.height}`, bytes, ...raster.stats() });
}

for (const icon of ICONS) {
  const raster = drawIcon(icon);
  const bytes = writePng(icon.file, raster, icon.size, icon.size);
  ALL_ASSETS.push({ key: icon.file, file: icon.file, raster });
  report.push({ file: icon.file, detail: `${icon.size}×${icon.size}`, bytes, ...raster.stats() });
}

// The service worker cannot import `artPack`, so the same list is emitted for it here rather than
// being restated by hand where it could drift.
writeFileSync(
  new URL(PACK_MANIFEST_FILE, PUBLIC_ROOT),
  `${JSON.stringify(
    {
      name: 'Deep Shaft art pack',
      version: 1,
      files: ART_KEYS.map((key) => ({
        key,
        file: artPack[key].file,
        width: artPack[key].width,
        height: artPack[key].height,
      })),
    },
    null,
    2,
  )}\n`,
);

for (const entry of report) {
  console.log(
    `${entry.file.padEnd(32)} ${entry.detail.padEnd(9)} ${String(entry.bytes).padStart(6)} B  ` +
      `coverage ${(entry.coverage * 100).toFixed(1)}%  colours ${String(entry.colors).padStart(4)}  ` +
      `contrast ${(entry.contrast * 100).toFixed(1)}%`,

  );
}
console.log(`\n${report.length} files · manifest ${PACK_MANIFEST_FILE} · strata keys ${strataKeyFor(1)}…${strataKeyFor(5)}`);

const previewRequest = process.argv.find((argument) => argument.startsWith('--preview='))?.slice(10);
if (previewRequest) {
  const wanted = ALL_ASSETS.find((asset) => asset.file === previewRequest || asset.key === previewRequest);
  if (!wanted) {
    console.error(`\nNo asset named "${previewRequest}"`);
    process.exitCode = 1;
  } else {
    console.log(`\n${wanted.file} (${wanted.raster.width}×${wanted.raster.height})\n`);
    for (const line of previewLines(wanted.raster.toPixels(), wanted.raster.width, wanted.raster.height)) {
      console.log(line);
    }
  }
}
