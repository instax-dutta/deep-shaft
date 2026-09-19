/**
 * Achievement content.
 *
 * Conditions are declarative `{ stat, gte }` pairs rather than functions, so a condition is
 * data that can be validated (the stat must exist on a fresh save) and inspected without running
 * game code. `src/core/achievements.js` owns the evaluation.
 *
 * Achievements are career goals, not power: earning one grants nothing in this phase.
 */

export const achievements = Object.freeze([
  Object.freeze({
    id: 'firstOre',
    name: 'First Strike',
    description: 'Mine your first ore by hand.',
    stat: 'manualExtractions',
    gte: 1,
  }),
  Object.freeze({
    id: 'pocketMoney',
    name: 'Pocket Money',
    description: 'Earn 1,000 currency.',
    stat: 'totalEarned',
    gte: 1_000,
  }),
  Object.freeze({
    id: 'millionaire',
    name: 'Millionaire',
    description: 'Earn 1,000,000 currency in a single run.',
    stat: 'totalEarned',
    gte: 1_000_000,
  }),
  Object.freeze({
    id: 'firstHire',
    name: 'First Hire',
    description: 'Hire your first worker.',
    stat: 'workerCount',
    gte: 1,
  }),
  Object.freeze({
    id: 'fullCrew',
    name: 'Full Crew',
    description: 'Fill the crew roster.',
    stat: 'workerCount',
    gte: 8,
  }),
  Object.freeze({
    id: 'goingDeep',
    name: 'Going Deep',
    description: 'Reach depth tier 3.',
    stat: 'depthTier',
    gte: 3,
  }),
  Object.freeze({
    id: 'abyssal',
    name: 'Abyssal',
    description: 'Reach the deepest tier.',
    stat: 'depthTier',
    gte: 5,
  }),
  Object.freeze({
    id: 'firstRetirement',
    name: 'First Retirement',
    description: 'Retire a run with prestige.',
    stat: 'prestigeCount',
    gte: 1,
  }),
  Object.freeze({
    id: 'veteran',
    name: 'Veteran',
    description: 'Retire five runs.',
    stat: 'prestigeCount',
    gte: 5,
  }),
  Object.freeze({
    id: 'careerMiner',
    name: 'Career Miner',
    description: 'Earn 1B across your whole career.',
    stat: 'lifetimeEarned',
    gte: 1_000_000_000,
  }),
]);

export function getAchievement(id) {
  return achievements.find((achievement) => achievement.id === id) ?? null;
}
