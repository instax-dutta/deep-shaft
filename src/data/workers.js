/**
 * Worker content definitions.
 *
 * Workers are the only named, individual part of the economy: each has a face, a name, and
 * stats the player manages. Names are drawn from these pools rather than hand-authored per
 * worker, so the pool is content and the generation rule stays in `src/core/workers.js`.
 */

import { RESOURCE_CATEGORIES } from './resources.js';

/** A worker can be put on a specific drill, or on a whole resource category. */
export const ASSIGNMENT_KINDS = Object.freeze({
  DRILL: 'drill',
  CATEGORY: 'category',
});

export const givenNames = Object.freeze([
  'Ada', 'Bo', 'Cleo', 'Dax', 'Ember', 'Flint', 'Gus', 'Hana', 'Ike', 'June',
  'Kai', 'Lena', 'Miro', 'Nia', 'Otto', 'Petra', 'Quin', 'Rosa', 'Silas', 'Tov',
]);

export const familyNames = Object.freeze([
  'Vale', 'Holt', 'Marsh', 'Ridge', 'Stone', 'Ashby', 'Brandt', 'Cragg', 'Dunne', 'Fenwick',
  'Gale', 'Hare', 'Irons', 'Kemp', 'Lode', 'Mire', 'Norr', 'Opal', 'Pyke', 'Quarry',
]);

/** Distinct names the pools can produce. */
export const workerNamePoolSize = givenNames.length * familyNames.length;

export function isAssignableCategory(value) {
  return Object.values(RESOURCE_CATEGORIES).includes(value);
}

/** Human-readable labels for the category assignment options. */
export const CATEGORY_LABELS = Object.freeze({
  [RESOURCE_CATEGORIES.ORE]: 'Ore',
  [RESOURCE_CATEGORIES.GEMS]: 'Gems',
  [RESOURCE_CATEGORIES.RARE]: 'Rare minerals',
});
