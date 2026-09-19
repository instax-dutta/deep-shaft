# Data Contract

## Purpose
- Own static game definitions and tuning values for resources, drills, workers, depth tiers, events, and progression.

## Ownership
- Data modules contain names, costs, multipliers, probabilities, thresholds, and content metadata.
- Formulas and transitions remain owned by `src/core/`.

## Local Contracts
- Definitions use stable IDs and explicit numeric fields.
- Five depth tiers are configured for v1.
- Every depth exposes ore, gems, and rare minerals.
- Tuning values are centralized and easy to change without editing rendering or command logic.
- `achievements.js` carries declarative `{ id, name, description, stat, gte }` goals. The stat
  must exist in `core/achievements.js#statsSnapshot`; a data-integrity test enforces it.
- `automation.js` maps each automation kind (`autoSell`, `autoBuy`, `autoDig`) to its unlock
  upgrade and defines run order. `config.automation.autoBuySafetyBound` bounds auto-buy.
- `prestigeUpgrades.js` carries content and each upgrade's cost curve (`baseCost`,
  `costGrowthRate`, `maxLevel`, `multiplierPerLevel`, `effect`). Formulas stay in
  `src/core/prestigeUpgrades.js`.
- `config.numbers.implementation` selects the magnitude backend (`'big'` default, `'float'` for
  debugging). It is the only switch for the numeric representation; no gameplay module may branch
  on it.
- Pacing here is defended, not placeholder, and the approved P12 windows live in
  `tests/core/simulation.test.js`: Depth 2 in 10–20 minutes, Depth 3 in 1–2 hours, Depth 4 in
  4–8 hours, Depth 5 in 24–48 hours, first prestige available within 4 hours, and offline catch-up
  at the 24h cap a minor share of a day of active play. Changing one of those numbers is an
  explicit edit to the plan and that table together, never a quiet edit to a tuning value.
- The pacing values that carry those windows are `depth.baseUnlockCost`,
  `depth.unlockCostGrowthRate`, `production.depthOutputGrowth`,
  `economy.resourceValueGrowthPerTier`, `prestige.thresholdCurrency`, `offline.capSeconds`, and
  `simulation.*`. Retuning any of them means re-running `tests/core/simulation.test.js` and the
  `tests/core/depth.test.js` data tests, then re-reading `node scripts/economy-report.mjs`.
- Anything that needs the depth ladder — tests and the browser harness included — reads
  `depthTierCost()` from here instead of restating a cost, so a retune never requires a test edit.

## Work Guidance
- Prefer frozen/plain data objects that are easy to inspect in tests.
- Keep content names cohesive with the selected visual asset pack.

## Verification
- Data integrity tests verify unique IDs, sequential tiers, required resource categories, positive costs, and valid probability ranges.

## Child DOX Index
- No narrower durable data boundary exists yet.
