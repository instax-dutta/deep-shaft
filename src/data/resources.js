/**
 * Resource content definitions.
 *
 * Every depth tier exposes the three branching categories from the spec: ore (common, flat
 * value), gems (rarer, depth-scaled value), and rare minerals (rarest, steepest value).
 * Names and drop chances are tuning content; unit values derive from `config.economy` so the
 * value curve is retuned in exactly one place.
 */

import { config } from './config.js';

export const RESOURCE_CATEGORIES = Object.freeze({
  ORE: 'ore',
  GEMS: 'gems',
  RARE: 'rare',
});

/**
 * Content table for the five v1 depth tiers. `dropChance` is the chance that one extraction
 * yields any of that resource. Ore is always produced; gems and rare minerals are the
 * depth-scaled jackpots.
 */
const TIER_CONTENT = [
  {
    tier: 1,
    ore: { name: 'Coal' },
    gems: { name: 'Quartz', dropChance: 0.12 },
    rare: { name: 'Amber', dropChance: 0.01 },
  },
  {
    tier: 2,
    ore: { name: 'Copper' },
    gems: { name: 'Amethyst', dropChance: 0.14 },
    rare: { name: 'Silver', dropChance: 0.02 },
  },
  {
    tier: 3,
    ore: { name: 'Granite' },
    gems: { name: 'Topaz', dropChance: 0.16 },
    rare: { name: 'Gold', dropChance: 0.03 },
  },
  {
    tier: 4,
    ore: { name: 'Iron' },
    gems: { name: 'Emerald', dropChance: 0.18 },
    rare: { name: 'Platinum', dropChance: 0.04 },
  },
  {
    tier: 5,
    ore: { name: 'Obsidian' },
    gems: { name: 'Diamond', dropChance: 0.2 },
    rare: { name: 'Void Crystal', dropChance: 0.05 },
  },
];

export function resourceId(tier, category) {
  return `tier${tier}-${category}`;
}

function createResourceDefinitions() {
  const definitions = {};

  for (const row of TIER_CONTENT) {
    for (const [category, entry] of Object.entries(row)) {
      if (category === 'tier') {
        continue;
      }

      const id = resourceId(row.tier, category);
      const baseValue = config.economy.resourceBaseValue[category];
      const growth = config.economy.resourceValueGrowthPerTier[category];

      definitions[id] = Object.freeze({
        id,
        name: entry.name,
        category,
        depthTier: row.tier,
        baseUnitValue: baseValue * growth ** (row.tier - 1),
        dropChance: entry.dropChance ?? 1,
      });
    }
  }

  return Object.freeze(definitions);
}

/** Frozen map of resource id to definition. */
export const resources = createResourceDefinitions();

export function getResource(id) {
  return Object.prototype.hasOwnProperty.call(resources, id) ? resources[id] : null;
}

/** All resources belonging to one depth tier, in category insertion order. */
export function resourcesForTier(tier) {
  return Object.values(resources).filter((definition) => definition.depthTier === tier);
}

/** The single resource of a category at a tier, or `null` when the tier has none. */
export function resourceOfCategory(tier, category) {
  return getResource(resourceId(tier, category));
}
