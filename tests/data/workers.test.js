import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';
import {
  ASSIGNMENT_KINDS,
  familyNames,
  givenNames,
  isAssignableCategory,
  workerNamePoolSize,
} from '../../src/data/workers.js';
import { RESOURCE_CATEGORIES } from '../../src/data/resources.js';

describe('worker name pools', () => {
  it('offers non-empty given and family name pools', () => {
    expect(givenNames.length).toBeGreaterThan(0);
    expect(familyNames.length).toBeGreaterThan(0);
  });

  it('contains unique, non-empty names in both pools', () => {
    for (const pool of [givenNames, familyNames]) {
      expect(new Set(pool).size).toBe(pool.length);
      for (const name of pool) {
        expect(typeof name).toBe('string');
        expect(name.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('yields enough distinct combinations to staff a full roster', () => {
    expect(workerNamePoolSize).toBeGreaterThan(config.workers.maxRoster * 4);
  });
});

describe('assignment targets', () => {
  it('names the two kinds of assignment the spec calls for', () => {
    expect(ASSIGNMENT_KINDS.DRILL).toBe('drill');
    expect(ASSIGNMENT_KINDS.CATEGORY).toBe('category');
  });

  it('accepts every resource category as an assignment target', () => {
    for (const category of Object.values(RESOURCE_CATEGORIES)) {
      expect(isAssignableCategory(category)).toBe(true);
    }
  });

  it('rejects anything that is not a resource category', () => {
    expect(isAssignableCategory('unobtainium')).toBe(false);
    expect(isAssignableCategory(null)).toBe(false);
    expect(isAssignableCategory(3)).toBe(false);
  });
});
