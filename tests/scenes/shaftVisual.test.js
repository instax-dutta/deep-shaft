import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { shaftLayoutFor } from '../../src/scenes/shaftVisual.js';
import { getDepthTier } from '../../src/data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';
import {
  ART_KEYS,
  MARKER_KEY,
  RAIL_KEY,
  STRATA_TILE_SIZE,
  artPack,
  mineralKeyFor,
  strataKeyFor,
} from '../../src/data/artPack.js';

const VIEWPORT = { width: 360, height: 480 };

/** Every art key the layout hands to the renderer must exist in the pack. */
function expectKnownArtKeys(layout) {
  for (const band of layout.bands) {
    expect(ART_KEYS).toContain(band.textureKey);
    for (const mineral of band.minerals) {
      expect(ART_KEYS).toContain(mineral.key);
    }
  }
  for (const rail of layout.rails) {
    expect(ART_KEYS).toContain(rail.textureKey);
  }
  expect(ART_KEYS).toContain(layout.marker.textureKey);
}

describe('shaftLayoutFor', () => {
  it('draws one band for every tier the mine has reached', () => {
    const state = createInitialState();

    expect(shaftLayoutFor(state, VIEWPORT).bands).toHaveLength(1);

    state.depthTier = 3;
    expect(shaftLayoutFor(state, VIEWPORT).bands).toHaveLength(3);
  });

  it('fills the viewport height with the bands', () => {
    const state = createInitialState();
    state.depthTier = 4;

    const { bands } = shaftLayoutFor(state, VIEWPORT);
    const covered = bands.reduce((total, band) => total + band.height, 0);

    expect(covered).toBeCloseTo(VIEWPORT.height, 6);
  });

  it('stacks the shallowest tier at the top and the deepest at the bottom', () => {
    const state = createInitialState();
    state.depthTier = 3;

    const { bands } = shaftLayoutFor(state, VIEWPORT);

    expect(bands[0].depthTier).toBe(1);
    expect(bands[2].depthTier).toBe(3);
    for (let index = 1; index < bands.length; index += 1) {
      expect(bands[index].top).toBeCloseTo(bands[index - 1].top + bands[index - 1].height, 6);
    }
  });

  it('marks the deepest band as the tier the mine is working', () => {
    const state = createInitialState();
    state.depthTier = 2;

    const { bands, currentTier } = shaftLayoutFor(state, VIEWPORT);

    expect(currentTier).toBe(2);
    expect(bands.at(-1).isCurrent).toBe(true);
    expect(bands[0].isCurrent).toBe(false);
  });

  it('gives every band a distinct colour so depth reads visually', () => {
    const state = createInitialState();
    state.depthTier = 5;

    const colours = shaftLayoutFor(state, VIEWPORT).bands.map((band) => band.color);

    expect(new Set(colours).size).toBe(colours.length);
  });

  it('keeps every band inside the viewport width', () => {
    const state = createInitialState();
    state.depthTier = 5;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      expect(band.left).toBeGreaterThanOrEqual(0);
      expect(band.left + band.width).toBeLessThanOrEqual(VIEWPORT.width);
    }
  });

  it('dims the shaft while a cave-in is active', () => {
    const state = createInitialState();

    expect(shaftLayoutFor(state, VIEWPORT, { caveIn: true }).dimmed).toBe(true);
    expect(shaftLayoutFor(state, VIEWPORT).dimmed).toBe(false);
  });

  it('brightens the shaft while a lucky vein is active', () => {
    const state = createInitialState();

    expect(shaftLayoutFor(state, VIEWPORT, { luckyVein: true }).glowing).toBe(true);
    expect(shaftLayoutFor(state, VIEWPORT).glowing).toBe(false);
  });

  it('falls back to a usable single band for a zero-sized viewport', () => {
    const layout = shaftLayoutFor(createInitialState(), { width: 0, height: 0 });

    expect(layout.bands).toHaveLength(1);
    expect(Number.isFinite(layout.bands[0].height)).toBe(true);
  });
});

describe('shaftLayoutFor depth storytelling', () => {
  it('names every stratum so the player can read where they are', () => {
    const state = createInitialState();
    state.depthTier = 4;

    const { bands } = shaftLayoutFor(state, VIEWPORT);

    expect(bands[0].label).toBe(getDepthTier(1).name);
    expect(bands[3].label).toBe(getDepthTier(4).name);
  });

  it('reports the depth in metres, increasing as the shaft goes down', () => {
    const state = createInitialState();
    state.depthTier = 5;

    const { bands } = shaftLayoutFor(state, VIEWPORT);
    const depths = bands.map((band) => band.depthMeters);

    expect(depths[0]).toBe(0);
    for (let index = 1; index < depths.length; index += 1) {
      expect(depths[index]).toBeGreaterThan(depths[index - 1]);
    }
  });

  it('shows what each stratum holds, in category order', () => {
    const state = createInitialState();
    state.depthTier = 2;

    const { bands } = shaftLayoutFor(state, VIEWPORT);
    const [ore, gems, rare] = bands[1].swatches;

    expect(bands[1].swatches).toHaveLength(3);
    expect(ore.name).toBe(resourceOfCategory(2, RESOURCE_CATEGORIES.ORE).name);
    expect(gems.name).toBe(resourceOfCategory(2, RESOURCE_CATEGORIES.GEMS).name);
    expect(rare.name).toBe(resourceOfCategory(2, RESOURCE_CATEGORIES.RARE).name);
  });

  it('gives every swatch a colour', () => {
    const state = createInitialState();
    state.depthTier = 3;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      for (const swatch of band.swatches) {
        expect(swatch.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('darkens the rock as the shaft gets deeper', () => {
    const state = createInitialState();
    state.depthTier = 5;

    const shades = shaftLayoutFor(state, VIEWPORT).bands.map((band) => band.shade);

    for (let index = 1; index < shades.length; index += 1) {
      expect(shades[index]).toBeGreaterThan(shades[index - 1]);
    }
    expect(shades.at(-1)).toBeLessThanOrEqual(1);
  });
});

describe('shaftLayoutFor art pack usage', () => {
  it('gives every stratum the rock tile of its own tier', () => {
    const state = createInitialState();
    state.depthTier = 5;

    const { bands } = shaftLayoutFor(state, VIEWPORT);

    bands.forEach((band, index) => {
      expect(band.textureKey).toBe(strataKeyFor(index + 1));
    });
  });

  it('scales each rock tile to fill its band instead of repeating a scarce texture', () => {
    const state = createInitialState();
    state.depthTier = 3;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      expect(band.tileScaleX).toBeCloseTo(band.width / STRATA_TILE_SIZE, 9);
      expect(band.tileScaleY).toBeCloseTo(band.height / STRATA_TILE_SIZE, 9);
      expect(band.tileScaleX).toBeGreaterThan(0);
      expect(band.tileScaleY).toBeGreaterThan(0);
    }
  });

  it('lines the shaft with the pack rail texture down each edge', () => {
    const layout = shaftLayoutFor(createInitialState(), VIEWPORT);

    expect(layout.rails).toHaveLength(2);
    expect(layout.rails[0].left).toBe(0);
    expect(layout.rails[1].left + layout.rails[1].width).toBeCloseTo(VIEWPORT.width, 6);
    for (const rail of layout.rails) {
      expect(rail.width).toBeGreaterThan(0);
      expect(rail.height).toBeCloseTo(VIEWPORT.height, 6);
      expect(rail.textureKey).toBe(RAIL_KEY);
      expect(rail.tileScaleX).toBeCloseTo(rail.width / artPack[RAIL_KEY].width, 9);
    }
  });

  it('repeats the rail pattern down the shaft instead of stretching one tile', () => {
    // The rail art is a ladder: sleepers every 32 pixels. Scaling it to fill the shaft height
    // stretched a single rung into a 66-pixel block and the ladder disappeared.
    const state = createInitialState();
    state.depthTier = 3;

    for (const rail of shaftLayoutFor(state, VIEWPORT).rails) {
      expect(rail.tileScaleY).toBe(1);
      expect(rail.height / rail.tileScaleY).toBeGreaterThanOrEqual(artPack[RAIL_KEY].height);
    }
  });

  it('places mineral sprites drawn from the pack, in every category, on every stratum', () => {
    const state = createInitialState();
    state.depthTier = 4;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      expect(band.minerals.length).toBeGreaterThan(0);

      const categories = new Set(band.minerals.map((mineral) => mineral.category));
      expect(categories).toEqual(new Set(Object.values(RESOURCE_CATEGORIES)));

      for (const mineral of band.minerals) {
        expect(mineral.key).toBe(mineralKeyFor(mineral.category));
        expect(mineral.size).toBeGreaterThan(0);
      }
    }
  });

  it('keeps every mineral inside the stratum it belongs to', () => {
    const state = createInitialState();
    state.depthTier = 5;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      for (const mineral of band.minerals) {
        expect(mineral.x).toBeGreaterThanOrEqual(band.left);
        expect(mineral.x + mineral.size).toBeLessThanOrEqual(band.left + band.width + 1e-9);
        expect(mineral.y).toBeGreaterThanOrEqual(band.top);
        expect(mineral.y + mineral.size).toBeLessThanOrEqual(band.top + band.height + 1e-9);
      }
    }
  });

  it('keeps the mineral cluster clear of the stratum label and legend', () => {
    // The label sits top-left and the swatches bottom-left, so the sprites belong in the right
    // half of the band rather than underneath either of them.
    const state = createInitialState();
    state.depthTier = 5;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      for (const mineral of band.minerals) {
        expect(mineral.x).toBeGreaterThan(band.left + band.width * 0.4);
      }
    }
  });

  it('laces the same strata identically on every frame', () => {
    const state = createInitialState();
    state.depthTier = 3;

    const first = shaftLayoutFor(state, VIEWPORT);
    const second = shaftLayoutFor(state, VIEWPORT);

    expect(second.bands).toEqual(first.bands);
  });

  it('does not lace the same mineral cluster into every stratum', () => {
    const state = createInitialState();
    state.depthTier = 4;

    const { bands } = shaftLayoutFor(state, VIEWPORT);

    expect(bands[1].minerals).not.toEqual(bands[2].minerals);
  });

  it('drops the mineral dressing when a band is too short to show it', () => {
    const state = createInitialState();
    state.depthTier = 5;

    // Five tiers in a 100px viewport leaves 20px bands, which cannot hold a sprite plus a label.
    const { bands } = shaftLayoutFor(state, { width: 360, height: 100 });

    for (const band of bands) {
      expect(band.height).toBe(20);
      expect(band.minerals).toHaveLength(0);
    }
  });
});

describe('shaftLayoutFor depth marker', () => {
  it('places the pack drill sprite where the mine is working, inside the current stratum', () => {
    const state = createInitialState();
    state.depthTier = 3;

    const { bands, marker } = shaftLayoutFor(state, VIEWPORT);
    const current = bands[2];

    expect(marker.textureKey).toBe(MARKER_KEY);
    expect(marker.y).toBeGreaterThan(current.top);
    expect(marker.y).toBeLessThan(current.top + current.height);
    expect(marker.size).toBeGreaterThan(0);
    expect(marker.x).toBeLessThan(current.left + current.width);
  });

  it('draws a surface line at the top of the shaft', () => {
    const layout = shaftLayoutFor(createInitialState(), VIEWPORT);

    expect(layout.surfaceLine.y).toBe(0);
    expect(layout.surfaceLine.height).toBeGreaterThan(0);
  });

  it('hands the renderer only art keys the pack declares', () => {
    const state = createInitialState();
    state.depthTier = 5;

    expectKnownArtKeys(shaftLayoutFor(state, VIEWPORT, { caveIn: true }));
  });

  it('keeps every part usable on a tiny viewport', () => {
    const layout = shaftLayoutFor(createInitialState(), { width: 1, height: 1 });

    expect(layout.rails[0].width).toBeGreaterThan(0);
    expect(layout.bands[0].height).toBeGreaterThan(0);
    expect(layout.marker.size).toBeGreaterThan(0);
    expect(Number.isFinite(layout.marker.y)).toBe(true);
  });
});
