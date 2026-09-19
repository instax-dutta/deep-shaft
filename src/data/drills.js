/**
 * Drill content definitions.
 *
 * Drills are the generic, identity-free pre-worker economy: each tier costs more and produces
 * more than the last. A drill tier becomes purchasable once the mine has reached a matching
 * depth tier, and every owned drill feeds the current tier's ore production.
 */

const DRILL_CONTENT = [
  { tier: 1, name: 'Hand Drill', baseCost: 15, baseOutput: 0.5 },
  { tier: 2, name: 'Scraper', baseCost: 200, baseOutput: 2 },
  { tier: 3, name: 'Rotary Rig', baseCost: 2_500, baseOutput: 8 },
  { tier: 4, name: 'Borer', baseCost: 30_000, baseOutput: 30 },
  { tier: 5, name: 'Core Extractor', baseCost: 400_000, baseOutput: 120 },
];

export function drillId(tier) {
  return `drill-${tier}`;
}

function createDrillDefinitions() {
  const definitions = {};

  for (const entry of DRILL_CONTENT) {
    definitions[drillId(entry.tier)] = Object.freeze({
      id: drillId(entry.tier),
      name: entry.name,
      tier: entry.tier,
      baseCost: entry.baseCost,
      baseOutput: entry.baseOutput,
    });
  }

  return Object.freeze(definitions);
}

/** Frozen map of drill id to definition. */
export const drills = createDrillDefinitions();

export function getDrill(id) {
  return Object.prototype.hasOwnProperty.call(drills, id) ? drills[id] : null;
}

export function drillsForTier(tier) {
  return Object.values(drills).filter((definition) => definition.tier === tier);
}
