import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';
import {
  RESOURCE_CATEGORIES,
  resourceOfCategory,
  resources,
  resourcesForTier,
} from '../../src/data/resources.js';

const tiers = Array.from({ length: config.depth.tierCount }, (_, index) => index + 1);

describe('resource definitions', () => {
  it('keys every definition by its own stable id', () => {
    for (const [key, definition] of Object.entries(resources)) {
      expect(definition.id).toBe(key);
    }
  });

  it('gives every resource a non-empty display name', () => {
    for (const definition of Object.values(resources)) {
      expect(definition.name.length).toBeGreaterThan(0);
    }
  });

  it('exposes ore, gems, and rare minerals at every depth tier', () => {
    for (const tier of tiers) {
      const categories = resourcesForTier(tier).map((definition) => definition.category);

      expect(categories).toContain(RESOURCE_CATEGORIES.ORE);
      expect(categories).toContain(RESOURCE_CATEGORIES.GEMS);
      expect(categories).toContain(RESOURCE_CATEGORIES.RARE);
    }
  });

  it('assigns each definition to its own configured tier', () => {
    for (const tier of tiers) {
      for (const definition of resourcesForTier(tier)) {
        expect(definition.depthTier).toBe(tier);
      }
    }
  });

  it('uses positive base unit values', () => {
    for (const definition of Object.values(resources)) {
      expect(definition.baseUnitValue).toBeGreaterThan(0);
    }
  });

  it('keeps drop chances inside the 0..1 probability range', () => {
    for (const definition of Object.values(resources)) {
      expect(definition.dropChance).toBeGreaterThan(0);
      expect(definition.dropChance).toBeLessThanOrEqual(1);
    }
  });

  it('makes rarer categories worth more than common ones at the same tier', () => {
    for (const tier of tiers) {
      const ore = resourceOfCategory(tier, RESOURCE_CATEGORIES.ORE);
      const gems = resourceOfCategory(tier, RESOURCE_CATEGORIES.GEMS);
      const rare = resourceOfCategory(tier, RESOURCE_CATEGORIES.RARE);

      expect(gems.baseUnitValue).toBeGreaterThan(ore.baseUnitValue);
      expect(rare.baseUnitValue).toBeGreaterThan(gems.baseUnitValue);
    }
  });

  it('makes rare minerals harder to find than gems at the same tier', () => {
    for (const tier of tiers) {
      const gems = resourceOfCategory(tier, RESOURCE_CATEGORIES.GEMS);
      const rare = resourceOfCategory(tier, RESOURCE_CATEGORIES.RARE);

      expect(rare.dropChance).toBeLessThan(gems.dropChance);
    }
  });

  it('returns null for an unknown tier or category', () => {
    expect(resourceOfCategory(99, RESOURCE_CATEGORIES.ORE)).toBeNull();
    expect(resourceOfCategory(1, 'unobtainium')).toBeNull();
  });
});
