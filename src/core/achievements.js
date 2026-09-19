/**
 * Achievement evaluation.
 *
 * A pure function of a flat stats snapshot. Definitions are data (`{ stat, gte }`), so this
 * module has no per-achievement branches: adding an achievement means adding a row, not code.
 *
 * Evaluation is idempotent — an already-earned achievement is never announced twice — and it only
 * ever adds to `state.achievements`, which the prestige reset must not clear.
 */

import { achievements, getAchievement } from '../data/achievements.js';
import { M } from './numbers/magnitude.js';

/**
 * The flat stat surface achievement conditions read from.
 *
 * Every key here is a valid `stat` target, and the data-integrity test asserts no achievement
 * names a stat outside this snapshot.
 */
export function statsSnapshot(state) {
  const totalDrills = Object.values(state.drills ?? {}).reduce(
    (sum, count) => sum + (Number.isFinite(count) && count > 0 ? count : 0),
    0,
  );

  return {
    manualExtractions: state.stats?.manualExtractions ?? 0,
    totalEarned: state.stats?.totalEarned ?? 0,
    lifetimeEarned: state.prestige?.lifetimeEarned ?? 0,
    prestigeCount: state.prestige?.count ?? 0,
    depthTier: state.depthTier ?? 1,
    currency: state.currency ?? 0,
    totalDrills,
    workerCount: (state.workers ?? []).length,
  };
}

export function earnedAchievements(state) {
  return achievements.filter((achievement) => state?.achievements?.earned?.[achievement.id] === true);
}

/**
 * Awards every achievement whose condition is now met.
 *
 * Idempotent: re-running on an unchanged mine returns an empty `newlyEarned` list. `nowMs` is
 * injected so `firstEarnedAt` is deterministic under test.
 */
export function evaluateAchievements(state, { nowMs = 0 } = {}) {
  const snapshot = statsSnapshot(state);
  const newlyEarned = [];

  for (const achievement of achievements) {
    if (state.achievements.earned[achievement.id] === true) {
      continue;
    }

    const current = snapshot[achievement.stat] ?? 0;
    if (M.gte(current, achievement.gte)) {
      state.achievements.earned[achievement.id] = true;
      state.achievements.firstEarnedAt[achievement.id] = nowMs;
      newlyEarned.push({ id: achievement.id, name: achievement.name });
    }
  }

  return { ok: true, newlyEarned };
}

/** Current progress toward one achievement, with the ratio clamped to 0..1. */
export function achievementProgress(state, id) {
  const achievement = getAchievement(id);
  if (!achievement) {
    return null;
  }

  const current = statsSnapshot(state)[achievement.stat] ?? 0;
  const target = achievement.gte;
  const ratio = M.toNumber(M.max(0, M.min(1, M.div(current, target))));

  return { current, target, ratio };
}
