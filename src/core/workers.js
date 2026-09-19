/**
 * Worker rules: hiring, assignment, training, and the bonuses they contribute.
 *
 * Workers are the management layer. A worker only matters while it is assigned: speed boosts the
 * specific drill or resource category it is put on, and luck boosts the tier's rare finds.
 * An idle worker contributes nothing, which is what makes assignment a real decision.
 */

import { config } from '../data/config.js';
import { getDrill } from '../data/drills.js';
import { M } from './numbers/magnitude.js';
import {
  ASSIGNMENT_KINDS,
  familyNames,
  givenNames,
  isAssignableCategory,
} from '../data/workers.js';

/** How many times name generation retries to avoid duplicating a name already on the roster. */
const NAME_ATTEMPTS = 20;

export function workersUnlocked(state) {
  return (state.stats?.totalEarned ?? 0) >= config.workers.unlockCurrency;
}

export function findWorker(state, workerId) {
  return (state.workers ?? []).find((worker) => worker.id === workerId) ?? null;
}

/** cost = baseHireCost * growthRate^rosterSize — a separate curve from drills. */
export function hireCost(state) {
  return M.mul(
    config.workers.baseHireCost,
    M.pow(config.workers.hireCostGrowthRate, state.workers.length),
  );
}

export function trainCost(worker) {
  return M.mul(
    config.workers.baseTrainCost,
    M.pow(config.workers.trainCostGrowthRate, worker.level - 1),
  );
}

export function canHireWorker(state) {
  if (!workersUnlocked(state)) {
    return { ok: false, reason: 'workers_locked' };
  }
  if (state.workers.length >= config.workers.maxRoster) {
    return { ok: false, reason: 'roster_full' };
  }

  const cost = hireCost(state);
  if (M.lt(state.currency, cost)) {
    return { ok: false, reason: 'insufficient_currency', cost };
  }
  return { ok: true, cost };
}

function nextWorkerId(state) {
  let highest = 0;
  for (const worker of state.workers) {
    const match = /^worker-(\d+)$/.exec(worker.id ?? '');
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `worker-${highest + 1}`;
}

/** Picks an index from a pool using the injected random source. */
function pickFrom(pool, random) {
  const roll = random();
  const index = Number.isFinite(roll)
    ? Math.min(pool.length - 1, Math.max(0, Math.floor(roll * pool.length)))
    : 0;
  return pool[index];
}

function pickName(state, random) {
  const taken = new Set(state.workers.map((worker) => worker.name));

  for (let attempt = 0; attempt < NAME_ATTEMPTS; attempt += 1) {
    const name = `${pickFrom(givenNames, random)} ${pickFrom(familyNames, random)}`;
    if (!taken.has(name)) {
      return name;
    }
  }

  // A full pool collision is not worth blocking a hire over.
  return `${pickFrom(givenNames, random)} ${pickFrom(familyNames, random)}`;
}

/** Hires a new level 1 worker with no assignment. */
export function hireWorker(state, { random = Math.random } = {}) {
  const check = canHireWorker(state);
  if (!check.ok) {
    return check;
  }

  const worker = {
    id: nextWorkerId(state),
    name: pickName(state, random),
    level: 1,
    speed: config.workers.baseSpeed,
    luck: config.workers.baseLuck,
    assignment: null,
  };

  state.currency = M.sub(state.currency, check.cost);
  state.workers.push(worker);

  return { ok: true, worker, cost: check.cost };
}

function isValidAssignment(assignment) {
  if (!assignment || typeof assignment !== 'object') {
    return false;
  }
  if (assignment.kind === ASSIGNMENT_KINDS.DRILL) {
    return Boolean(getDrill(assignment.id));
  }
  if (assignment.kind === ASSIGNMENT_KINDS.CATEGORY) {
    return isAssignableCategory(assignment.id);
  }
  return false;
}

/** Puts a worker on a drill or resource category, or clears its assignment with `null`. */
export function assignWorker(state, workerId, assignment) {
  const worker = findWorker(state, workerId);
  if (!worker) {
    return { ok: false, reason: 'unknown_worker' };
  }

  if (assignment === null || assignment === undefined) {
    worker.assignment = null;
    return { ok: true, workerId, assignment: null };
  }

  if (!isValidAssignment(assignment)) {
    return { ok: false, reason: 'invalid_target' };
  }

  worker.assignment = { kind: assignment.kind, id: assignment.id };
  return { ok: true, workerId, assignment: worker.assignment };
}

/** Trains a worker one level, raising both stats. */
export function trainWorker(state, workerId) {
  const worker = findWorker(state, workerId);
  if (!worker) {
    return { ok: false, reason: 'unknown_worker' };
  }
  if (worker.level >= config.workers.maxLevel) {
    return { ok: false, reason: 'max_level' };
  }

  const cost = trainCost(worker);
  if (M.lt(state.currency, cost)) {
    return { ok: false, reason: 'insufficient_currency', cost };
  }

  state.currency = M.sub(state.currency, cost);
  worker.level += 1;
  worker.speed += config.workers.speedBonusPerLevel;
  worker.luck += config.workers.luckBonusPerLevel;

  return { ok: true, workerId, level: worker.level, cost };
}

/**
 * Total bonuses from every assigned worker.
 *
 * - `drillSpeed` — fractional output bonus per drill id
 * - `categorySpeed` — fractional rate bonus per resource category
 * - `workerLuck` — tier-wide luck from every assigned worker
 */
export function workerEffects(state) {
  const drillSpeed = {};
  const categorySpeed = {};
  let workerLuck = 0;

  for (const worker of state.workers ?? []) {
    if (!worker.assignment) {
      continue;
    }

    const speed = Number.isFinite(worker.speed) ? worker.speed : 0;
    const luck = Number.isFinite(worker.luck) ? worker.luck : 0;
    workerLuck += luck;

    if (worker.assignment.kind === ASSIGNMENT_KINDS.DRILL) {
      drillSpeed[worker.assignment.id] = (drillSpeed[worker.assignment.id] ?? 0) + speed;
    } else if (worker.assignment.kind === ASSIGNMENT_KINDS.CATEGORY) {
      categorySpeed[worker.assignment.id] = (categorySpeed[worker.assignment.id] ?? 0) + speed;
    }
  }

  return { drillSpeed, categorySpeed, workerLuck };
}

function toNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Rebuilds one worker record from a persisted save.
 *
 * Returns `null` for a record with no usable id so the roster can drop it rather than carrying
 * a nameless worker the player cannot act on.
 */
export function normalizeWorker(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }
  if (typeof candidate.id !== 'string' || candidate.id.length === 0) {
    return null;
  }

  const level = toNumber(candidate.level, 1);
  const assignment = isValidAssignment(candidate.assignment) ? candidate.assignment : null;

  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' && candidate.name.trim().length > 0
      ? candidate.name
      : 'Unnamed miner',
    level: Math.min(Math.max(1, Math.floor(level)), config.workers.maxLevel),
    speed: toNumber(candidate.speed, config.workers.baseSpeed),
    luck: toNumber(candidate.luck, config.workers.baseLuck),
    assignment: assignment ? { kind: assignment.kind, id: assignment.id } : null,
  };
}
