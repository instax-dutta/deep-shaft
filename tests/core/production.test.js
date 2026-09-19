import { describe, expect, it } from 'vitest';

import {
  advanceProduction,
  extractionRatePerSecond,
  productionPerSecond,
} from '../../src/core/production.js';
import { assignWorker } from '../../src/core/workers.js';
import { M } from '../../src/core/numbers/magnitude.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { getDrill } from '../../src/data/drills.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const firstDrill = getDrill('drill-1');
const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE).id;

function withDrill(state, drillId, count = 1) {
  state.drills[drillId] = count;
  return state;
}

describe('productionPerSecond', () => {
  it('produces nothing before any drill is owned', () => {
    const state = createInitialState();

    expect(productionPerSecond(state)).toEqual({});
  });

  it('produces the active tier ore once a drill is running', () => {
    const state = withDrill(createInitialState(), firstDrill.id);

    const rates = productionPerSecond(state);

    expect(rates[tierOneOre]).toBeCloseTo(firstDrill.baseOutput, 10);
  });

  it('sums every owned drill of the same tier', () => {
    const state = withDrill(createInitialState(), firstDrill.id, 3);

    expect(productionPerSecond(state)[tierOneOre]).toBeCloseTo(
      firstDrill.baseOutput * 3,
      10,
    );
  });

  it('ignores drills with a zero or missing count', () => {
    const state = createInitialState();
    state.drills[firstDrill.id] = 0;

    expect(productionPerSecond(state)).toEqual({});
  });

  it('multiplies output for deeper tiers', () => {
    const shallow = withDrill(createInitialState(), firstDrill.id);
    const deep = withDrill(createInitialState(), firstDrill.id);
    deep.depthTier = 2;

    const shallowRate = productionPerSecond(shallow)[tierOneOre];
    const deepRate = Object.values(productionPerSecond(deep))[0];

    expect(deepRate).toBeCloseTo(shallowRate * config.production.depthOutputGrowth, 10);
  });

  it('applies the permanent prestige multiplier', () => {
    const state = withDrill(createInitialState(), firstDrill.id);
    state.prestige.multiplier = 3;

    expect(productionPerSecond(state)[tierOneOre]).toBeCloseTo(
      firstDrill.baseOutput * 3,
      10,
    );
  });

  it('produces the new tier ore after digging deeper', () => {
    const state = withDrill(createInitialState(), firstDrill.id);
    state.depthTier = 2;
    const tierTwoOre = resourceOfCategory(2, RESOURCE_CATEGORIES.ORE).id;

    expect(productionPerSecond(state)[tierTwoOre]).toBeGreaterThan(0);
    expect(productionPerSecond(state)[tierOneOre]).toBeUndefined();
  });
});

describe('advanceProduction', () => {
  it('adds production for the elapsed time', () => {
    const state = withDrill(createInitialState(), firstDrill.id);

    const result = advanceProduction(state, 4);

    expect(result.ok).toBe(true);
    expect(state.resources[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 4, 10);
  });

  it('keeps fractional output instead of rounding each tick', () => {
    const steady = withDrill(createInitialState(), firstDrill.id);
    const ticked = withDrill(createInitialState(), firstDrill.id);

    advanceProduction(steady, 1);
    for (let tick = 0; tick < 10; tick += 1) {
      advanceProduction(ticked, 0.1);
    }

    expect(ticked.resources[tierOneOre]).toBeCloseTo(steady.resources[tierOneOre], 8);
  });

  it('reports the resources gained', () => {
    const state = withDrill(createInitialState(), firstDrill.id);

    const result = advanceProduction(state, 2);

    expect(result.gains[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 2, 10);
  });

  it('changes nothing for zero, negative, or non-finite elapsed time', () => {
    const state = withDrill(createInitialState(), firstDrill.id);
    const before = structuredClone(state);

    expect(advanceProduction(state, 0).ok).toBe(true);
    expect(advanceProduction(state, -5).ok).toBe(true);
    expect(advanceProduction(state, Number.NaN).ok).toBe(true);

    expect(state).toEqual(before);
  });

  it('accumulates onto resources already in the inventory', () => {
    const state = withDrill(createInitialState(), firstDrill.id);
    state.resources[tierOneOre] = 10;

    advanceProduction(state, 1);

    expect(state.resources[tierOneOre]).toBeCloseTo(10 + firstDrill.baseOutput, 10);
  });
});

describe('event effects on production', () => {
  it('stops the drill a cave-in disabled', () => {
    const state = withDrill(createInitialState(), firstDrill.id);
    state.events.active = [
      { kind: 'caveIn', name: 'Cave-in', remainingSeconds: 10, totalSeconds: 10, drillIds: [firstDrill.id] },
    ];

    expect(extractionRatePerSecond(state)).toBe(0);
    expect(productionPerSecond(state)).toEqual({});
  });

  it('keeps the other drills running during a cave-in', () => {
    const state = withDrill(createInitialState(), firstDrill.id, 2);
    state.drills['drill-2'] = 1;
    state.events.active = [
      { kind: 'caveIn', name: 'Cave-in', remainingSeconds: 5, totalSeconds: 5, drillIds: ['drill-2'] },
    ];
    const second = getDrill('drill-2');

    expect(extractionRatePerSecond(state)).toBeCloseTo(firstDrill.baseOutput * 2, 10);
    expect(second.baseOutput).toBeGreaterThan(0);
  });

  it('multiplies output while a lucky vein is open', () => {
    const plain = withDrill(createInitialState(), firstDrill.id);
    const lucky = withDrill(createInitialState(), firstDrill.id);
    lucky.events.active = [
      { kind: 'luckyVein', name: 'Lucky vein', remainingSeconds: 8, totalSeconds: 8 },
    ];

    expect(extractionRatePerSecond(lucky)).toBeCloseTo(
      extractionRatePerSecond(plain) * config.events.luckyVein.productionMultiplier,
      10,
    );
  });
});

describe('late-game scale', () => {
  it('a large permanent multiplier applied to a real drill base does not collapse to Infinity', () => {
    const state = withDrill(createInitialState(), 'drill-5', 1000);
    state.depthTier = 5;
    state.prestige.multiplier = M.from('1e303');

    const rate = extractionRatePerSecond(state);

    expect(M.isFinite(rate)).toBe(false);
    expect(M.toString(rate)).not.toContain('Infinity');
  });

  it('advanceProduction banks a beyond-float amount without storing Infinity', () => {
    const state = withDrill(createInitialState(), 'drill-5', 1000);
    state.depthTier = 5;
    state.prestige.multiplier = M.from('1e303');

    advanceProduction(state, 1);

    const amounts = Object.values(state.resources);
    expect(amounts).toHaveLength(3);
    for (const amount of amounts) {
      expect(M.toString(amount)).not.toContain('Infinity');
    }
  });
});

describe('worker contributions to production', () => {
  function staffedMine(assignment, { speed = 0.5, luck = 0 } = {}) {
    const state = withDrill(createInitialState(), firstDrill.id);
    state.workers = [
      {
        id: 'worker-1',
        name: 'Ada Vale',
        speed,
        luck,
        level: 1,
        assignment: null,
      },
    ];
    if (assignment) {
      assignWorker(state, 'worker-1', assignment);
    }
    return state;
  }

  it('leaves extraction alone while every worker is idle', () => {
    const idle = staffedMine(null);
    const bare = withDrill(createInitialState(), firstDrill.id);

    expect(extractionRatePerSecond(idle)).toBeCloseTo(extractionRatePerSecond(bare), 10);
  });

  it('raises extraction when a worker is put on a drill', () => {
    const state = staffedMine({ kind: 'drill', id: firstDrill.id }, { speed: 0.5 });

    expect(extractionRatePerSecond(state)).toBeCloseTo(firstDrill.baseOutput * 1.5, 10);
  });

  it('raises only the assigned category when a worker is put on a resource', () => {
    const state = staffedMine({ kind: 'category', id: RESOURCE_CATEGORIES.GEMS }, { speed: 1 });
    const rates = productionPerSecond(state);
    const gems = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS);

    expect(rates[gems.id]).toBeCloseTo(firstDrill.baseOutput * gems.dropChance * 2, 10);
    expect(rates[tierOneOre]).toBeCloseTo(firstDrill.baseOutput, 10);
  });

  it('boosts ore throughput when a worker is put on ore', () => {
    const state = staffedMine({ kind: 'category', id: RESOURCE_CATEGORIES.ORE }, { speed: 1 });

    expect(productionPerSecond(state)[tierOneOre]).toBeCloseTo(firstDrill.baseOutput * 2, 10);
  });

  it('raises rare finds through luck without touching ore', () => {
    const plain = staffedMine({ kind: 'drill', id: firstDrill.id }, { luck: 0 });
    const lucky = staffedMine({ kind: 'drill', id: firstDrill.id }, { luck: 1 });
    const rare = resourceOfCategory(1, RESOURCE_CATEGORIES.RARE);

    expect(productionPerSecond(lucky)[rare.id]).toBeCloseTo(
      productionPerSecond(plain)[rare.id] * 2,
      10,
    );
    expect(productionPerSecond(lucky)[tierOneOre]).toBeCloseTo(
      productionPerSecond(plain)[tierOneOre],
      10,
    );
  });

  it('never finds more gems than it digs', () => {
    const state = staffedMine(
      { kind: 'category', id: RESOURCE_CATEGORIES.GEMS },
      { speed: 100, luck: 100 },
    );
    const gems = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS);

    expect(productionPerSecond(state)[gems.id]).toBeLessThanOrEqual(
      extractionRatePerSecond(state) + 1e-9,
    );
  });
});
