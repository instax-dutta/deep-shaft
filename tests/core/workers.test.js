import { describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import {
  assignWorker,
  canHireWorker,
  findWorker,
  hireCost,
  hireWorker,
  trainCost,
  trainWorker,
  workerEffects,
  workersUnlocked,
} from '../../src/core/workers.js';
import { config } from '../../src/data/config.js';
import { getDrill } from '../../src/data/drills.js';
import { familyNames, givenNames } from '../../src/data/workers.js';
import { RESOURCE_CATEGORIES } from '../../src/data/resources.js';

const firstDrill = getDrill('drill-1');

/** Deterministic random source: returns the queued values, then zero. */
function sequenceRandom(values) {
  let index = 0;
  return () => (index < values.length ? values[index++] : 0);
}

/** A mine that has passed the worker milestone with plenty of currency. */
function staffedMine({ workers = 0, currency = 100_000 } = {}) {
  const state = createInitialState();
  state.currency = currency;
  state.stats.totalEarned = config.workers.unlockCurrency;
  for (let index = 0; index < workers; index += 1) {
    hireWorker(state, { random: sequenceRandom([index / givenNames.length, 0]) });
  }
  return state;
}

describe('workersUnlocked', () => {
  it('stays locked until the milestone is earned', () => {
    const state = createInitialState();
    state.stats.totalEarned = config.workers.unlockCurrency - 1;

    expect(workersUnlocked(state)).toBe(false);
  });

  it('unlocks once lifetime earnings reach the milestone', () => {
    const state = createInitialState();
    state.stats.totalEarned = config.workers.unlockCurrency;

    expect(workersUnlocked(state)).toBe(true);
  });

  it('stays unlocked after the currency has been spent', () => {
    const state = staffedMine();
    state.currency = 0;

    expect(workersUnlocked(state)).toBe(true);
  });
});

describe('hireCost', () => {
  it('charges the base cost for the first worker', () => {
    expect(hireCost(createInitialState())).toBe(config.workers.baseHireCost);
  });

  it('grows with every worker already on the roster', () => {
    const state = staffedMine({ workers: 3 });

    expect(hireCost(state)).toBeCloseTo(
      config.workers.baseHireCost * config.workers.hireCostGrowthRate ** 3,
      6,
    );
  });
});

describe('hireWorker', () => {
  it('refuses to hire before the milestone is reached', () => {
    const state = createInitialState();
    state.currency = 100_000;
    const before = structuredClone(state);

    expect(hireWorker(state, { random: () => 0 })).toEqual({
      ok: false,
      reason: 'workers_locked',
    });
    expect(state).toEqual(before);
  });

  it('refuses to hire without enough currency, leaving state untouched', () => {
    const state = staffedMine({ currency: 10 });
    const before = structuredClone(state);

    expect(hireWorker(state, { random: () => 0 })).toEqual({
      ok: false,
      reason: 'insufficient_currency',
      cost: config.workers.baseHireCost,
    });
    expect(state).toEqual(before);
  });

  it('adds a level 1 worker with no assignment', () => {
    const state = staffedMine();

    const result = hireWorker(state, { random: () => 0 });

    expect(result.ok).toBe(true);
    expect(state.workers).toHaveLength(1);
    const worker = state.workers[0];
    expect(worker.level).toBe(1);
    expect(worker.assignment).toBeNull();
    expect(worker.speed).toBeCloseTo(config.workers.baseSpeed, 10);
    expect(worker.luck).toBeCloseTo(config.workers.baseLuck, 10);
  });

  it('charges the hire cost', () => {
    const state = staffedMine();
    const cost = hireCost(state);

    hireWorker(state, { random: () => 0 });

    expect(state.currency).toBeCloseTo(100_000 - cost, 6);
  });

  it('gives every worker a unique id', () => {
    const state = staffedMine({ workers: 3 });

    const ids = state.workers.map((worker) => worker.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws the name from the configured pools', () => {
    const state = staffedMine();

    hireWorker(state, { random: () => 0 });

    const [given, family] = state.workers[0].name.split(' ');
    expect(givenNames).toContain(given);
    expect(familyNames).toContain(family);
  });

  it('draws a different name for the next worker', () => {
    const state = staffedMine();
    const random = sequenceRandom([0, 0, 0.5, 0.5]);

    hireWorker(state, { random });
    hireWorker(state, { random });

    const names = state.workers.map((worker) => worker.name);
    expect(new Set(names).size).toBe(2);
  });

  it('refuses once the roster is full', () => {
    const state = staffedMine({ workers: config.workers.maxRoster });

    expect(hireWorker(state, { random: () => 0 })).toEqual({
      ok: false,
      reason: 'roster_full',
    });
    expect(state.workers).toHaveLength(config.workers.maxRoster);
  });
});

describe('trainCost', () => {
  it('charges the base cost at level 1', () => {
    expect(trainCost({ level: 1 })).toBe(config.workers.baseTrainCost);
  });

  it('grows with the worker level', () => {
    expect(trainCost({ level: 4 })).toBeCloseTo(
      config.workers.baseTrainCost * config.workers.trainCostGrowthRate ** 3,
      6,
    );
  });
});

describe('trainWorker', () => {
  it('raises the level and both stats', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];

    const result = trainWorker(state, worker.id);

    expect(result.ok).toBe(true);
    expect(worker.level).toBe(2);
    expect(worker.speed).toBeCloseTo(config.workers.baseSpeed + config.workers.speedBonusPerLevel, 10);
    expect(worker.luck).toBeCloseTo(config.workers.baseLuck + config.workers.luckBonusPerLevel, 10);
  });

  it('charges the training cost', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    const cost = trainCost(worker);
    const purse = state.currency;

    trainWorker(state, worker.id);

    expect(state.currency).toBeCloseTo(purse - cost, 6);
  });

  it('refuses to train an unknown worker', () => {
    const state = staffedMine({ workers: 1 });

    expect(trainWorker(state, 'worker-999')).toEqual({
      ok: false,
      reason: 'unknown_worker',
    });
  });

  it('refuses to train past the level cap', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    worker.level = config.workers.maxLevel;

    expect(trainWorker(state, worker.id)).toEqual({
      ok: false,
      reason: 'max_level',
    });
  });

  it('refuses without enough currency, leaving the worker untouched', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    state.currency = 0;
    const before = structuredClone(worker);

    expect(trainWorker(state, worker.id).reason).toBe('insufficient_currency');
    expect(worker).toEqual(before);
  });
});

describe('assignWorker', () => {
  it('assigns a worker to a drill', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];

    const result = assignWorker(state, worker.id, { kind: 'drill', id: firstDrill.id });

    expect(result.ok).toBe(true);
    expect(worker.assignment).toEqual({ kind: 'drill', id: firstDrill.id });
  });

  it('assigns a worker to a resource category', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];

    assignWorker(state, worker.id, { kind: 'category', id: RESOURCE_CATEGORIES.GEMS });

    expect(worker.assignment).toEqual({ kind: 'category', id: RESOURCE_CATEGORIES.GEMS });
  });

  it('clears the assignment when given no target', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    assignWorker(state, worker.id, { kind: 'drill', id: firstDrill.id });

    const result = assignWorker(state, worker.id, null);

    expect(result.ok).toBe(true);
    expect(worker.assignment).toBeNull();
  });

  it('refuses an unknown drill', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];

    expect(assignWorker(state, worker.id, { kind: 'drill', id: 'drill-99' })).toEqual({
      ok: false,
      reason: 'invalid_target',
    });
    expect(worker.assignment).toBeNull();
  });

  it('refuses an unknown resource category', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];

    expect(assignWorker(state, worker.id, { kind: 'category', id: 'unobtainium' }).reason)
      .toBe('invalid_target');
  });

  it('refuses an unknown worker', () => {
    const state = staffedMine({ workers: 1 });

    expect(assignWorker(state, 'worker-999', null).reason).toBe('unknown_worker');
  });
});

describe('workerEffects', () => {
  it('contributes nothing while every worker is idle', () => {
    const state = staffedMine({ workers: 2 });

    const effects = workerEffects(state);

    expect(effects.drillSpeed).toEqual({});
    expect(effects.categorySpeed).toEqual({});
    expect(effects.workerLuck).toBe(0);
  });

  it('routes drill assignment speed to that drill only', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    worker.speed = 0.5;
    assignWorker(state, worker.id, { kind: 'drill', id: firstDrill.id });

    const effects = workerEffects(state);

    expect(effects.drillSpeed[firstDrill.id]).toBeCloseTo(0.5, 10);
    expect(effects.drillSpeed['drill-2']).toBeUndefined();
  });

  it('routes category assignment speed to that category only', () => {
    const state = staffedMine({ workers: 1 });
    const worker = state.workers[0];
    worker.speed = 0.25;
    assignWorker(state, worker.id, { kind: 'category', id: RESOURCE_CATEGORIES.ORE });

    const effects = workerEffects(state);

    expect(effects.categorySpeed[RESOURCE_CATEGORIES.ORE]).toBeCloseTo(0.25, 10);
    expect(effects.categorySpeed[RESOURCE_CATEGORIES.GEMS]).toBeUndefined();
  });

  it('sums the luck of every assigned worker', () => {
    const state = staffedMine({ workers: 2 });
    const [first, second] = state.workers;
    first.luck = 0.1;
    second.luck = 0.05;
    assignWorker(state, first.id, { kind: 'category', id: RESOURCE_CATEGORIES.RARE });
    assignWorker(state, second.id, { kind: 'drill', id: firstDrill.id });

    expect(workerEffects(state).workerLuck).toBeCloseTo(0.15, 10);
  });

  it('ignores unassigned workers entirely', () => {
    const state = staffedMine({ workers: 2 });
    const [assigned, idle] = state.workers;
    assigned.speed = 0.4;
    idle.speed = 0.9;
    idle.luck = 0.9;
    assignWorker(state, assigned.id, { kind: 'drill', id: firstDrill.id });

    const effects = workerEffects(state);

    expect(effects.drillSpeed[firstDrill.id]).toBeCloseTo(0.4, 10);
    expect(effects.workerLuck).toBeCloseTo(assigned.luck, 10);
  });
});

describe('findWorker', () => {
  it('finds a worker on the roster', () => {
    const state = staffedMine({ workers: 1 });

    expect(findWorker(state, state.workers[0].id)).toBe(state.workers[0]);
  });

  it('returns null for an unknown id', () => {
    expect(findWorker(createInitialState(), 'worker-1')).toBeNull();
  });
});

describe('canHireWorker', () => {
  it('reports the cost when hiring is possible', () => {
    const state = staffedMine();

    expect(canHireWorker(state)).toEqual({ ok: true, cost: config.workers.baseHireCost });
  });

  it('reports the lock while workers are not yet available', () => {
    const state = createInitialState();
    state.currency = 100_000;

    expect(canHireWorker(state).reason).toBe('workers_locked');
  });
});
