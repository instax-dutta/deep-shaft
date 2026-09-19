/**
 * Central balance and tuning surface for Deep Shaft.
 *
 * Every number that playtesting might need to change lives here rather than in gameplay
 * formulas, rendering, or UI code. Values are placeholder defaults chosen to be plausible
 * for a first playable build; they are expected to be retuned against real session lengths.
 */

function deepFreeze(value) {
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}

export const config = deepFreeze({
  economy: {
    startingCurrency: 0,
    /** cost = baseCost * growthRate^ownedCount — the standard idle-game curve. */
    drillCostGrowthRate: 1.15,
    /** Tier 1 unit value for each resource category. */
    resourceBaseValue: {
      ore: 1,
      gems: 10,
      rare: 100,
    },
    /**
     * Per-tier value growth per category. Ore stays flat as the reliable baseline while
     * gems scale moderately and rare minerals scale steeply — the deeper jackpot.
     */
    resourceValueGrowthPerTier: {
      ore: 1,
      gems: 2,
      rare: 2.5,
    },
  },

  production: {
    manualOrePerExtraction: 1,
    /** Multiplies all drill output for each depth tier below Tier 1. */
    depthOutputGrowth: 2,
  },

  workers: {
    /** Lifetime earnings that unlock the whole worker layer. */
    unlockCurrency: 5_000,
    baseHireCost: 250,
    hireCostGrowthRate: 1.18,
    baseTrainCost: 100,
    trainCostGrowthRate: 1.25,
    /** Stats are fractions: speed 0.05 means +5% output on the assigned target. */
    baseSpeed: 0.05,
    baseLuck: 0.01,
    speedBonusPerLevel: 0.05,
    luckBonusPerLevel: 0.02,
    maxLevel: 50,
    maxRoster: 8,
  },

  events: {
    minIntervalSeconds: 45,
    maxIntervalSeconds: 180,
    caveIn: {
      minDurationSeconds: 10,
      maxDurationSeconds: 30,
      drillsDisabled: 1,
    },
    luckyVein: {
      minDurationSeconds: 10,
      maxDurationSeconds: 20,
      productionMultiplier: 2,
    },
  },

  offline: {
    /** Offline production is clamped to 24 hours so a long absence is not a huge jump. */
    capSeconds: 86_400,
  },

  prestige: {
    thresholdCurrency: 1_000_000,
    /** Lifetime run earnings that map to exactly `multiplierPerScale` extra multiplier. */
    lifetimeScale: 1_000_000,
    multiplierPerScale: 0.25,
    /** Run earnings that map to one prestige point, on a separate curve from the multiplier. */
    pointsScale: 1_000_000,
    pointsMultiplier: 1,
  },

  depth: {
    tierCount: 5,
    baseUnlockCost: 4_000,
    /** cost = baseUnlockCost * growthRate^(tier - 1) */
    unlockCostGrowthRate: 300,
  },

  persistence: {
    storageKey: 'deep-shaft.save',
    /** Rolling recovery slot written beside the primary save on every successful write. */
    backupKey: 'deep-shaft.save.backup',
    schemaVersion: 2,
    autosaveIntervalMs: 15_000,
  },

  loop: {
    /** Live simulation tick. Production is elapsed-time based, so this only sets granularity. */
    tickMs: 200,
  },

  automation: {
    /** Auto-buy stops raising a single drill past this owned count, so it can never run away. */
    autoBuySafetyBound: 500,
  },

  simulation: {
    /**
     * Active-play taps per second the simulated opening is allowed while the mine owns no drills.
     * This bounds the start-up burst so pacing stays a property of the economy, not of a strategy
     * that can tap an unlimited number of times.
     */
    manualTapsPerSecond: 3,
    /**
     * The balanced strategy only digs once it holds this multiple of the dig cost, so it enters
     * each tier with a larger drill base. Above 1 it is strictly slower than the greedy line.
     */
    balancedDigReserve: 1.5,
    /** Iteration bound for one strategy step, so a degenerate curve can never spin forever. */
    strategyGuard: 5_000,
  },

  numbers: {
    /**
     * Which magnitude backend `core/numbers/magnitude.js` uses. `'big'` promotes values past
     * the JS float range to an arbitrary-precision representation; `'float'` keeps plain
     * numbers (and their `Infinity` ceiling) for debugging and characterization.
     */
    implementation: 'big',
  },

  ui: {
    mobileBreakpointPx: 720,
    /**
     * How long a player-initiated message (reset, penalty, purchase) holds the toast before a
     * lower-priority notice such as an achievement may replace it.
     */
    toastHoldMs: 1_500,
  },
});
