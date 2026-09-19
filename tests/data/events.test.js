import { describe, expect, it } from 'vitest';

import { config } from '../../src/data/config.js';
import { eventDefinitions, eventForTier, EVENT_KINDS, eventsForTier } from '../../src/data/events.js';

const tiers = Array.from({ length: config.depth.tierCount }, (_, index) => index + 1);
const definitions = Object.values(eventDefinitions);

describe('event definitions', () => {
  it('offers both the negative and positive event the spec calls for', () => {
    expect(Object.keys(eventDefinitions)).toHaveLength(2);
    expect(definitions.map((definition) => definition.kind)).toContain(EVENT_KINDS.CAVE_IN);
    expect(definitions.map((definition) => definition.kind)).toContain(EVENT_KINDS.LUCKY_VEIN);
  });

  it('keys every definition by its own stable id', () => {
    for (const [key, definition] of Object.entries(eventDefinitions)) {
      expect(key).toBe(definition.id);
    }
  });

  it('gives every event a name, a tone, and player-facing copy', () => {
    for (const definition of definitions) {
      expect(definition.name.length).toBeGreaterThan(0);
      expect(['good', 'warn']).toContain(definition.tone);
      expect(definition.announcement.length).toBeGreaterThan(0);
    }
  });

  it('tones the cave-in as a penalty and the lucky vein as a reward', () => {
    expect(eventDefinitions[EVENT_KINDS.CAVE_IN].tone).toBe('warn');
    expect(eventDefinitions[EVENT_KINDS.LUCKY_VEIN].tone).toBe('good');
  });

  it('weights every event for every configured depth tier', () => {
    for (const definition of definitions) {
      expect(definition.weightByTier).toHaveLength(config.depth.tierCount);
      for (const weight of definition.weightByTier) {
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it('makes cave-ins more likely as the shaft gets deeper', () => {
    const weights = eventDefinitions[EVENT_KINDS.CAVE_IN].weightByTier;

    for (let index = 1; index < weights.length; index += 1) {
      expect(weights[index]).toBeGreaterThanOrEqual(weights[index - 1]);
    }
    expect(weights.at(-1)).toBeGreaterThan(weights[0]);
  });

  it('pulls its durations and severity from the balance config', () => {
    const caveIn = eventDefinitions[EVENT_KINDS.CAVE_IN];
    const luckyVein = eventDefinitions[EVENT_KINDS.LUCKY_VEIN];

    expect(caveIn.minDurationSeconds).toBe(config.events.caveIn.minDurationSeconds);
    expect(caveIn.maxDurationSeconds).toBe(config.events.caveIn.maxDurationSeconds);
    expect(caveIn.drillsDisabled).toBe(config.events.caveIn.drillsDisabled);
    expect(luckyVein.productionMultiplier).toBe(config.events.luckyVein.productionMultiplier);
  });
});

describe('event lookup', () => {
  it('returns the definition for a kind', () => {
    expect(eventForTier(EVENT_KINDS.CAVE_IN, 1).id).toBe(EVENT_KINDS.CAVE_IN);
  });

  it('exposes the weight for that tier', () => {
    expect(eventForTier(EVENT_KINDS.CAVE_IN, 3).weight).toBe(
      eventDefinitions[EVENT_KINDS.CAVE_IN].weightByTier[2],
    );
  });

  it('clamps an out-of-range tier to the deepest configured tier', () => {
    expect(eventForTier(EVENT_KINDS.CAVE_IN, 99).weight).toBe(
      eventDefinitions[EVENT_KINDS.CAVE_IN].weightByTier.at(-1),
    );
  });

  it('returns null for an unknown kind', () => {
    expect(eventForTier('meteor', 1)).toBeNull();
  });

  it('lists every event with its weight for a tier', () => {
    const weighted = eventsForTier(1);

    expect(weighted).toHaveLength(definitions.length);
    for (const entry of weighted) {
      expect(entry.weight).toBeGreaterThan(0);
    }
  });

  it('keeps every weight usable across all tiers', () => {
    for (const tier of tiers) {
      for (const entry of eventsForTier(tier)) {
        expect(Number.isFinite(entry.weight)).toBe(true);
        expect(entry.weight).toBeGreaterThan(0);
      }
    }
  });
});
