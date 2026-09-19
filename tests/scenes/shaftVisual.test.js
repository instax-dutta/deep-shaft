import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { shaftLayoutFor } from '../../src/scenes/shaftVisual.js';
import { getDepthTier } from '../../src/data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const VIEWPORT = { width: 360, height: 480 };

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

  it('draws rock texture on every stratum, identically on every frame', () => {
    const state = createInitialState();
    state.depthTier = 3;

    const first = shaftLayoutFor(state, VIEWPORT);
    const second = shaftLayoutFor(state, VIEWPORT);

    for (const band of first.bands) {
      expect(band.marks.length).toBeGreaterThan(0);
    }
    expect(second.bands).toEqual(first.bands);
  });

  it('keeps every rock mark inside the stratum it belongs to', () => {
    const state = createInitialState();
    state.depthTier = 5;

    for (const band of shaftLayoutFor(state, VIEWPORT).bands) {
      for (const mark of band.marks) {
        expect(mark.x).toBeGreaterThanOrEqual(band.left);
        expect(mark.x + mark.width).toBeLessThanOrEqual(band.left + band.width + 1e-9);
        expect(mark.y).toBeGreaterThanOrEqual(band.top);
        expect(mark.y + mark.height).toBeLessThanOrEqual(band.top + band.height + 1e-9);
      }
    }
  });

  it('does not repeat the same rock texture in every stratum', () => {
    const state = createInitialState();
    state.depthTier = 4;

    const { bands } = shaftLayoutFor(state, VIEWPORT);

    expect(bands[1].marks).not.toEqual(bands[2].marks);
  });

  it('lines the shaft with a rail down each edge', () => {
    const layout = shaftLayoutFor(createInitialState(), VIEWPORT);

    expect(layout.rails).toHaveLength(2);
    expect(layout.rails[0].left).toBe(0);
    expect(layout.rails[1].left + layout.rails[1].width).toBeCloseTo(VIEWPORT.width, 6);
    for (const rail of layout.rails) {
      expect(rail.width).toBeGreaterThan(0);
      expect(rail.height).toBeCloseTo(VIEWPORT.height, 6);
    }
  });

  it('marks where the mine is working inside the current stratum', () => {
    const state = createInitialState();
    state.depthTier = 3;

    const { bands, markerTop } = shaftLayoutFor(state, VIEWPORT);
    const current = bands[2];

    expect(markerTop).toBeGreaterThan(current.top);
    expect(markerTop).toBeLessThan(current.top + current.height);
  });

  it('draws a surface line at the top of the shaft', () => {
    const layout = shaftLayoutFor(createInitialState(), VIEWPORT);

    expect(layout.surfaceLine.y).toBe(0);
    expect(layout.surfaceLine.height).toBeGreaterThan(0);
  });

  it('keeps every part usable on a tiny viewport', () => {
    const layout = shaftLayoutFor(createInitialState(), { width: 1, height: 1 });

    expect(layout.rails[0].width).toBeGreaterThan(0);
    expect(layout.bands[0].height).toBeGreaterThan(0);
    expect(layout.bands[0].marks.every((mark) => Number.isFinite(mark.y))).toBe(true);
  });
});
