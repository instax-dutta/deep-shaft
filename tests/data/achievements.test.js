import { describe, expect, it } from 'vitest';

import { statsSnapshot } from '../../src/core/achievements.js';
import { createInitialState } from '../../src/core/state.js';
import { achievements } from '../../src/data/achievements.js';

describe('achievement definitions', () => {
  it('achievement ids are unique', () => {
    const ids = achievements.map((achievement) => achievement.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every achievement has a name, description, and a valid declarative condition targeting a real stat', () => {
    const stats = statsSnapshot(createInitialState());

    for (const achievement of achievements) {
      expect(typeof achievement.name).toBe('string');
      expect(achievement.name.length).toBeGreaterThan(0);
      expect(typeof achievement.description).toBe('string');
      expect(achievement.description.length).toBeGreaterThan(0);
      expect(Object.prototype.hasOwnProperty.call(stats, achievement.stat)).toBe(true);
      expect(achievement.gte).toBeGreaterThan(0);
    }
  });

  it('no achievement targets a stat that does not exist on a fresh save', () => {
    const stats = statsSnapshot(createInitialState());

    const missing = achievements
      .map((achievement) => achievement.stat)
      .filter((stat) => !Object.prototype.hasOwnProperty.call(stats, stat));

    expect(missing).toEqual([]);
  });
});
