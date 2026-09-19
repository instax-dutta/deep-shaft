# Core Gameplay Contract

## Purpose
- Own deterministic Deep Shaft state, commands, formulas, simulation, and serialization-independent gameplay behavior.

## Ownership
- State creation and validated transitions belong here.
- Resource, drill, production, offline, depth, worker, event, prestige, and number-format rules belong here.

## Local Contracts
- Core modules must be usable in Vitest without Phaser, DOM, localStorage, or real time.
- Save loading is an outcome, not a boolean: `migrateSave` / `deserializeResult` return
  `{ ok: true, state, fromVersion }` or `{ ok: false, reason }` using `SAVE_LOAD_REASONS`.
  Never return a bare `null` that conflates "no save" with "unreadable save".
- Schema changes land as a step in `MIGRATIONS`, keyed by the version they upgrade from; the v2
  phases extend the `1 -> 2` step rather than adding version numbers. A save from a future
  version is refused with `unsupported_future`, never wiped.
- `saveTransfer.js` owns save export/import and returns structured refusals (`empty`, `corrupt`,
  `not_a_save`, `unsupported_future`).
- All economy arithmetic on currency, resources, rates, and multipliers goes through
  `numbers/magnitude.js` (`M`). Core code must not do raw `+`, `-`, `*`, `/`, `<`, or `>` on those
  values: use `M.add/sub/mul/div/pow/cmp/gte/lte/gt/lt/max/min/toNumber/isFinite/toString`.
- `numbers/bigMagnitude.js` is the only module that may import the big-number library. Values in
  the float range stay plain numbers; a value that would overflow is promoted silently, so
  persistence and existing behavior are unchanged for ordinary games.
- Prestige points and the upgrade tree live in `prestigeUpgrades.js`, which owns `upgradeLevel`,
  `upgradeCost`, `canBuyUpgrade`, `buyUpgrade`, `upgradeEffects`, and `prestigePointsForRun`.
  Points and purchased levels are permanent: `performPrestige` must never clear them.
- `upgradeEffects(state)` is a sibling effect read beside `workerEffects`; production, drops, and
  offline consume its multiplier keys rather than branching on individual upgrades.
- `settings.js` owns `DEFAULT_SETTINGS`, `normalizeSettings`, and `setSetting`. Storage is never
  trusted: `normalizeSettings` rebuilds a complete valid object, and `setSetting` is the only
  mutation path (refusing `unknown_setting` / `invalid_value` with state unchanged).
- `formatNumber(value, { notation })` accepts `'suffix' | 'scientific' | 'engineering'`; the
  default is `'suffix'`, so existing callers are unchanged.
- `achievements.js` owns `evaluateAchievements`, `achievementProgress`, and `statsSnapshot`.
  Conditions are data (`{ stat, gte }`), evaluation is idempotent, and `state.achievements` is
  never cleared by prestige. `statsSnapshot` is the authoritative list of valid `stat` targets.
- `automation.js` owns `automationUnlocked`, `setAutomation`, and `runAutomation`. Automation is
  gated twice (upgrade owned *and* player toggle on) and runs the same commands a player issues,
  so it can never overspend or exceed an affordability rule. The live tick and the offline batch
  both call `runAutomation`, so there is one behaviour, not two.
- Time-dependent functions accept elapsed seconds or an injected clock value.
- Random outcomes accept an injected random source.
- Core commands never mutate data definitions.
- Invalid actions return structured failure results and leave state unchanged.

## Work Guidance
- Prefer pure functions; when a state transition is necessary, return a new state or a clearly documented controlled mutation.
- Round only for presentation. Preserve fractional production internally.
- Keep formulas named and testable.

## Verification
- Every exported gameplay function has focused behavior tests.
- Tests cover valid paths, insufficient resources, boundaries, malformed inputs, and deterministic time/randomness.

## Child DOX Index
- No narrower durable core boundary exists yet; split only when a subsystem gains independent workflow or verification rules.
