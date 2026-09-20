# Deep Shaft v2 — Production Refinement Plan (TDD)

## Goal
- Take Deep Shaft from a complete, verified MVP to a shippable production idle game:
  durable saves, late-game numeric scale, real retention depth, player controls, accessibility,
  installability, tunable pacing, and cross-browser quality.
- Do it without weakening the existing architecture or the 386-test / 114-browser-check baseline.

## Relationship to the v1 plan
- `docs/superpowers/plans/v1-implementation-plan.md` is complete. Every spec §12 step is built and
  verified. This plan starts from that green baseline and does **not** rewrite v1 behavior; it adds
  and hardens.
- Read the v1 plan once before starting. It records the design decisions this plan inherits
  (assignment semantics, offline expectation math, full prestige reset, event decoupling).

## Source documents
- `mine-idle-spec.md` — product intent. Still the source of truth for v1 scope.
- `docs/implementation-status.md` — current capability ledger; update its phase table at each phase.
- `AGENTS.md` (root), `src/AGENTS.md`, `tests/AGENTS.md`, `scripts/AGENTS.md` — binding contracts.
- `docs/superpowers/plans/v1-implementation-plan.md` — inherited decisions and evidence format.

## Tech stack
- Unchanged base: JavaScript ES modules, Phaser 3, Vite, Vitest, static build, `localStorage`.
- New runtime code stays in the existing five boundaries. No new top-level source directories.
- New test files mirror those boundaries under `tests/`; new browser checks live in `scripts/`.
- The only candidate runtime dependency is the arbitrary-precision number library behind P2's
  `magnitude.js` (P13); it is never imported directly by `core/` modules.

## Architecture at v2 (delta from v1)
```text
src/
  core/
    numbers/magnitude.js      # P2 numeric interface; P13 big implementation behind it
    numbers/bigMagnitude.js   # P13
    saveTransfer.js           # P1 export/import
    settings.js               # P6
    prestigeUpgrades.js       # P3
    automation.js             # P4
    achievements.js           # P5
    tutorial.js               # P10
    simulation.js             # P12
  data/
    prestigeUpgrades.js       # P3
    automation.js             # P4
    achievements.js           # P5
    sounds.js                 # P11
  platform/
    serviceWorker.js          # P8
    audio.js                  # P11
    diagnostics.js            # P15
  ui/
    prestigePanel.js          # P3
    settingsPanel.js          # P6
    confirmModal.js           # P6
    focusTrap.js              # P7
    achievementsPanel.js      # P5
    tutorialPanel.js          # P10
    bootFallback.js           # P15
public/
  manifest.webmanifest        # P8
  sw.js                       # P8
  icons/                      # P8 / art track
```
Every new core module stays pure (no Phaser, DOM, `localStorage`, clock, or randomness). Every new
UI factory keeps the `create<Panel>({ root, dispatch }) -> { element, render(state) }` contract from
`src/ui/AGENTS.md`.

## Global constraints (unchanged unless a phase says otherwise)
- JavaScript ES modules, Phaser 3, Vite, Vitest, static build, `localStorage`. No backend.
- `src/core/` stays pure: no Phaser, DOM, `localStorage`, real clock, or real randomness.
- `src/data/` is the only home for content and tuning values. `src/data/config.js` is the single
  tuning surface. No tuning constants in `core/`, `scenes/`, or `ui/`.
- Core commands return structured results: `{ ok: true, ... }` or
  `{ ok: false, reason: '<machine_reason>' }`. Normal validation failures never throw.
- Time and randomness are injected (`elapsedSeconds`, `random()`, clock value).
- Numbers stay fractional internally; rounding is presentation-only via `formatNumber`.
- Scenes and UI dispatch named commands and render snapshots; they never compute economy rules.
- Every behavior follows RED → GREEN → REFACTOR. See the protocol below.

## Tech-stack additions (owner decisions required before the phase that needs them)
| Addition | Needed by | Default recommendation | Owner must approve |
|---|---|---|---|
| Arbitrary-precision number library | P13 | `break_eternity.js` behind the P2 abstraction, no direct imports in `core/` | Yes |
| Service worker / PWA plugin | P8 | hand-written `public/sw.js` (no build plugin) | No |
| Audio adapter | P11 | Web Audio with an injected no-op backend for tests | Yes (audio is v1-out-of-scope) |
| Art pack | Non-TDD track | one cohesive CC0 pixel pack | Yes |
| Analytics / error reporting | P15 | none by default; local diagnostics only | Yes |

If an owner decision is unresolved when its phase starts, do not implement around it. Record the
block, keep the phase pending, and ask.

---

## TDD protocol (binding for every task in this plan)

### The Iron Law
```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```
Wrote implementation before its test? Delete the implementation. Do not keep it as reference, do
not adapt it while writing the test. Start the task over from RED.

### The loop, per behavior (one behavior per test)
1. **RED** — write one minimal test naming one behavior. Run only that file:
   `npm test -- --run tests/<area>/<file>.test.js`. Confirm it **fails**, and that the failure is
   the expected one (missing symbol / `undefined` / wrong value), not a typo or setup error.
2. **Record the RED** — copy the exact failure line into this plan's phase evidence block. A phase
   without recorded RED evidence is incomplete.
3. **GREEN** — write the minimum code to pass. No extra features, no speculative options.
4. **Verify GREEN** — rerun the focused file, then `npm test -- --run`. Output must be pristine
   (no warnings, no unhandled errors).
5. **Mutation check** — if a test passed on the very first GREEN, it did not prove anything. Mutate
   the implementation (return a constant, flip a comparison, skip the mutation) and confirm the test
   fails, then revert the mutation. Paste the caught mutation in the evidence block. Only tests whose
   first pass is itself a mutation check (e.g. an invariant guard) may skip this, and they must say so.
6. **REFACTOR** — only while green. Remove duplication, improve names, extract helpers. Do not add
   behavior. Rerun to stay green.
7. **Next behavior** — return to step 1.

### Test rules
- Tests mirror runtime boundaries: `tests/core/`, `tests/data/`, `tests/platform/`, `tests/ui/`,
  `tests/scenes/`. New subsystem = new matching file.
- One primary behavior per test; if the name contains "and", split it.
- Assert on real domain code. Mocks only at unavoidable browser/clock boundaries, and never assert on
  mock call counts as a substitute for asserting real behavior.
- DOM tests opt into jsdom per file with `// @vitest-environment jsdom` on line 1.
- Boundary and invalid-action cases sit beside the happy path. Every refusal reason gets a test that
  proves the state is byte-for-byte unchanged (deep-compare before/after).
- When changing a behavior, change its test first and watch that test fail, then change the code. A
  passing test that was never observed failing proves nothing.

### Per-phase gate (all four must be green before the phase is "complete")
```bash
npm test -- --run
npm run build
npm run test:browser          # when the phase touches composition, scene, UI, persistence, or PWA
npm run test:browser:responsive   # when the phase touches layout
```
Plus: DOX pass, ledger update, and the evidence block appended to this file.

### Commit boundary
- One commit per phase, message `phase(N): <deliverable>`. Finer granularity is allowed, but never
  leave a phase half-committed.
- **Precondition:** this workspace is not currently a git repository. Initialize one (or adapt these
  boundaries to the team's VCS) before Phase 0 so each phase has a real revert point.

### DOX pass (required per phase)
- Update the affected AGENTS.md contract if a boundary, rule, or interface changed.
- Update `docs/implementation-status.md` with a one-row ledger entry.
- Append the phase's RED/GREEN evidence and any caught defects to this plan, in the style of the v1
  plan.

---

## Phase map

| # | Phase | Priority | Depends on | Size |
|---|---|---|---|---|
| P0 | Regression baseline + production gate | must | — | S |
| P1 | Save schema v2: migrations, outcomes, export/import, backups | must | P0 | L |
| P2 | Magnitude abstraction (behavior-preserving) | should | P1 | L |
| P3 | Prestige upgrade tree (spendable permanent points) | must | P1 | L |
| P4 | Automation and QoL unlocks | must | P3 | M |
| P5 | Achievements, milestones, career stats | should | P1 | M |
| P6 | Settings, notation, and destructive-action UX | must | P1 | M |
| P7 | Accessibility hardening | must | P6 | L |
| P8 | PWA and installability | should | P0 | M |
| P9 | Game-feel feedback and UX polish | must | P3 | M |
| P10 | Onboarding / first-run tutorial | should | P6 | M |
| P11 | Audio layer and settings integration | later | P6 | M |
| P12 | Economy simulation, pacing targets, rebalance | must | P3, P4, P5 | L |
| P13 | Big-number implementation swap (past 1e308) | should | P2, P12 | L |
| P14 | Cross-browser, soak, and performance QA | must | P8, P9 | M |
| P15 | Resilience, diagnostics, error boundaries | must | P14 | M |

Non-TDD track (owner sign-off, no failing test possible): art pack, audio assets, marketing/legal
copy. See "Non-TDD artifacts" at the end.

Do not parallelize phases that share a save-shape change (P1, P3, P5, P6). Parallelize independent
UI-only phases (P7, P8, P10) once their dependency is green.

---

## P0 — Regression baseline and production gate
**Priority:** must · **Depends on:** — · **Size:** S

**Goal.** Freeze the green baseline and make the production gate runnable locally in one command, so
every later phase can prove it did not regress.

**Files.**
- New: `scripts/gate.mjs` (runs tests → build → browser suites, exits non-zero on first failure).
- `package.json` — add `"gate": "node scripts/gate.mjs"`.

**Interfaces.** `scripts/gate.mjs` shells `npm test -- --run`, `npm run build`,
`npm run test:browser`, `npm run test:browser:responsive` in order and prints a summary table.

**RED.** This is tooling, so the failing check is behavioral: `npm run gate` must currently **fail**
because the script does not exist (`Missing script: "gate"`). Record that output.

**GREEN.** Implement `scripts/gate.mjs`; `npm run gate` passes and reports the real counts
(expect 386 tests, 28 files, 114 browser checks).

**Mutation check.** Temporarily break one assertion in a fast core test and confirm `gate` fails at
the test step and exits non-zero; revert.

**Commands.** `npm run gate`.
**Commit.** `phase(0): add one-command production gate`.
**DOX.** `scripts/AGENTS.md` (document `gate.mjs`).

---

## P1 — Save schema v2: migrations, outcomes, export/import, backups
**Priority:** must · **Depends on:** P0 · **Size:** L

**Goal.** Make player data durable. Today `migrateSave` returns `null` for any schema other than 1,
which silently starts a new mine and destroys the old save. Production must migrate, report, and
recover.

**Problem being fixed (read the code before writing tests).**
- `src/core/state.js:99` — `migrateSave` returns `null` on version mismatch. No migration chain, no
  reason, no notice.
- `src/platform/storage.js` — save failures surface as a toast, but there is no backup slot, no
  export/import, and no "could not load" path distinct from "no save".
- `src/main.js:93` — `storage.load() ?? createInitialState()` cannot tell "fresh player" from
  "corrupt save".

**Files.**
- `src/core/state.js` — bump `SAVE_SCHEMA_VERSION` to 2; add `MIGRATIONS`; split load into an
  outcome object.
- New: `src/core/saveTransfer.js` — `exportSave(state)`, `importSave(raw)`.
- `src/platform/storage.js` — add `loadResult()`, `save(state)`, `saveBackup(state)`,
  `loadBackup()`, `clear()`, `hasSave()`.
- `src/data/config.js` — bump `persistence.schemaVersion` to 2; add
  `persistence.backupKey: 'deep-shaft.save.backup'`.

**Interfaces (exact shapes).**
```js
// state.js
export const SAVE_SCHEMA_VERSION = 2;
export const MIGRATIONS = Object.freeze({
  // 1 -> 2: add the fields the v2 phases introduce, defaulted.
  1: (save) => ({ ...save, schemaVersion: 2, settings: { ...DEFAULT_SETTINGS }, /* ... */ }),
});
export function migrateSave(candidate) // -> { ok: true, state, fromVersion } | { ok: false, reason }
// reasons: 'absent' | 'corrupt' | 'unsupported_future' | 'not_an_object'

// saveTransfer.js
export function exportSave(state)            // -> string (pretty JSON + envelope)
export function importSave(raw)              // -> { ok: true, state } | { ok: false, reason }
// reasons: 'empty' | 'corrupt' | 'not_a_save' | 'unsupported_future'
```

**RED tests — `tests/core/state.test.js` (extend).** Write these before touching `state.js`:
- `a version 1 save migrates to version 2 and keeps currency, drills, workers, and prestige`
- `migration fills fields introduced in version 2 with defaults`
- `a save from an unsupported future version is refused with a reason instead of wiped`
- `corrupt JSON is reported as corrupt, not as a fresh player`
- `an absent save is reported as absent`
- `migrateSave never mutates the candidate object`
- `a save with a valid version but unusable fields is repaired field by field`

**RED tests — new `tests/core/saveTransfer.test.js`:**
- `exporting then importing a save round-trips every field`
- `importing foreign JSON is refused as not_a_save`
- `importing a truncated export is refused as corrupt`
- `importing a future-version export is refused without dropping the current save`

**RED tests — `tests/platform/storage.test.js` (extend):**
- `loadResult distinguishes absent from corrupt`
- `a successful save also writes a backup slot`
- `loadBackup recovers the previous save when the primary is corrupt`
- `a failed write still reports structured failure and keeps the in-memory state usable`

**GREEN.** Implement the migration chain (walk `fromVersion → current` one registered step at a
time), the outcome-returning load, and the transfer functions. Keep `load()` as a thin
backward-compatible wrapper if existing callers/tests need it, then migrate `main.js` to
`loadResult()` and show one of three toasts: fresh start, restored-from-backup, or
`Save could not be read — started a new mine (your old save was kept as a backup).`

**REFACTOR.** One sanitizer per v2 field group so later phases add a field and a sanitizer, not a
sprawl.

**Commands.** `npm test -- --run tests/core/state.test.js tests/core/saveTransfer.test.js tests/platform/storage.test.js`
then `npm test -- --run` then `npm run build` then `npm run test:browser:smoke`.
**Commit.** `phase(1): durable save schema with migrations, export/import, and backups`.
**DOX.** `src/core/AGENTS.md`, `src/platform/AGENTS.md`, `docs/implementation-status.md`.

---

## P2 — Magnitude abstraction (behavior-preserving)
**Priority:** should · **Depends on:** P1 · **Size:** L

**Goal.** Introduce a single numeric interface used by all economy math, so the late-game precision
swap in P13 is a one-file change instead of a rewrite. This phase changes **no behavior** — it is a
characterization-test-protected refactor.

**Why now.** All later content phases do arithmetic. If they use raw `+` / `*`, P13 has to touch
every file. Introduce the seam first.

**Files.**
- New: `src/core/numbers/magnitude.js` — the interface and a float-backed implementation.
- `src/core/resources.js`, `drills.js`, `production.js`, `drops.js`, `offline.js`, `workers.js`,
  `prestige.js` — route arithmetic through the helpers.

**Interface (exact).**
```js
export const M = Object.freeze({
  from(value),      // -> Magnitude
  add(a, b), sub(a, b), mul(a, b), div(a, b), pow(a, exponent),
  cmp(a, b),        // -> -1 | 0 | 1
  gte(a, b), lte(a, b), gt(a, b), lt(a, b),
  max(a, b), min(a, b),
  toNumber(a),      // number; may be Infinity once numbers exceed JS float range
  isFinite(a),
  toString(a),
});
```

**RED then GREEN for the seam itself — new `tests/core/numbers/magnitude.test.js`.** These are new
behaviors, so they fail on import first:
- `from accepts numbers, numeric strings, and magnitudes`
- `add / sub / mul / div compose correctly across types`
- `cmp and its comparisons order correctly, including equal values`
- `pow handles the drill and prestige exponents`
- `toNumber returns a finite number for in-range values`
- `isFinite is false for values beyond JS float range` (fails against a naive float impl only once
  P13 lands; for P2 assert the contract on in-range values and mark the overflow test `todo` for P13)

**RED/GREEN for the migration (characterization tests first).** Before editing each core module, add
a characterization test that pins its current behavior with the existing test values. Run it green
before the refactor. Then refactor the module to use `M`. Run the full existing suite: it is the
regression net. Any existing test that breaks is a refactor bug, not a reason to change the test.

**REFACTOR.** Keep `magnitude.js` free of game concepts (no drills, no currency) so P13 can swap the
implementation behind it.

**Commands.** `npm test -- --run` then `npm run build`.
**Commit.** `phase(2): route economy arithmetic through a magnitude abstraction`.
**DOX.** `src/core/AGENTS.md` — document that all economy math goes through `magnitude.js` and that
core must not do raw arithmetic on currency/resources.

---

## P3 — Prestige upgrade tree (spendable permanent points)
**Priority:** must · **Depends on:** P1 · **Size:** L

**Goal.** Give prestige a long-term loop. Today it grants only a flat multiplier and nothing to spend
it on, so each run is a repeat with no build choice. Add a permanent points currency and an upgrade
tree with levels.

**Decisions to record before RED.**
- Point source: `prestige.points` granted by `performPrestige`, based on run earnings (same input as
  `prestigeGain`, separate curve in config).
- Reset semantics: points and purchased upgrade levels survive prestige (like the multiplier).
- Upgrades are always-on multipliers unlocked from the first prestige; no depth gating in this phase.
- Upgrade effects compose multiplicatively and are exposed through `upgradeEffects(state)`, consumed
  by `production.js` and `drops.js` exactly like `workerEffects`.

**Files.**
- New: `src/data/prestigeUpgrades.js` — definitions and `PRESTIGE_UPGRADE_IDS`.
- New: `src/core/prestigeUpgrades.js` — cost, purchase, effects.
- `src/core/prestige.js` — grant points in `performPrestige`; include points and upgrades in the
  preview/summary; do **not** clear them on reset.
- `src/core/state.js` — add `prestige.points` and `prestige.upgrades`; sanitizers; migration is
  already handled by the P1 chain (extend the 1→2 default when P3 fields are the ones landing).
- `src/data/config.js` — `prestige.pointsPerRunScale`, `prestige.pointsPerRunMultiplier`, and per
  upgrade `baseCost` / `costGrowthRate` where the definition does not carry them.
- New: `src/ui/prestigePanel.js` — renders the tree; `src/main.js` wires it.

**Interfaces.**
```js
// core/prestigeUpgrades.js
export function upgradeLevel(state, id)          // -> integer >= 0
export function upgradeCost(state, id)           // -> number (formatted by UI)
export function canBuyUpgrade(state, id)         // -> { ok } | { ok:false, reason }
export function buyUpgrade(state, id)            // -> { ok, id, level, cost } | failure
export function upgradeEffects(state)            // -> { productionMultiplier, gemChanceMultiplier,
                                                 //     rareChanceMultiplier, offlineCapMultiplier, ... }
export function prestigePointsForRun(state)      // -> integer
```

**RED tests — new `tests/core/prestigeUpgrades.test.js`:**
- `a fresh mine has no points and no upgrade levels`
- `upgrade cost follows the configured exponential curve`
- `buying an upgrade spends exactly its cost and raises its level by one`
- `an upgrade cannot be bought past its max level`
- `buying without enough points is refused and leaves state byte-for-byte unchanged`
- `an unknown upgrade id is refused`
- `upgrade effects compose multiplicatively across owned levels`
- `a production upgrade raises extraction rate by its stated multiplier` (integration through
  `extractionRatePerSecond`)
- `a rare-find upgrade raises the rare drop chance but not ore output`
- `prestige grants points derived from the run and preserves points across the reset`
- `the prestige summary reports the points the run earned` (extend `tests/core/prestige.test.js`)

**RED tests — new `tests/ui/prestigePanel.test.js` (jsdom):**
- `an affordable upgrade is enabled and dispatches buyUpgrade`
- `an unaffordable upgrade is disabled and never dispatches`
- `a maxed upgrade shows Max and stays disabled`
- `the panel shows the current points balance`

**GREEN.** Implement cost → purchase → effects. Consume `upgradeEffects` in production and drops
with no change to the modifier plumbing: fold the multipliers into the existing
`activeModifiers`/`workerEffects` call sites, or add a sibling effect read — choose one and document
it.

**Mutation checks.** (a) Make cost flat → caught by the curve test. (b) Let the reset clear points →
caught by the preserve test. (c) Apply the production upgrade to ore chance → caught by the
rare-find test.

**REFACTOR.** Keep `data/prestigeUpgrades.js` free of formulas; only `core/prestigeUpgrades.js`
computes.
**Commands.** focused → `npm test -- --run` → `npm run build` → `npm run test:browser:smoke`.
**Commit.** `phase(3): prestige points and an upgrade tree`.
**DOX.** `src/core/AGENTS.md`, `src/data/AGENTS.md`, `src/ui/AGENTS.md`, status doc.

---

## P4 — Automation and QoL unlocks
**Priority:** must · **Depends on:** P3 · **Size:** M

**Goal.** Make the late game playable without constant tapping. Add opt-in automation unlocked by the
prestige tree: auto-sell, auto-buy (one drill tier, cheapest affordable), and auto-dig (only when
explicitly enabled).

**Files.**
- New: `src/core/automation.js` — `automationUnlocked(state, kind)`, `runAutomation(state, elapsed)`.
- New: `src/data/automation.js` — kinds, unlock upgrade id, and behavior order.
- `src/core/production.js` or `src/main.js` — call `runAutomation` once per tick, after production.
- `src/core/offline.js` — run automation during catch-up in the same batch (same reason the v1 plan
  uses expectation math: one rule, not two).
- `src/ui/settingsPanel.js` (from P6) or `prestigePanel.js` — toggles.

**Interfaces.**
```js
export const AUTOMATION_KINDS = Object.freeze({ AUTO_SELL: 'autoSell', AUTO_BUY: 'autoBuy', AUTO_DIG: 'autoDig' });
export function automationUnlocked(state, kind) // -> boolean (upgrade level > 0 AND toggle on)
export function runAutomation(state, elapsedSeconds) // -> { ok, actions: [...] } (structured, no throws)
```

**RED tests — new `tests/core/automation.test.js`:**
- `automation does nothing while locked`
- `auto-sell converts the whole inventory at the configured sell value and credits earnings`
- `auto-sell preserves the currency invariant when there is nothing to sell`
- `auto-buy purchases one unit of the cheapest affordable unlocked drill per interval`
- `auto-buy stops at the configured safety bound and never overspends`
- `auto-dig only advances depth when the next tier is affordable and enabled`
- `automation runs during offline catch-up and reports the actions it took`
- `automation is deterministic under an injected clock and random source`
- `a locked automation toggle is ignored even if the save sets it true`

**GREEN.** Minimal: run each enabled behavior once per call, in data-defined order. No background
state beyond toggles.
**Mutation check.** Make auto-buy ignore affordability → caught. Make auto-sell use the wrong
multiplier → caught.
**Commands.** focused → full suite → build.
**Commit.** `phase(4): prestige-gated automation`.
**DOX.** `src/core/AGENTS.md`, `src/data/AGENTS.md`.

---

## P5 — Achievements, milestones, and career stats
**Priority:** should · **Depends on:** P1 · **Size:** M

**Goal.** Add visible long-term goals and a career stats surface, so returning players have something
to chase beyond the multiplier.

**Decisions to record.** Achievements are career-persistent (not cleared by prestige) and grant no
power in this phase (they are goals, not balance levers). If a later phase wants achievement bonuses,
that is a new decision with its own tests.

**Files.**
- New: `src/data/achievements.js` — definitions with `id`, `name`, `description`, and a pure
  `condition(state)` predicate **or** a declarative `{ stat, gte }` shape. Prefer declarative so
  conditions are data, not code.
- New: `src/core/achievements.js` — `evaluateAchievements(state)`, `achievementProgress(state, id)`,
  `earnedAchievements(state)`.
- `src/core/state.js` — `achievements: { earned: { [id]: true }, firstEarnedAt: { [id]: ms } }`,
  preserved across prestige.
- `src/core/resources.js` / `prestige.js` — call `evaluateAchievements` after any stat change (or
  call it once per tick from `main.js`; choose one and document it).
- New: `src/ui/achievementsPanel.js`; `src/main.js` wires it and toasts newly earned achievements.

**Interfaces.**
```js
export function evaluateAchievements(state) // -> { ok, newlyEarned: [{ id, name }] } (idempotent)
export function achievementProgress(state, id) // -> { current, target, ratio }
export function earnedAchievements(state) // -> [definition]
```

**RED tests — new `tests/core/achievements.test.js`:**
- `a fresh mine has earned nothing`
- `evaluating below every threshold awards nothing`
- `crossing a threshold awards exactly that achievement, once`
- `re-evaluating an already-earned achievement awards nothing` (idempotence)
- `achievements are not cleared by prestige`
- `progress reports current, target, and a ratio clamped to 0..1`
- `a malformed achievement definition is rejected by the data-integrity test` (see data tests)

**RED tests — new `tests/data/achievements.test.js`:**
- `achievement ids are unique`
- `every achievement has a name, description, and a valid declarative condition targeting a real stat`
- `no achievement targets a stat that does not exist on a fresh save`

**RED tests — new `tests/ui/achievementsPanel.test.js` (jsdom):**
- `earned achievements are shown as earned and locked ones show progress`
- `a newly earned achievement is announced in a toast, not silently`

**GREEN.** Implement the declarative evaluator. Keep it a pure function of stats.
**Mutation check.** Remove the "already earned" guard → caught by idempotence.
**Commands.** focused → full → build.
**Commit.** `phase(5): career achievements and milestones`.
**DOX.** `src/core/AGENTS.md`, `src/data/AGENTS.md`, `src/ui/AGENTS.md`, status doc.

---

## P6 — Settings, notation, and destructive-action UX
**Priority:** must · **Depends on:** P1 · **Size:** M

**Goal.** Give players control and give destructive actions a real confirmation. Today there is no
settings surface at all and no way to reset or transfer a save.

**Files.**
- New: `src/core/settings.js` — `DEFAULT_SETTINGS`, `normalizeSettings(candidate)`,
  `setSetting(state, key, value)`.
- `src/core/state.js` — `settings` on state; sanitizer; migration already in P1.
- `src/core/numberFormat.js` — `formatNumber(value, { notation })` with `'suffix' | 'scientific' |
  'engineering'`. Backward compatible: second argument optional, default `'suffix'`.
- New: `src/ui/settingsPanel.js` — notation, reduced motion, sound, haptics, auto-sell toggles, plus
  Export save, Import save, and Reset game.
- New: `src/ui/confirmModal.js` — reusable destructive confirm (used by Reset and by P7's focus-trap
  contract).
- `src/main.js` — apply settings (root class for reduced motion, notation passed to panels),
  handle `resetGame`, `exportSave`, `importSave` commands.
- `src/ui/hud.js`, `shopPanel.js`, `depthPanel.js`, `workerPanel.js`, `prestigeModal.js` — pass
  `notation` from state.

**Interfaces.**
```js
// core/settings.js
export const DEFAULT_SETTINGS = Object.freeze({ notation:'suffix', reducedMotion:false, sound:true, haptics:true });
export function normalizeSettings(candidate) // -> full, valid settings object
export function setSetting(state, key, value) // -> { ok } | { ok:false, reason:'unknown_setting' | 'invalid_value' }
```

**RED tests — new `tests/core/settings.test.js`:**
- `defaults are complete and frozen`
- `normalizing a partial settings object fills missing keys and drops unknown keys`
- `normalizing rejects invalid enum values and falls back to the default`
- `setSetting stores a valid value and refuses an unknown key with state unchanged`
- `setSetting refuses an invalid value with state unchanged`

**RED tests — `tests/core/numberFormat.test.js` (extend):**
- `scientific notation formats large values as coefficient times power of ten`
- `engineering notation uses powers of three`
- `the default notation is unchanged from v1 for existing callers` (guards all current call sites)

**RED tests — new `tests/ui/settingsPanel.test.js` (jsdom):**
- `changing notation dispatches setSetting and the HUD re-renders in the new notation`
- `toggling reduced motion adds the reduced-motion class to the app root`
- `Reset game opens a confirmation naming the full loss and dispatches nothing until confirm`
- `confirming reset clears the save and returns the mine to a fresh state`
- `cancelling reset changes nothing`
- `Export produces a string; Import of that string restores the mine`
- `importing invalid text shows an error and does not destroy the current save`

**GREEN.** Implement normalization (never trust storage), the notation branch, and the confirm modal
against the P1 transfer functions.
**Mutation checks.** (a) Make normalization pass through unknown keys → caught. (b) Make the confirm
modal dispatch on open → caught. (c) Make reset not clear storage → caught.
**Commands.** focused → full → build → `npm run test:browser:smoke` (add an export/import scenario in
P14's harness expansion).
**Commit.** `phase(6): player settings, notation options, and safe destructive actions`.
**DOX.** `src/core/AGENTS.md`, `src/ui/AGENTS.md`, status doc.

---

## P7 — Accessibility hardening
**Priority:** must · **Depends on:** P6 · **Size:** L

**Goal.** The game is currently pointer-only on the canvas and the prestige dialog has no focus
management. Make it usable with a keyboard and a screen reader.

**Deficiencies to fix.**
- `src/scenes/GameScene.js:36` — manual mining exists only as a canvas `pointerdown`; no keyboard or
  button path.
- `src/ui/prestigeModal.js` — `role="dialog"` with Escape handling but no focus trap, no
  `aria-labelledby`, no focus restoration on close.
- No `prefers-reduced-motion` handling; no live region for production/status changes.

**Files.**
- `src/ui/hud.js` — add a real `Mine` button that dispatches `{ type:'mine' }`.
- New: `src/ui/focusTrap.js` — `trapFocus(container)` returning `{ release() }`; cycles Tab within
  the container, restores focus to the opener on release.
- `src/ui/prestigeModal.js`, `src/ui/confirmModal.js` — use the trap, add `aria-labelledby`, restore
  focus.
- `src/ui/styles.css` — `@media (prefers-reduced-motion: reduce)` disabling transitions; a
  `:focus-visible` outline; verify contrast.
- `src/main.js` — a polite live region announcing threshold crossings (depth unlock, prestige
  available, worker unlock), at low frequency to avoid chatter.

**RED tests — new `tests/ui/a11y.test.js` (jsdom):**
- `the HUD exposes a keyboard-focusable Mine control that dispatches mine`
- `the prestige dialog traps Tab focus inside itself`
- `Shift+Tab from the first control wraps to the last`
- `closing the dialog restores focus to the control that opened it`
- `the dialog is labelled by its heading via aria-labelledby`
- `Escape closes the dialog and restores focus`

**RED tests — new `tests/ui/reducedMotion.test.js` (jsdom + CSS read):**
- `the stylesheet disables motion under prefers-reduced-motion` (assert the media query and the rule
  exist, matching the existing responsiveStyles approach)

**RED tests — new `tests/ui/liveRegion.test.js` (jsdom):**
- `unlocking a depth announces it once in the polite live region`
- `a repeated render does not re-announce an already-announced event`

**GREEN.** Implement the trap and the button. Announce only on state transitions, not every tick.
**Browser check.** Extend `scripts/browser-responsive.mjs` or add `scripts/browser-a11y.mjs`: assert
every interactive control is reachable by Tab and that the focus trap holds under real Chromium
scheduling.
**Commands.** focused → full → build → `npm run test:browser`.
**Commit.** `phase(7): keyboard, focus, and motion accessibility`.
**DOX.** `src/ui/AGENTS.md`, `tests/AGENTS.md`, status doc.

---

## P8 — PWA and installability
**Priority:** should · **Depends on:** P0 · **Size:** M

**Goal.** Make the static build installable and openable offline, which is the retention floor for a
browser idle game on mobile.

**Files.**
- New: `public/manifest.webmanifest` — name, short_name, start_url `./`, display `standalone`,
  background/theme `#12100e`, icons (192, 512, maskable).
- New: `public/icons/` — icon files (owner-approved art; placeholders acceptable only until the
  art track lands).
- New: `public/sw.js` — cache-first app shell with a versioned cache name and activation cleanup.
- New: `src/platform/serviceWorker.js` — `registerServiceWorker(host)` guarded, injectable, no-op in
  tests.
- `index.html` — link the manifest; add `<link rel="icon">` and `apple-touch-icon`.
- `src/main.js` — call the registration adapter.
- `vite.config.js` — ensure `public/` assets are emitted (Vite does this by default).

**RED tests — new `tests/ui/pwaManifest.test.js`** (Node, reads files with `fs` — a file-content
contract test, in the spirit of `responsiveStyles.test.js`):
- `index.html links a web app manifest and an icon`
- `the manifest declares a name, a start_url, standalone display, theme color, and 192/512 icons`
- `the manifest icon paths exist in public/`
- `the service worker script exists and caches the app shell`

**RED tests — new `tests/platform/serviceWorker.test.js`:**
- `registration is skipped when the API is unavailable, without throwing`
- `registration is called with the service worker URL when available`
- `a registration failure is reported structurally, never thrown`

**Browser check.** New `scripts/browser-pwa.mjs` under the shared harness:
- `the manifest is served and parsed by the browser`
- `the service worker registers and reaches the active state`
- `after the first load, a reload with the network offline still renders the app shell`
- `no JavaScript errors are reported`

**GREEN.** Implement the adapter and the worker. Keep the worker's cache list derived from the built
shell, and bump the cache version when assets change.
**Commands.** focused → full → build → `npm run test:browser:pwa` (add the npm script).
**Commit.** `phase(8): installable PWA with an offline app shell`.
**DOX.** `src/platform/AGENTS.md`, `scripts/AGENTS.md`, status doc.

---

## P9 — Game-feel feedback and UX polish
**Priority:** must · **Depends on:** P3 · **Size:** M

**Goal.** Close the "feels like a prototype" gap with concrete, testable player-facing behavior:
per-resource selling, purchase/sale feedback, worker management, and assignment correctness.

**Testable core additions.**
- `src/core/resources.js` — `sellCategory(state, category)`, `sellAmount(state, id, amount)`.
- `src/core/workers.js` — `renameWorker(state, id, name)`, `dismissWorker(state, id)` (refund policy
  is a recorded decision; default: no refund, confirmation in UI).
- `src/core/workers.js` — `isValidAssignment(assignment, state)` must reject a drill whose tier is
  not yet unlocked (today `workerPanel` lists every drill regardless of depth).
- `src/ui/workerPanel.js` — filter assignment options to unlocked drills and categories.

**RED tests — core:**
- `sellCategory sells only that category's active-tier resources`
- `sellAmount refuses a non-positive or over-inventory amount with state unchanged`
- `renaming a worker updates only its name and refuses an empty name`
- `dismissing a worker removes it from the roster and refuses an unknown id with state unchanged`
- `assigning a worker to a locked drill tier is refused with invalid_target`
- `assigning to an unlocked drill still succeeds`

**RED tests — UI (jsdom):**
- `the worker assignment list contains only unlocked drill tiers`
- `selling a single resource dispatches that resource and leaves the others banked`
- `a purchase shows a visible confirmation with the amount spent` (toast wiring)
- `dismissing a worker asks for confirmation first`

**Non-testable feel (explicitly out of Vitest).** Particle/animation polish, easing curves, and
transition timing are judged by a human against `screenshots/`. Add a browser check only for
`prefers-reduced-motion` suppression, which is testable.

**GREEN.** Implement the core commands with structured refusals, then wire the UI. Keep buying/selling
economy math in `core/`, never in the panel.
**Commands.** focused → full → build → `npm run test:browser:smoke`.
**Commit.** `phase(9): resource and crew management polish`.
**DOX.** `src/core/AGENTS.md`, `src/ui/AGENTS.md`, status doc.

---

## P10 — Onboarding / first-run tutorial
**Priority:** should · **Depends on:** P6 · **Size:** M

**Goal.** Guide a first-time player from tap → sell → buy → dig without a wall of text, and never
re-show the tutorial to a returning player.

**Files.**
- New: `src/core/tutorial.js` — a small explicit state machine.
- `src/core/state.js` — `tutorial: { step, completed }`; migration/sanitizer.
- New: `src/ui/tutorialPanel.js` — a dismissible coach line keyed to the current step.
- `src/main.js` — advance steps after successful commands; persist on completion.

**Interface.**
```js
export function tutorialState(state)              // -> { step, total, completed, instruction }
export function advanceTutorial(state, event)     // -> { ok, step, completed, newlyCompleted }
// events: 'mined' | 'sold' | 'bought_drill' | 'dug' | 'dismissed'
```

**RED tests — new `tests/core/tutorial.test.js`:**
- `a fresh mine starts at step 1 with an instruction`
- `the expected action advances exactly one step`
- `an out-of-order event does not advance the tutorial`
- `completing the last step marks the tutorial completed and instruction empty`
- `a completed tutorial stays completed across save/load`
- `a player who finished the tutorial is never reset to step 1 by prestige`
- `an unknown event is refused with state unchanged`

**RED tests — `tests/ui/tutorialPanel.test.js` (jsdom):**
- `the panel renders the current instruction and hides when complete`
- `dismissing the tutorial dispatches a dismiss event and never reappears`

**GREEN.** Implement the machine and wire the events after each successful dispatch in `main.js`.
**Commands.** focused → full → build.
**Commit.** `phase(10): first-run tutorial`.
**DOX.** `src/core/AGENTS.md`, `src/ui/AGENTS.md`, status doc.

---

## P11 — Audio layer and settings integration
**Priority:** later · **Depends on:** P6 · **Size:** M
**Owner decision required:** the v1 spec puts sound out of scope. Approve before starting.

**Goal.** Add a small, muteable sound layer with an injected no-op backend so tests never play audio.

**Files.**
- New: `src/platform/audio.js` — `createAudio({ backend })` with `play(eventId)`, `setVolume`,
  `mute`, `unmute`; default backend is a no-op when Web Audio is unavailable.
- New: `src/data/sounds.js` — event-id → asset path map (assets are the owner's art/audio track).
- `src/main.js` — play on mine, purchase, sale, event start, prestige.
- Settings (P6) — `sound` and `volume` already present.

**RED tests — new `tests/platform/audio.test.js`:**
- `the no-op backend never throws and reports success`
- `play is ignored while muted`
- `unmuting restores playback`
- `volume is clamped to 0..1`
- `a backend that throws does not break the game loop` (returns structured failure)

**GREEN.** Implement the adapter; wire calls behind the `sound` setting. Verify in a browser that
muting suppresses playback (a manual check, since headless audio is unreliable).
**Commands.** focused → full → build.
**Commit.** `phase(11): optional audio layer`.
**DOX.** `src/platform/AGENTS.md`, status doc.

---

## P12 — Economy simulation, pacing targets, and rebalance
**Priority:** must · **Depends on:** P3, P4, P5 · **Size:** L

**Goal.** Replace "placeholder values" with values defended by tests. Encode session-length targets
as assertions against a deterministic simulation, then tune `src/data/` until they pass. This is how
balance gets TDD without being subjective.

**Owner decisions required (proposed defaults; approve or change).**
- A first-time player reaches Depth 2 within 10–20 minutes of active play.
- Depth 3 within 1–2 hours, Depth 4 within 4–8 hours, Depth 5 within 1–2 days.
- The first prestige is available within ~2–4 hours; each later prestige is no slower than the last.
- Offline catch-up at the 24h cap is a meaningful but not dominant share of a day's progress.

**Files.**
- New: `src/core/simulation.js` — `simulateRun({ strategy, maxSeconds, stepSeconds, random, seed })
  -> { ticks, milestones, series }`, pure and deterministic.
- New: `scripts/economy-report.mjs` — prints milestone times and resource curves for a strategy;
  writes `screenshots/economy-*.svg` or a text table for human review.
- `src/data/config.js`, `drills.js`, `depthTiers.js`, `resources.js`, `prestigeUpgrades.js` — retuned
  so the targets pass.

**Interface.**
```js
export const STRATEGIES = Object.freeze({ GREEDY: 'greedy', BALANCED: 'balanced' });
export function simulateRun(options) // -> { milestones: { tier2: seconds, ... }, series, finalState }
```

**RED tests — new `tests/core/simulation.test.js`:**
- `the simulation is deterministic for a fixed seed`
- `the greedy strategy reaches Depth 2 within the approved minimum and maximum time`
- `the greedy strategy reaches Depth 3 within the approved window`
- `the simulation never produces negative currency, resources, or drill counts`
- `currency and resource totals are monotonic in the sell-only regions`
- `the first prestige threshold is crossed within the approved window`
- `a second run with a prestige multiplier is faster than the first` (retention property)
- `offline catch-up at the cap does not exceed the approved share of daily progress`

These tests use real `src/data/` values. Retuning is a data-only change; when a value changes,
re-run the simulation suite and the focused data tests.

**GREEN.** Implement the pure simulator. Fix the economy by editing data until the targets pass. Do
not weaken a target test to make tuning easier; change the approved number explicitly in this plan if
the owner agrees.

**REFACTOR.** Keep the simulator free of UI and Phaser; it is a core module and may be used by future
tooling.
**Commands.** focused → full → build. `node scripts/economy-report.mjs` for the human curve.
**Commit.** `phase(12): simulation-backed economy rebalance`.
**DOX.** `src/data/AGENTS.md`, `docs/implementation-status.md` (record approved targets).

---

## P13 — Big-number implementation swap (past 1e308)
**Priority:** should · **Depends on:** P2, P12 · **Size:** L
**Owner decision required:** which library (default `break_eternity.js`) or an internal big magnitude.

**Goal.** Make optional, and then default, a magnitude implementation that survives late-game scale.
Today every value is a JS float: above ~1e308 it becomes `Infinity` and `formatNumber` prints `∞`
(`src/core/numberFormat.js:46`). With compounding prestige multipliers this is a real end-state.

**Files.**
- New: `src/core/numbers/bigMagnitude.js` — the same interface as `magnitude.js`, backed by the
  approved implementation.
- `src/core/numbers/magnitude.js` — select the implementation from a single module-level switch (or
  a config flag), exporting `M`.
- `src/core/numberFormat.js` — accept magnitudes and format them without precision loss for in-range
  values.
- `src/data/config.js` — `numbers.implementation: 'float' | 'big'` (default `'big'` once green).

**RED tests — extend `tests/core/numbers/magnitude.test.js`:**
- `toNumber is finite for in-range values and Infinity is reserved for genuine overflow`
- `values beyond JS float range still add, subtract, compare, and multiply correctly`
- `formatNumber of a value beyond 1e308 produces a suffix or scientific string, never Infinity`
- `a 10^6 prestige multiplier applied to a large base does not collapse to Infinity`
- `cost curves computed at extreme owned counts stay ordered and finite`

**RED tests — extend `tests/core/simulation.test.js`:**
- `a long-horizon simulation (many prestige cycles) never produces Infinity in currency or resources`

**GREEN.** Ship the big implementation behind the P2 interface and run the entire existing suite as
the regression net. Any failure is an integration bug in the abstraction's float assumptions, not a
reason to change assertions.
**Mutation check.** Force `toNumber` to return `Infinity` for a large in-range magnitude → caught by
the formatting/simulation tests.
**Commands.** focused → full → build → `npm run test:browser:smoke`.
**Commit.** `phase(13): arbitrary-precision late-game numbers`.
**DOX.** `src/core/AGENTS.md`, `docs/implementation-status.md`.

---

## P14 — Cross-browser, soak, and performance QA
**Priority:** must · **Depends on:** P8, P9 · **Size:** M

**Goal.** Prove the game holds on real browser engines and over long sessions, not just headless
Chromium for two minutes.

**Files.**
- `scripts/browser-harness.mjs` — parameterize the browser project (`chromium`, `webkit`,
  `firefox`); default run stays Chromium-only locally, and a full matrix runs before release.
- New: `scripts/browser-soak.mjs` — run the production build for a fixed wall-clock budget with
  automation enabled, sample memory (`performance.memory` or CDP) and frame responsiveness, assert
  no unbounded growth and no console errors.
- New: `scripts/browser-perf.mjs` — assert the tick's render does not exceed a per-frame budget at a
  large state (many drills, workers, and resources).
- `package.json` — scripts `test:browser:all`, `test:browser:soak`.

**RED.** These are new checks; they should first **fail** for a real reason. Intentionally introduce
a known leak (e.g. an interval that is never cleared, or a DOM node appended every tick without
reconciliation) in a scratch branch, confirm soak detects it, then revert. Record the caught leak.

**GREEN.** Fix what the checks find. Expected real findings to look for, based on the code:
- `src/main.js:247` re-renders every panel every 200ms; measure whether that is a problem at scale,
  and if so reconcile only changed fields.
- `src/main.js` registers two `setInterval`s and lifecycle listeners with no teardown; a soak test
  that loads and unloads repeatedly can detect listener accumulation.
- `src/ui/workerPanel.js` already reconciles rows; confirm the other panels do not rebuild.

**Browser gate.** `npm run test:browser:all` green across chromium, webkit, and firefox.
**Commands.** `npm run test:browser` (local) then `npm run test:browser:all` (release).
**Commit.** `phase(14): cross-browser, soak, and performance gates`.
**DOX.** `scripts/AGENTS.md`, `tests/AGENTS.md`, status doc.

---

## P15 — Resilience, diagnostics, and error boundaries
**Priority:** must · **Depends on:** P14 · **Size:** M

**Goal.** Never present a blank page or a silent failure. Today `boot()` throws if `#app-root` is
missing (`src/main.js:81`) and there is no fallback if Phaser fails to initialize.

**Files.**
- New: `src/ui/bootFallback.js` — renders a readable message (and a "try reloading" control) when
  the app cannot start.
- `src/main.js` — wrap `boot()` in a guard; catch Phaser init failure; add a global
  `window.addEventListener('error' | 'unhandledrejection')` that shows a non-fatal notice and keeps
  the in-memory session alive.
- New: `src/platform/diagnostics.js` — collects recent errors and a version string, exposed behind a
  settings "diagnostics" view; no network calls.
- `package.json` / build — expose the build version to the app (Vite `define`).

**RED tests — new `tests/ui/bootFallback.test.js` (jsdom):**
- `a missing app root renders a readable error instead of throwing`
- `a Phaser construction failure renders the fallback and does not blank the page`
- `an unhandled error shows a non-fatal notice and the game remains interactive`

**RED tests — new `tests/platform/diagnostics.test.js`:**
- `recorded errors are bounded (no unbounded growth)`
- `diagnostics never include player save contents` (privacy guard)

**GREEN.** Implement the guard and the bounded log.
**Commands.** focused → full → build → `npm run test:browser` (add a browser check that a forced boot
failure shows the fallback).
**Commit.** `phase(15): boot resilience and local diagnostics`.
**DOX.** `src/ui/AGENTS.md`, `src/platform/AGENTS.md`, status doc.

---

## Non-TDD artifacts (owner sign-off required, no failing test possible)

These are real production requirements from the gap analysis that cannot be expressed as a failing
unit test. They get a checklist and a human acceptance record instead.

| Artifact | Acceptance method | Owner decision |
|---|---|---|
| Art pack (sprites, tiles, icons, favicon, PWA icons) | Visual review against `screenshots/`; pack contract test for file/size agreement; browser check that every texture loads and is cached offline | Which pack; licensing |
| Audio assets (SFX) | Human listen test; mute verified by P11 adapter test | Whether sound ships at all |
| Marketing / store copy, privacy note (localStorage + any analytics) | Human review; legal if analytics is added | Whether analytics ships |
| Economy target numbers (P12) | Approved in this plan; changing them is an explicit edit | Approved as proposed — implemented by owner instruction ("implement P12 so pacing is defended by tests"); the four windows, the 4h first-prestige bound, and the 24h offline cap shipped as written |
| Monetization | Spec §13 says out of scope for v1. Do not add ads/IAP without a new spec. | Explicitly re-scope if desired |

For each artifact delivered, append a one-line acceptance note (who approved, when, evidence path).

**Art pack — accepted.** The owner chose an *in-house authored* pack rather than a vendored CC0 one,
and asked for it to reach the in-game shaft as well as the app icons (owner instruction:
"Replace the placeholder PWA icons with a real cohesive art pack", answered as *author it in-house*
and *icons plus in-game shaft art*). Delivered 2026-09-20: ten in-game textures plus five icon files,
rendered by `scripts/generate-art.mjs`, contract-tested by `tests/data/artPack.test.js`, load-tested
by `scripts/browser-smoke.mjs`, and captured for review at `screenshots/shaft.png`. No third-party
assets and therefore no attribution obligation; the CC0-pack decision is closed as *not taken*.
The art's acceptance is still a human judgement of `screenshots/shaft.png`, which no test replaces —
and that review immediately earned its keep: decoding the screenshot (`scripts/review-screenshot.mjs`)
showed the rail texture scaled to fill the shaft height, turning its 32-pixel ladder into one
66-pixel wooden block. Fixed by leaving the rail at its natural vertical scale, with a test in
`tests/scenes/shaftVisual.test.js` so it cannot silently return.

---

## Deferred / explicitly not in this plan
- Accounts and cross-device sync — spec §13, needs a backend and a new spec.
- Leaderboards / multiplayer — spec §13.
- Physics digging animation — spec §13.
- Localization — worth doing eventually; not required for "production-worthy" and needs its own plan.
- Ads / IAP — out of scope unless the owner re-scopes.

---

## Phase completion ledger (fill in as phases complete)

| Phase | Deliverable | Status | Tests added | Evidence |
|---|---|---|---|---|
| P0 | Production gate | complete | 0 (tooling) | Evidence block P0 |
| P1 | Save schema v2 | complete | +18 | Evidence block P1 |
| P2 | Magnitude abstraction | complete (with P13) | +11 | Evidence block P2 |
| P3 | Prestige upgrade tree | complete | +22 | Evidence block P3 |
| P4 | Automation | complete | +15 | Evidence block P4 |
| P5 | Achievements | complete | +14 | Evidence block P5 |
| P6 | Settings + notation + safe reset | complete | +20 | Evidence block P6 |
| P7 | Accessibility | complete | +12 | Evidence block P7 |
| P8 | PWA | complete | +12 | Evidence block P8 |
| P9 | Game-feel + UX polish | pending | — | — |
| P10 | Onboarding | pending | — | — |
| P11 | Audio | pending | — | — |
| P12 | Economy rebalance | complete | +14 | Evidence block P12 |
| P13 | Big-number swap | complete | +6 | Evidence block P13 |
| P14 | Cross-browser/soak/perf | pending | — | — |
| P15 | Resilience/diagnostics | pending | — | — |
| — | Art pack (non-TDD track) | complete | +10 (pack contract) | Acceptance note below |

---

## Evidence block template (append one per task/phase)

```text
### Phase 0 — task: one-command production gate
RED:    npm run gate
        npm error Missing script: "gate"
GREEN:  npm run gate → Unit tests PASS 2.9s; Production build PASS 1.1s;
        Browser smoke + events PASS 48.3s (58/58 smoke + 7/7 event);
        Browser responsive layout PASS 9.0s (49/49). "Production gate passed."
MUTATION: flipped an expected value in tests/core/numberFormat.test.js (`'1K'` -> `'1X'`)
        -> gate failed at the Unit tests step, printed the summary, and exited 1 (reverted).
DEFECTS FOUND: none.
FILES:  scripts/gate.mjs (new), package.json (gate script), scripts/AGENTS.md.
DOX:    scripts/AGENTS.md updated.

### Phase 1 — task: durable save schema v2
RED:    npm test -- --run tests/core/state.test.js tests/core/saveTransfer.test.js tests/platform/storage.test.js
        `TypeError: storage.loadBackup is not a function`; `expected null not to be null`
        (backup slot); migrateSave returned a bare state instead of an outcome.
        15 failed | 21 passed.
GREEN:  42 focused tests pass; full suite 404 pass (29 files); build clean;
        npm run test:browser:smoke 58/58.
MUTATION: (a) removed the backup write from storage.save -> 2 backup tests failed.
        (b) disabled the future-version guard in migrateSave -> 2 refusal tests failed (both reverted).
DEFECTS FOUND: none beyond the intentional RED.
FILES:  src/core/state.js (migrations, outcome API, settings sanitizer), src/core/saveTransfer.js (new),
        src/platform/storage.js (loadResult/backup/hasSave), src/data/config.js (schemaVersion 2, backupKey),
        src/main.js (outcome load + recovery toasts or the fresh-start path).
DOX:    src/core/AGENTS.md, src/platform/AGENTS.md, docs/implementation-status.md.

### Phase 2 + 13 — task: magnitude seam with an arbitrary-precision backend
RED:    npx vitest --run tests/core/numbers/magnitude.test.js
        module `src/core/numbers/magnitude.js` did not exist (import failure).
GREEN:  11 magnitude tests pass; the whole suite still passes unchanged (415 at that point) with
        float values untouched, then 420 after the P13 overflow tests.
MUTATION: (a) removing the big fallback in `binary` -> 2 beyond-float tests failed.
        (b) making `normalize` always return a number -> 7 overflow tests failed (both reverted).
DEFECTS FOUND: `new Decimal('lots')` coerces to 0, so string parsing needed an explicit numeric
        guard; caught by `from returns null for values that are not numeric`.
FILES:  src/core/numbers/magnitude.js (new), src/core/numbers/bigMagnitude.js (new),
        src/core/{resources,drills,production,drops,workers,prestige,depth,state,numberFormat}.js
        routed through `M`, src/ui/{shopPanel,depthPanel}.js, src/main.js,
        src/data/config.js (`numbers.implementation`), package.json (break_eternity.js).
DOX:    src/core/AGENTS.md, src/data/AGENTS.md, docs/implementation-status.md.

### Phase 3 — task: prestige points and an upgrade tree
RED:    npx vitest --run tests/core/prestigeUpgrades.test.js tests/ui/prestigePanel.test.js
        failed to load `src/data/prestigeUpgrades.js` and `src/core/prestigeUpgrades.js`
        (modules did not exist).
GREEN:  focused 12 core + 4 jsdom tests pass; full suite 436 pass (32 files); build clean.
MUTATION: (a) flattened the upgrade cost curve -> curve test failed.
        (b) let `performPrestige` set points instead of adding them -> preserve test failed.
        (c) dropped the rare-chance branch -> rare-find test failed (all reverted).
DEFECTS FOUND: none beyond the intentional RED.
FILES:  src/data/prestigeUpgrades.js (new), src/core/prestigeUpgrades.js (new),
        src/ui/prestigePanel.js (new), src/core/{prestige,state,production,drops,offline}.js,
        src/ui/prestigeModal.js, src/main.js, src/data/config.js (prestige points curve).
DOX:    src/core/AGENTS.md, src/data/AGENTS.md, src/ui/AGENTS.md, docs/implementation-status.md.

### Phase 4 — task: prestige-gated automation
RED:    npx vitest --run tests/core/automation.test.js
        failed to load `src/core/automation.js` and `src/data/automation.js` (modules did not exist).
GREEN:  12 core + 3 jsdom toggle tests pass; full suite 451 pass (33 files); build clean.
MUTATION: (a) removed the auto-buy safety bound -> safety-bound test failed.
        (b) doubled the auto-sell reported value -> auto-sell test failed (both reverted).
        (c) removing the auto-buy affordability pre-filter was NOT caught, and that is expected:
            `buyDrill` itself enforces affordability, so the filter is defence in depth with no
            observable state difference. Recorded rather than papered over.
DEFECTS FOUND: the first safety-bound test used 1e9 currency, at which the 500-unit cost curve
        already blocked the purchase, so the bound was unobservable; the test now uses 1e40 so the
        bound is the binding constraint.
FILES:  src/data/automation.js (new), src/core/automation.js (new),
        src/core/{state,offline}.js, src/ui/prestigePanel.js, src/main.js,
        src/data/prestigeUpgrades.js (3 unlock upgrades + `effect: null`), src/data/config.js.
DOX:    src/core/AGENTS.md, src/data/AGENTS.md, docs/implementation-status.md.

### Phase 5 — task: career achievements and milestones
RED:    npx vitest --run tests/core/achievements.test.js tests/data/achievements.test.js tests/ui/achievementsPanel.test.js
        `Cannot find module '../../src/core/achievements.js'` / `src/ui/achievementsPanel.js`.
GREEN:  14 focused tests pass; full suite 465 pass (36 files); build clean.
MUTATION: removed the already-earned guard -> idempotence test failed (reverted).
DEFECTS FOUND: none beyond the intentional RED.
FILES:  src/data/achievements.js (new), src/core/achievements.js (new),
        src/ui/achievementsPanel.js (new), src/core/state.js, src/main.js.
DOX:    src/core/AGENTS.md, src/data/AGENTS.md, src/ui/AGENTS.md, docs/implementation-status.md.

### Phase 6 — task: settings, notation, and safe destructive actions
RED:    npx vitest --run tests/core/settings.test.js tests/ui/settingsPanel.test.js
        `Cannot find module '../../src/core/settings.js'` / `src/ui/settingsPanel.js`;
        `expected '1.23K' to be '1.23e3'` for the new notation branches.
GREEN:  focused settings/notation/panel/HUD tests pass; full suite 485 pass (38 files); build clean.
MUTATION: (a) made `normalizeSettings` pass values through unchecked -> normalization test failed.
        (b) made the confirm modal dispatch on open -> two destructive-action tests failed (both reverted).
DEFECTS FOUND: none beyond the intentional RED.
FILES:  src/core/settings.js (new), src/ui/settingsPanel.js (new), src/ui/confirmModal.js (new),
        src/core/{state,numberFormat}.js, src/ui/{hud,shopPanel,depthPanel,workerPanel,prestigeModal,prestigePanel,achievementsPanel}.js,
        src/main.js (setSetting/resetGame/importSave + root classes).
DOX:    src/core/AGENTS.md, src/ui/AGENTS.md, docs/implementation-status.md.

### Phase 7 — task: keyboard, focus, and motion accessibility
RED:    npx vitest --run tests/ui/a11y.test.js tests/ui/reducedMotion.test.js tests/ui/liveRegion.test.js
        8 failures: no Mine control, no aria-labelledby/focus trap, missing `src/ui/liveRegion.js`,
        no reduced-motion rule.
GREEN:  12 focused tests pass; full suite 497 pass (41 files); `npm run gate` green
        (58/58 smoke + 7/7 event, 49/49 responsive).
MUTATION: (a) made the focus trap find no focusable elements -> 2 tab-wrapping tests failed.
        (b) removed the depth-crossing branch from the announcer -> live-region test failed (both reverted).
DEFECTS FOUND: the trap originally recorded its opener *after* moving focus, so release restored
        focus to the dialog's own cancel button; fixed by trapping before `cancel.focus()`.
FILES:  src/ui/focusTrap.js (new), src/ui/liveRegion.js (new), src/ui/hud.js (Mine button),
        src/ui/{prestigeModal,confirmModal}.js, src/ui/styles.css, src/main.js.
DOX:    src/ui/AGENTS.md, tests/AGENTS.md, docs/implementation-status.md.

### Phase 12 — task: a simulation-backed economy rebalance
RED:    npx vitest --run tests/core/simulation.test.js
        `Cannot find module '../../src/core/simulation.js'` (all 14 tests uncollected).
        `node scripts/economy-report.mjs` -> `ERR_MODULE_NOT_FOUND`.
        Restarted the phase from RED on purpose: the simulator had been written during tuning, and
        the plan's Iron Law does not allow keeping implementation written before its test.
GREEN:  14 focused tests pass; full suite 511 pass (42 files); `npm run gate` green
        (58/58 smoke + 7/7 event, 49/49 responsive).
MUTATION: (a) flattened the depth ladder (growth 300 -> 20) -> 4 tests failed, including the
            offline-share bound at 87.6%.
        (b) removed the tap budget in the opening -> the sell-only monotonicity test failed.
        (c) made the balanced strategy dig immediately (reserve 1.5 -> 1.0) -> the ordering test
            failed, which is why that assertion is strict rather than >=.
        (d) raised the offline cap 24h -> 240h -> the offline-share test failed, but only after it
            was fixed: it had derived "a day" from the cap itself, so it could not see a cap
            change. It now compares against a fixed 24h day and pins the cap.
        (e) dropped `totalDrills` from the sampled curve -> 2 tests failed (all reverted).
DEFECTS FOUND: the browser smoke scenario hardcoded `currency: 5_000_000`; the retuned ladder
        outgrew it and the scripted run failed short of the deepest tier (`Deep Gallery`). The
        seeded currency is now derived from `depthTierCost()`. Also: the tuned value ladder was
        tuned against a simulator that tapped without a rate limit, which made the opening free
        money; the opening is now bounded by `config.simulation.manualTapsPerSecond`.
FILES:  src/core/simulation.js (new), scripts/economy-report.mjs (new),
        tests/core/simulation.test.js (new), src/data/config.js (rebalance + `simulation.*`),
        tests/core/depth.test.js (reads the ladder from data instead of restating 500),
        scripts/browser-smoke.mjs (seeded currency derived from data).
DOX:    src/core/AGENTS.md, src/data/AGENTS.md, scripts/AGENTS.md,
        docs/implementation-status.md (approved targets + measured table).
NOTE:   The approved windows are now: Depth 2 10-20m, Depth 3 1-2h, Depth 4 4-8h, Depth 5 24-48h,
        first prestige within 4h, offline at the 24h cap <=50% of a day of active play. Both
        reference strategies land inside every window (greedy 10.9m/65.6m/5.54h/28.87h, balanced
        14.8m/93.8m/7.82h/41.22h), which is the point of having two lines.

### Phase 8 — task: installable PWA with an offline app shell
RED:    npm test -- --run tests/ui/pwaManifest.test.js tests/platform/serviceWorker.test.js
        `Error: Cannot find module '../../src/platform/serviceWorker.js' imported from
        tests/platform/serviceWorker.test.js`;
        `Error: ENOENT: no such file or directory, open '.../public/manifest.webmanifest'`
        (0 tests collected in both files).
GREEN:  12 focused tests pass; full suite 523 pass (44 files); `npm run gate` green
        (58/58 smoke + 7/7 event, 49/49 responsive, 8/8 pwa).
MUTATION: (a) replaced the adapter's `catch` with `throw error` -> the two structured-failure tests
            failed (reverted).
        (b) removed `caches.delete` from the worker's activate handler -> the superseded-cache test
            failed (reverted).
DEFECTS FOUND: the offline reload rendered the shell document but failed to load the hashed JS and
        CSS, so the game never booted — while the cache clearly held both under exactly the
        requested URLs. Cause: the preview server tags the shell with `Vary: Origin`, while an entry
        filled by `cache.add()` carries no `Origin`; a `crossorigin` script or stylesheet request
        does send one, so a header-sensitive `caches.match(request)` missed the entry that was
        sitting in the cache. The shell lookup now passes `ignoreVary` (safe because the handler
        only serves same-origin requests), and the offline failure detail now names every failed
        request URL. Also: the first version of the "derives its cache list" test pinned
        `script[src]` / `link[href]` selector syntax, which a worker cannot use (no `DOMParser`);
        that test was the defective one, and it now asserts the honest contract instead — the worker
        reads the built HTML text and hardcodes no hashed asset name.
FILES:  public/manifest.webmanifest (new), public/sw.js (new), public/icons/{icon-192,icon-512,
        icon-maskable-512}.png (new, generated), src/platform/serviceWorker.js (new),
        scripts/browser-pwa.mjs (new), scripts/generate-icons.mjs (new), index.html,
        src/main.js (registration), src/data/config.js (`pwa.*`), package.json (`test:browser:pwa`),
        scripts/gate.mjs (PWA step), tests/ui/pwaManifest.test.js (new),
        tests/platform/serviceWorker.test.js (new).
DOX:    src/platform/AGENTS.md, src/data/AGENTS.md, scripts/AGENTS.md, tests/AGENTS.md,
        docs/implementation-status.md (ledger + P8 entry + next-phase note).
NOTE:   The icons are deterministic placeholders produced by `scripts/generate-icons.mjs`, not a
        signed-off CC0 pack. Sourcing that pack stays an owner decision on the non-TDD art track,
        and the generator retires when it lands.

### Phase N — task: <behavior name>
RED:    npm test -- --run tests/<area>/<file>.test.js
        <exact failure line pasted here>
GREEN:  <N> focused tests pass; full suite <N+> pass; build clean.
MUTATION: <mutation applied> -> <test that failed> (reverted)
DEFECTS FOUND: <if any, and which test caught it>
FILES:  <created/modified>
DOX:    <AGENTS.md files + status doc updated>
```

---

## Definition of Done (applies to every phase)

- [ ] Every new function/behavior had a test written first, and that test was observed failing for
      the expected reason.
- [ ] Every test that passed on the first GREEN was mutation-checked, or its exemption stated.
- [ ] Focused tests pass; full suite passes; output pristine.
- [ ] `npm run build` succeeds.
- [ ] `npm run test:browser` (and `:responsive` / `:pwa` when relevant) passes.
- [ ] No new raw arithmetic on currency in `core/` (use the magnitude abstraction).
- [ ] No tuning constants outside `src/data/`.
- [ ] Core commands still return structured results; refusals leave state byte-for-byte unchanged and
      are covered by a test.
- [ ] DOX pass complete; evidence block and ledger appended.
- [ ] Committed at a phase boundary.

Can't check every box? The phase is not done. Do not move to the next phase.
