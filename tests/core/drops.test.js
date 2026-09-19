import { describe, expect, it } from 'vitest';

import {
  dropChancesFor,
  expectedYieldsPerSecond,
  luckMultiplier,
  rollExtraction,
  yieldFactorsFor,
} from '../../src/core/drops.js';
import { createInitialState } from '../../src/core/state.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE);
const tierOneGems = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS);
const tierOneRare = resourceOfCategory(1, RESOURCE_CATEGORIES.RARE);

/** Returns the supplied values in order, then always misses. */
function sequenceRandom(values) {
  let index = 0;
  return () => (index < values.length ? values[index++] : 1);
}

const alwaysMiss = () => 0.999_999;
const alwaysHit = () => 0;

describe('luckMultiplier', () => {
  it('leaves drop chances alone with no luck', () => {
    expect(luckMultiplier(0)).toBe(1);
  });

  it('adds luck as a fraction of the base chance', () => {
    expect(luckMultiplier(0.25)).toBeCloseTo(1.25, 10);
  });

  it('ignores negative and non-numeric luck', () => {
    expect(luckMultiplier(-5)).toBe(1);
    expect(luckMultiplier(Number.NaN)).toBe(1);
    expect(luckMultiplier(undefined)).toBe(1);
  });
});

describe('dropChancesFor', () => {
  it('offers every category of the active tier', () => {
    const chances = dropChancesFor(createInitialState());

    expect(Object.keys(chances)).toEqual([
      tierOneOre.id,
      tierOneGems.id,
      tierOneRare.id,
    ]);
  });

  it('reports the configured chance for each category', () => {
    const chances = dropChancesFor(createInitialState());

    expect(chances[tierOneOre.id]).toBe(tierOneOre.dropChance);
    expect(chances[tierOneGems.id]).toBe(tierOneGems.dropChance);
    expect(chances[tierOneRare.id]).toBe(tierOneRare.dropChance);
  });

  it('raises the rarer categories with luck but never past certainty', () => {
    const chances = dropChancesFor(createInitialState(), { workerLuck: 100 });

    expect(chances[tierOneGems.id]).toBe(1);
    expect(chances[tierOneRare.id]).toBe(1);
  });

  it('follows the mine to a deeper tier', () => {
    const state = createInitialState();
    state.depthTier = 3;

    expect(dropChancesFor(state)).toHaveProperty(
      resourceOfCategory(3, RESOURCE_CATEGORIES.GEMS).id,
    );
  });

  it('offers nothing for a tier that does not exist', () => {
    const state = createInitialState();
    state.depthTier = 99;

    expect(dropChancesFor(state)).toEqual({});
  });
});

describe('rollExtraction', () => {
  it('yields only ore when every chance roll misses', () => {
    const yields = rollExtraction(createInitialState(), 5, { random: alwaysMiss });

    expect(yields).toEqual({ [tierOneOre.id]: 5 });
  });

  it('yields a gem and a rare mineral for every extraction when every roll hits', () => {
    const yields = rollExtraction(createInitialState(), 5, { random: alwaysHit });

    expect(yields).toEqual({
      [tierOneOre.id]: 5,
      [tierOneGems.id]: 5,
      [tierOneRare.id]: 5,
    });
  });

  it('never yields more of a category than there were extractions', () => {
    const yields = rollExtraction(createInitialState(), 3, { random: alwaysHit });

    expect(yields[tierOneGems.id]).toBe(3);
    expect(yields[tierOneRare.id]).toBe(3);
  });

  it('rolls gems and rare minerals independently', () => {
    // Gem roll lands inside its chance, the rare roll lands outside it.
    const random = sequenceRandom([0.05, 0.5]);

    const yields = rollExtraction(createInitialState(), 1, { random });

    expect(yields[tierOneGems.id]).toBe(1);
    expect(yields[tierOneRare.id]).toBeUndefined();
  });

  it('counts only the extractions whose roll lands inside the chance', () => {
    // Four gem rolls: 0.05 hit, 0.20 miss, 0.11 hit, 0.30 miss.
    const gemRolls = [0.05, 0.2, 0.11, 0.3];

    const yields = rollExtraction(createInitialState(), 4, {
      random: sequenceRandom(gemRolls),
    });

    expect(yields[tierOneGems.id]).toBe(2);
  });

  it('finds more with luck than without it', () => {
    // 0.20 misses the base 0.12 gem chance but lands inside it once luck raises it.
    const withoutLuck = rollExtraction(createInitialState(), 1, {
      random: sequenceRandom([0.2]),
    });
    const withLuck = rollExtraction(createInitialState(), 1, {
      random: sequenceRandom([0.2]),
      workerLuck: 1,
    });

    expect(withoutLuck[tierOneGems.id]).toBeUndefined();
    expect(withLuck[tierOneGems.id]).toBe(1);
  });

  it('yields nothing for zero, negative, or non-finite extractions', () => {
    expect(rollExtraction(createInitialState(), 0, { random: alwaysHit })).toEqual({});
    expect(rollExtraction(createInitialState(), -3, { random: alwaysHit })).toEqual({});
    expect(rollExtraction(createInitialState(), Number.NaN, { random: alwaysHit })).toEqual({});
  });

  it('treats a broken random source as a miss rather than a jackpot', () => {
    const yields = rollExtraction(createInitialState(), 2, { random: () => Number.NaN });

    expect(yields).toEqual({ [tierOneOre.id]: 2 });
  });

  it('yields nothing for a tier that does not exist', () => {
    const state = createInitialState();
    state.depthTier = 99;

    expect(rollExtraction(state, 5, { random: alwaysHit })).toEqual({});
  });

  it('guarantees the rare category for one extraction at the boundary chance', () => {
    // A roll of exactly 0 must land inside a chance strictly greater than 0.
    const yields = rollExtraction(createInitialState(), 1, { random: () => 0 });

    expect(yields[tierOneRare.id]).toBe(1);
  });
});

describe('yieldFactorsFor', () => {
  it('returns the plain drop chance for every resource with no workers', () => {
    const factors = yieldFactorsFor(createInitialState());

    expect(factors[tierOneOre.id]).toBeCloseTo(tierOneOre.dropChance, 10);
    expect(factors[tierOneGems.id]).toBeCloseTo(tierOneGems.dropChance, 10);
    expect(factors[tierOneRare.id]).toBeCloseTo(tierOneRare.dropChance, 10);
  });

  it('scales gems and rare minerals with luck', () => {
    const factors = yieldFactorsFor(createInitialState(), { workerLuck: 1 });

    expect(factors[tierOneGems.id]).toBeCloseTo(tierOneGems.dropChance * 2, 10);
    expect(factors[tierOneOre.id]).toBeCloseTo(tierOneOre.dropChance, 10);
  });

  it('scales a category with the workers assigned to it', () => {
    const factors = yieldFactorsFor(createInitialState(), {
      categorySpeed: { gems: 1 },
    });

    expect(factors[tierOneGems.id]).toBeCloseTo(tierOneGems.dropChance * 2, 10);
    expect(factors[tierOneRare.id]).toBeCloseTo(tierOneRare.dropChance, 10);
  });

  it('raises ore above one unit per extraction when workers dig ore', () => {
    const factors = yieldFactorsFor(createInitialState(), {
      categorySpeed: { ore: 1 },
    });

    expect(factors[tierOneOre.id]).toBeCloseTo(2, 10);
  });

  it('never lets a gem factor exceed one find per extraction', () => {
    const factors = yieldFactorsFor(createInitialState(), {
      workerLuck: 100,
      categorySpeed: { gems: 100, rare: 100 },
    });

    expect(factors[tierOneGems.id]).toBe(1);
    expect(factors[tierOneRare.id]).toBe(1);
  });

  it('returns nothing for a tier that does not exist', () => {
    const state = createInitialState();
    state.depthTier = 99;

    expect(yieldFactorsFor(state)).toEqual({});
  });
});

describe('expectedYieldsPerSecond', () => {
  it('scales gems and rare minerals by their drop chance', () => {
    const yields = expectedYieldsPerSecond(createInitialState(), 10);

    expect(yields[tierOneOre.id]).toBeCloseTo(10, 10);
    expect(yields[tierOneGems.id]).toBeCloseTo(10 * tierOneGems.dropChance, 10);
    expect(yields[tierOneRare.id]).toBeCloseTo(10 * tierOneRare.dropChance, 10);
  });

  it('raises the expected finds with luck', () => {
    const plain = expectedYieldsPerSecond(createInitialState(), 10);
    const lucky = expectedYieldsPerSecond(createInitialState(), 10, { workerLuck: 1 });

    expect(lucky[tierOneGems.id]).toBeCloseTo(plain[tierOneGems.id] * 2, 10);
  });

  it('raises expected ore with workers assigned to ore', () => {
    const yields = expectedYieldsPerSecond(createInitialState(), 10, {
      categorySpeed: { ore: 1 },
    });

    expect(yields[tierOneOre.id]).toBeCloseTo(20, 10);
  });

  it('returns nothing for a non-positive extraction rate', () => {
    expect(expectedYieldsPerSecond(createInitialState(), 0)).toEqual({});
    expect(expectedYieldsPerSecond(createInitialState(), -1)).toEqual({});
    expect(expectedYieldsPerSecond(createInitialState(), Number.NaN)).toEqual({});
  });
});
