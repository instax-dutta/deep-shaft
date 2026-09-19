# Deep Shaft v1 — Executable Implementation Plan

## Goal
- Deliver Deep Shaft as a playable, mobile-first browser idle mine-management game that
  satisfies every in-scope requirement of `mine-idle-spec.md` §2–§12.

## Source specification
- `mine-idle-spec.md` — product requirements. Source of truth for intent; do not silently rewrite.
- `docs/implementation-status.md` — audited starting point (0% playable, docs only).

## Tech stack
- JavaScript ES modules, Phaser 3, Vite, Vitest, static build, `localStorage` persistence.
- No backend, accounts, ads, sound, multiplayer, or physics digging (spec §13).

## Architecture
- `src/core/` — deterministic rules: state, resources, selling, production, drills, offline,
  number formatting, and (later) depth, workers, events, prestige. No Phaser, DOM, or `localStorage`.
- `src/data/` — frozen content definitions plus the single tuning surface `src/data/config.js`.
- `src/platform/` — `localStorage` adapter, injectable clock, autosave, visibility lifecycle.
- `src/scenes/` — Phaser `BootScene` and `GameScene`, plus pure layout geometry in `shaftVisual.js`.
- `src/ui/` — DOM HUD, shop, toasts, and (later) depth, workers, and prestige panels.
- `src/main.js` — composition root: wires data + core + platform + scenes + ui and owns the tick loop.

## Global constraints
- Tests mirror runtime boundaries: `tests/core/`, `tests/data/`, `tests/platform/`, `tests/ui/`, `tests/scenes/`.
- Every behavior follows RED → GREEN → REFACTOR. A phase is not complete until its focused test
  failed first, then passed, and the full suite plus build pass.
- Core commands return structured results: `{ ok: true, ... }` or `{ ok: false, reason: '<machine_reason>' }`.
  Normal validation failures never throw.
- Time and randomness are injected: functions take `elapsedSeconds` or a `random()` source.
- Numbers stay fractional internally; rounding is presentation-only via `formatNumber`.
- Balance constants live only in `src/data/`, never in `core/`, `scenes/`, or `ui/`.
- Scenes and UI dispatch named commands and render snapshots; they never compute economy rules.

## Verification commands
- Focused: `npm test -- --run tests/<file>.test.js`
- Full: `npm test -- --run`
- Watch loop: `npm run test:watch`
- Bundle: `npm run build`

---

## Phase 0 — Project foundation
**Status:** complete

Files: `package.json`, `vite.config.js`, `index.html`, `src/main.js`, `.gitignore`.

Tests: `tests/data/config.test.js` — 7 tests covering the spec §14 tunable decisions.

RED: no `package.json`; `npm test -- --run` failed with `Could not read package.json`.
GREEN: 7 tests pass; `npm run build` emits `dist/`.

## Phase 1 — Core state and save/load skeleton
**Status:** complete

Files: `src/core/state.js`, `src/platform/storage.js`.

Interfaces:
- `createInitialState()`, `isSupportedSave(candidate)`, `migrateSave(candidate)`,
  `serializeState(state)`, `deserializeState(raw)`, `SAVE_SCHEMA_VERSION`
- `createStorage(backend, { key })`, `createLocalStorageBackend(host)`

Tests: `tests/core/state.test.js` (14), `tests/platform/storage.test.js` (11).

Covered behaviors: initial shape, JSON round-trip, malformed JSON returns `null`, unsupported
schema versions return `null`, older saves filled from defaults, unusable numeric fields
replaced, non-array worker rosters replaced, candidate saves never mutated, backend read/write
failures reported structurally, other storage keys untouched.

## Phase 2 — Manual mining, ore, currency, selling
**Status:** complete

Files: `src/data/resources.js`, `src/core/resources.js`, `src/core/state.js` (earnings credit).

Interfaces: `mineManually(state)`, `sellResource(state, id, amount)`, `sellAll(state, id?)`,
`sellValue(id, amount)`, `resourceOfCategory(tier, category)`, `resourcesForTier(tier)`.

Tests: `tests/core/resources.test.js` (20), `tests/data/resources.test.js` (9).

Covered behaviors: mining adds the *active* tier ore, extraction counting, selling converts and
drains inventory, fully drained entries are removed, earnings credited to `stats.totalEarned`
and `prestige.lifetimeEarned`, and `unknown_resource` / `insufficient_resource` / `invalid_amount`
refusals leave state byte-for-byte unchanged. Data tests assert five tiers, three categories per
tier, id/name integrity, probability bounds, and the rarer-is-worth-more / rarer-is-harder curve.

## Phase 3 — Drills, bulk buying, automatic production
**Status:** complete

Files: `src/data/drills.js`, `src/core/drills.js`, `src/core/production.js`.

Interfaces: `drillCost(def, owned, quantity)`, `maxAffordable(def, owned, currency)`,
`buyDrill(state, drillId, mode)`, `productionPerSecond(state)`, `advanceProduction(state, seconds)`.

Tests: `tests/core/drills.test.js` (19), `tests/core/production.test.js` (12),
`tests/data/drills.test.js` (6).

Covered behaviors: exponential cost curve, bulk cost equals sequential cost, `max` buys the
largest affordable quantity, `x10` fails rather than partially buying, tier gating via
`drill_locked`, `insufficient_currency` and `invalid_mode` refusals, production scales with depth
and the prestige multiplier, fractional output is preserved across many small ticks, and
non-finite elapsed time changes nothing.

## Phase 4 — Number formatting
**Status:** complete

Files: `src/core/numberFormat.js`. Tests: `tests/core/numberFormat.test.js` (10).

Covered behaviors: K/M/B/T/Qa suffix chain, rounding promotes into the next suffix
(`999999` → `1M`), trailing zeros trimmed, fractions rounded to two decimals, signs preserved,
and `NaN`/`Infinity` never printed raw.

## Phase 5 — Offline progress
**Status:** complete

Files: `src/core/offline.js`. Tests: `tests/core/offline.test.js` (10).

Covered behaviors: never-saved mines and zero gaps grant nothing, elapsed absence is banked in
one batch, long absences clamp to `config.offline.capSeconds`, caller-supplied caps honored,
future timestamps grant nothing, no drills means no gains, prestige multiplier applies, and a
non-finite clock cannot corrupt the mine.

## Phase 6 — Playable browser shell
**Status:** complete
**Deliverable:** the game boots in a browser and the core loop is playable.

Files: `src/main.js`, `src/ui/dom.js`, `src/ui/hud.js`, `src/ui/shopPanel.js`, `src/ui/toast.js`,
`src/ui/styles.css`, `src/scenes/BootScene.js`, `src/scenes/GameScene.js`,
`src/scenes/shaftVisual.js`, `src/platform/clock.js`, `src/platform/lifecycle.js`.

Interfaces:
- `createHud({ root, dispatch })` → `{ element, render(state) }`
- `createShopPanel({ root, dispatch })` → `{ element, render(state) }`
- `createToast({ root })` → `{ element, show(message, { tone }), clear() }`
- `createClock(readNow?)`, `createLifecycle({ host, document })`
- `shaftLayoutFor(state, viewport, { caveIn, luckyVein })` — pure, Phaser-free

Tests: `tests/ui/hud.test.js` (8), `tests/ui/shopPanel.test.js` (10), `tests/ui/toast.test.js` (8),
`tests/scenes/shaftVisual.test.js` (9), `tests/platform/clock.test.js` (3),
`tests/platform/lifecycle.test.js` (6).

Covered behaviors: HUD renders formatted currency, tier resource, rate, depth, and prestige;
shop renders one row per drill with owned count, formatted unit cost, disabled unaffordable
purchases, disabled-instead-of-hidden locked tiers naming the required depth, and dispatches
`buyDrill` with the drill id and mode; toasts are polite live regions that tag tone and never
stay silent; shaft geometry fills the viewport, stacks shallow-to-deep, colours each tier, and
flags cave-in dimming and lucky-vein glow; the clock is injectable; lifecycle listeners are all
detached by `stop()`.

**Deliberate scope note:** this phase was pulled ahead of depth/workers/events/prestige because
the project contract requires each phase to leave a *playable* increment. The game is now
playable end-to-end for the spec §12 steps 1–4 loop: tap to mine → sell → buy drills → watch
currency climb, with saves, autosave, and offline catch-up.

**Verification limit:** the Phaser scene and canvas rendering are verified by the production
build and the pure layout tests only. No headless browser is available in this environment, so
"boots and renders in a real browser" is an outstanding manual check.

## Phase 7 — Gems and rare minerals
**Status:** complete

Files: `src/core/drops.js`, `src/core/production.js`, `src/ui/hud.js`.

Interfaces:
- `dropChancesFor(state, workerLuck?)` — per-resource chance for the active tier
- `rollExtraction(state, extractions, { random, workerLuck })` — discrete stochastic roll
- `expectedYieldsPerSecond(state, extractionRate, { workerLuck })` — closed form of the same rule
- `extractionRatePerSecond(state)`, `productionPerSecond(state)`

Tests: `tests/core/drops.test.js` (17), plus additions to `tests/core/production.test.js`
and `tests/ui/hud.test.js`.

RED: `src/core/drops.js` did not exist, so every drop assertion failed at import.
GREEN: `rollExtraction` yields ore always, gems and rare minerals on independent rolls, and
never more of a category than there were extractions. Chances are luck-scaled and clamped at
certainty, a broken random source counts as a miss rather than a jackpot, and luck turns a
0.20 roll into a gem that a base 0.12 chance would have missed.

**Design decision:** the live loop and offline catch-up both use `expectedYieldsPerSecond`.
Rolling a 24-hour absence second by second is neither feasible nor desirable, and two parallel
code paths would drift. The stochastic roll exists alongside it as the same rule expressed
per-extraction, with randomness injected so every branch is verifiable.

**HUD consequence:** showing only ore hid the new resources entirely, so the HUD now carries ore,
gems, and rare mineral counters for the active tier, and the headline rate is the extraction
rate (which equals the ore rate, since ore is certain).

## Phase 8 — Depth tiers and Dig Deeper
**Status:** complete

Files: `src/data/depthTiers.js`, `src/core/depth.js`, `src/ui/depthPanel.js`, `src/main.js`.

Interfaces: `digDeeperCost(state)`, `canDigDeeper(state)`, `digDeeper(state)` with
`reason: 'max_depth' | 'insufficient_currency'`, plus `currentTierName(state)` and
`createDepthPanel({ root, dispatch })`.

Tests: `tests/core/depth.test.js` (13), `tests/data/depthTiers.test.js` (7),
`tests/ui/depthPanel.test.js` (10).

RED: `src/data/depthTiers.js` and `src/core/depth.js` did not exist; every assertion failed at import.
GREEN: five sequential tiers named from `Surface Cut` to `Abyssal Core`, tier 1 free, later
unlock costs following the configured growth curve, one tier climbed per purchase, refusals that
leave state untouched, resources from the tier above retained and still sellable, and the drill
ceiling rising with depth (`drill-3` becomes purchasable at tier 3).

**Design decision:** unlocking a tier switches ore, gems, and rare minerals to the new tier's set
while banked resources from the old tier stay sellable, so digging deeper is never a loss.

## Phase 9 — Workers
**Status:** complete

Files: `src/data/workers.js`, `src/core/workers.js`, `src/ui/workerPanel.js`, plus worker-aware
changes in `src/core/production.js` and `src/core/drops.js`.

Interfaces:
- `workersUnlocked(state)`, `hireCost(state)`, `canHireWorker(state)`, `hireWorker(state, { random })`
- `trainCost(worker)`, `trainWorker(state, workerId)`
- `assignWorker(state, workerId, assignment | null)`, `findWorker(state, workerId)`
- `workerEffects(state)` → `{ drillSpeed, categorySpeed, workerLuck }`
- `normalizeWorker(candidate)` for save migration

Tests: `tests/core/workers.test.js` (29), `tests/data/workers.test.js` (6),
`tests/ui/workerPanel.test.js` (15), plus additions to `tests/core/production.test.js` and
`tests/core/drops.test.js`.

RED: `src/core/workers.js` and `src/data/workers.js` did not exist; every assertion failed at import.
GREEN: hiring gated by the lifetime-earnings milestone and a roster cap, exponential hire cost,
names drawn from 400-pool combinations with an injected random source and duplicate retries,
levels raising both stats, and structured refusals (`workers_locked`, `roster_full`,
`insufficient_currency`, `unknown_worker`, `max_level`, `invalid_target`) that leave state untouched.

**Design decision — assignment is the point.** An idle worker contributes nothing. A worker on a
drill lifts that drill's output only; a worker on a resource category lifts that category's yield
only; luck, from every assigned worker, sharpens rare finds. That is what makes the management
layer a decision rather than a flat global buff.

**Bug this phase caught:** `yieldFactorsFor` applied luck to ore as well as gems and rare minerals,
so a lucky worker was silently inflating common output — the spec ties luck to rare-drop chance.
The failing test proved it before the fix.

**HUD consequence:** the HUD showed the abstract *extraction* rate, so putting a worker on ore
changed nothing visible. It now shows actual ore per second, verified in the browser
(`117/s -> 122.85/s` after a +5% worker).

## Phase 10 — Random events
**Status:** complete

Files: `src/data/events.js`, `src/core/events.js`, plus consumption in `src/core/production.js`,
`src/core/state.js`, `src/ui/hud.js`, and `src/main.js`.

Interfaces:
- `createEventState()` → `{ secondsUntilNext, active }`
- `advanceEvents(state, elapsedSeconds, { random })` → `{ ok, triggered, expired }`
- `activeModifiers(state)` → `{ caveIn, luckyVein, productionMultiplier, disabledDrillIds }`
- `eventForTier(kind, depthTier)`, `eventsForTier(depthTier)`

Tests: `tests/core/events.test.js` (25), `tests/data/events.test.js` (10), plus additions to
`tests/core/production.test.js` and `tests/ui/hud.test.js`.

RED: `src/core/events.js` and `src/data/events.js` did not exist.
GREEN: a fresh mine schedules its first interval instead of opening with a punishment, one event
fires per advance at most (so a long frame or a throttled tab cannot produce a burst), cave-ins
stop a bounded number of *owned* drills, lucky veins multiply output for their window, both expire
deterministically and report that they ended, and per-tier weights make deeper shafts less stable.

**Decoupling:** production consumes only the generic `activeModifiers` snapshot — a multiplier and
a list of stopped drills. A third event type needs a definition and a modifier rule, not a change
to any production formula.

**Design decisions:**
- Events never fire during offline catch-up. Punishing a returning player with a cave-in they
  never saw is exactly the kind of silent penalty the spec warns against.
- Active events are *not* restored from a save. A cave-in from the previous session must not still
  be stinging on load, so the schedule restarts fresh.
- Events need a running drill to be eligible. An event that visibly does nothing would be a
  confusing notification for no reason.
- The shaft dim/glow path was already built for this: `GameScene` has always accepted `caveIn` /
  `luckyVein` flags, and `main.js` now feeds it the real modifier snapshot.
- The HUD carries a persistent banner naming each active event and its remaining seconds, because
  a toast alone is easy to miss and a silent penalty feels unfair.

## Phase 11 — Prestige
**Status:** complete

Files: `src/core/prestige.js`, `src/ui/prestigeModal.js`.

Interfaces: `prestigeThreshold()`, `runEarnings(state)`, `prestigeGain(state)`,
`canPrestige(state)`, `prestigeProgress(state)`, `prestigePreview(state)`, `performPrestige(state)`.

Tests: `tests/core/prestige.test.js` (18), `tests/ui/prestigeModal.test.js` (15).

RED: both modules were missing, so the suites failed to resolve at all.

**Two design calls that carry the phase.**

The planned interface took `lifetimeEarned` directly and returned a multiplier. That was replaced
with a state-based `prestigeGain` plus `prestigePreview`, for two reasons. The reward has to be
rejected below a threshold, and a bare formula cannot refuse. And the confirmation UI must not
re-derive the math, or it will eventually disagree with the command it is confirming — so the
modal renders `prestigePreview`, which reads the same rules `performPrestige` applies.

The reward is derived from `stats.totalEarned` (this run, which the reset zeroes) and never
resets or scales `prestige.lifetimeEarned` (all runs). A plain "multiplier from lifetimeEarned"
formula would have been automatic — the number would climb just for playing, which is the exact
failure §10 warns against. Here the multiplier moves only when the player retires a run.

GREEN: the gain scales linearly with how far the run got; the multiplier is permanent and
compounds across cycles; the reset replaces currency, drills, the whole worker roster, inventory,
depth, and active events; lifetime earnings survive; and the modal computes the penalty sentence
before it is applied and focuses "Keep mining" rather than the destructive action.

**Owner decision recorded:** §10 leaves the worker roster to the implementer and flags it as
pacing-changing. Chosen: **full reset, roster cleared.** With one exception, `stats.manualExtractions`
is preserved as a career counter — it is not run progress and gates nothing.

A nice consequence of the full reset: the worker milestone keys off `stats.totalEarned`, so the
crew layer re-locks each cycle without any special-case code.

**Two mutations were run to prove the new tests can fail**, since both suites passed on the first
GREEN:

1. Making the gain a flat bonus (`return multiplierPerScale`) → caught by the scaling test.
2. Letting the reset clobber the multiplier → caught by the compounding test.

**Three harness defects surfaced by the browser checks, none of them in the game.** They are worth
recording because each produced a *false* result rather than a failure:

1. The first run failed "the multiplier survives a reload". `boot()` seeds a save through
   `addInitScript`, which re-runs on *every* navigation, so reloading re-seeded the pre-prestige
   save over the real one. Same class as the earlier offline-timestamp bug, same fix: read persisted
   state from a plain new page instead of reloading a seeded one.
2. A later run failed the storage assertion with what turned out to be the *seeded* page's state.
   All four pages shared one browser context, and therefore one `localStorage`, while each page runs
   its own 15-second autosave — so scenarios were overwriting each other's saves. Each scenario now
   takes its own context from `session.newContext()`.
3. The event suite flaked on "a lucky vein actually doubles output". Two causes: it stopped
   observing as soon as both event *names* appeared, and it read the banner and the rate in separate
   round-trips, letting an event expire in between. The scaled duration was also only ~3 samples
   wide. It now reads both values from one DOM snapshot, keeps observing until both effects are
   demonstrated, and runs at a duration scale that spans many samples. Three consecutive runs pass,
   reporting the doubling explicitly (`0.5/s baseline -> peak 1/s`).

All three are now durable rules in `scripts/AGENTS.md`, since none is specific to prestige.

## Phase 12 — Visual pass
**Status:** complete, with one open owner decision

Files: `src/scenes/shaftVisual.js`, `src/scenes/GameScene.js`, `src/data/depthTiers.js`.

Deliverable: a shaft that reads as real depth progression, plus feedback on every tap.

Tests: additions to `tests/scenes/shaftVisual.test.js` and `tests/data/depthTiers.test.js`.

RED: the layout exposed only flat colour bands — no labels, depth metres, resources, texture, rails,
or marker — so the new `shaftLayoutFor depth storytelling` assertions all failed on `undefined`.
That block is now 12 tests, and the suite stands at 21 tests (`tests/scenes/shaftVisual.test.js`)
with `tests/data/depthTiers.test.js` at 8.

GREEN, all verifiable without a browser:
- each stratum is labelled with its tier name and its depth in metres (0 m → 600 m)
- each stratum lists the ore, gems, and rare minerals found in it, in category order, with colours
- strata darken with depth so the shaft reads as going down at a glance
- rock grain is generated from a hash of the tier, so it is identical every frame instead of
  shimmering, and stays inside its own stratum
- the shaft is lined with a rail down each edge and a surface line at the top
- a marker sits inside the stratum the mine is working
- geometry stays usable on a 1×1 viewport

The scene redraws only when depth, viewport size, or event state changes — not sixty times a
second — and every tap spawns a floating `+1 Coal` and a ring at the tap point.

**Open decision (unchanged):** spec §9 asks for a cohesive CC0 pixel-art pack. The shaft is drawn
with Phaser `Graphics` instead, which keeps the game playable and license-clean, and the art
choice stays with the owner. Depth communication — the part the spec actually asks for — is done.

---

## Browser verification
**Status:** passing

`scripts/browser-smoke.mjs` builds the bundle, serves it, and plays the real game in headless
Chromium at a phone viewport. At the end of this phase `npm run test:browser` reported 35/35 checks.
Coverage has since grown a great deal — see "Browser verification coverage" for the current count:

```text
PASS  Phaser canvas mounts in the shaft
PASS  tapping the shaft mines ore — 20 mined
PASS  selling ore earns currency — currency 20
PASS  buying a drill records ownership
PASS  drills produce without input — 0 -> 0.8
PASS  an unaffordable purchase is disabled, not hidden
PASS  a drill above the current depth is shown but marked locked
PASS  hiding the tab writes a save
PASS  progress survives a reload — currency 5
PASS  the offline report names the real absence of about an hour — 1h 0m
PASS  an hour of absence is banked into the inventory — 1.8K ore
PASS  digging deeper advances the depth — Depth 2
PASS  the new tier has different gems and rare minerals — Amethyst / Silver
PASS  digging unlocks the matching drill tier
PASS  every touch target is at least 44px tall
PASS  the shaft reaches its deepest tier — Abyssal Core
PASS  no JavaScript errors were reported
```

**Bug this found in the harness itself:** backdating `lastSavedAt` and then reloading credited 0s
of offline time, because the unload handler wrote a fresh save over the backdated edit. The check
originally passed anyway on a weak "contains Welcome back" assertion. Backdating now happens in
an init script that runs after the old document unloads and before the app boots, and the
assertion requires the reported absence and the banked ore to be real.

---

## Phase 13 — Mobile-responsive layout pass (spec §12 step 11)
**Status:** complete

Files: `src/ui/styles.css`, `scripts/browser-responsive.mjs`, `tests/ui/responsiveStyles.test.js`.

Deliverable: a layout that holds up from a 320px phone to a 1920px desktop, verified by measurement
rather than by eye, plus a guard against the breakpoint drifting out of sync with its config value.

Tests: `tests/ui/responsiveStyles.test.js` (5), `scripts/browser-responsive.mjs` (49 checks over
eight viewports).

RED: five assertions covering the stylesheet's layout decisions, four of which failed, followed by a
browser sweep that reported **6 real layout defects** at 320px, 820px, and 844px.

**The defect, and why it was invisible until measured.** The HUD showed a resource as two inline
spans — the name and the amount — separated only by `margin-left`. A margin is not a line-break
opportunity, so that pair could neither wrap nor shrink. Combined with the panel column being only
~340px wide while the viewport-derived HUD rule asked for **three** columns of ~106px, the label
spilled out of its card and past the viewport edge:

```text
FAIL  tablet portrait (820x1180) does not scroll sideways — span[data-field=gem-amount] -> 837
FAIL  tablet portrait (820x1180) fits every label inside its box — span.hud__value 122>77
```

Both halves were wrong in the same direction: the columns were derived from the **viewport**, while
the constraint is the width of the **panel column they live in**. That column is 340–560px wide at
*every* side-by-side size, so no viewport breakpoint can express it correctly.

GREEN — four changes, each mapped to a measurement:

| Change | Effect |
|---|---|
| `.hud` uses `repeat(auto-fit, minmax(140px, 1fr))` | column count now follows the column, not the viewport |
| `.hud__value` is a wrapping flex row with `gap` | every resource value has a wrap point; nothing clips |
| `.hud__stat` gets `min-width: 0` | a grid item may shrink below its content instead of overflowing |
| panel column becomes `clamp(340px, 40vw, 560px)` | wide screens give the extra room to the shaft |

Measured result: HUD cards went from a **103–262px** spread to a **141–199px** band at every size,
and at 1920px the panel column stays 560px while the shaft grew from 1085px to 1360px.

The viewport list deliberately includes 320px (where a layout breaks first), 820px and 844px (where
this bug lived), and 1920px (where cards stretched before). A three-device check would have missed
the defect entirely, which is why the sweep is eight.

**The breakpoint was already duplicated.** `config.ui.mobileBreakpointPx` declares the layout
breakpoint, but CSS cannot read a config module, so the media query carries its own copy of `720`.
The stylesheet test now fails if the two disagree. That assertion passed on the first run — it
records an existing invariant rather than new behaviour, and is called out here rather than counted
as a RED.

**Honest limit:** the responsive checks assert geometry, not aesthetics. Whether the layout *looks*
right is left to a human, so the sweep writes `screenshots/layout-{phone,phone-landscape,tablet-portrait,desktop}.png`.

---

## Phase completion ledger
| Phase | Deliverable | Status |
|---|---|---|
| 0 | Project foundation | complete |
| 1 | Core state + save/load skeleton | complete |
| 2 | Mining, ore, currency, selling | complete |
| 3 | Drills, bulk buy, production | complete |
| 4 | Number formatting | complete |
| 5 | Offline progress | complete |
| 6 | Playable browser shell (scenes + UI + composition) | complete |
| 7 | Gems and rare minerals | complete |
| 8 | Depth tiers + Dig Deeper | complete |
| 9 | Workers | complete |
| 10 | Random events | complete |
| 11 | Prestige | complete (owner decision: full worker reset) |
| 12 | Visual pass | complete (procedural art; CC0 pack is an open owner decision) |
| 13 | Mobile-responsive layout pass | complete |

## Progress at hand-off
- 386 Vitest tests passing across 28 files, plus 114 browser checks (58 smoke + 7 events + 49
  responsive), stable across repeated runs.
- **All twelve spec §12 MVP steps are now implemented.**
- `npm run build` produces a servable static bundle; `dist/` serves `index.html`, CSS, and JS with 200s.
- Playable loop: tap the shaft to mine ore, gems, and rare minerals; sell; buy drills in x1/x10/max;
  dig through five depth tiers with new resources and drill ceilings; hire named workers, assign
  each to a drill or resource category, and train them; survive cave-ins and ride lucky veins;
  autosave on an interval and on tab hide, with capped offline catch-up reported on return.
- A depth-reading shaft: labelled strata, metres, resource swatches, rock grain, rails, a working
  marker, and floating `+N` feedback on every tap.
- Retire a run for a permanent multiplier: gained from what that run earned, compounding across
  cycles, with a confirmation that states the full penalty before applying it.
- A layout measured at eight viewports from 320px to 1920px: no sideways scrolling, no clipped
  labels, 44px touch targets, and HUD cards held in a 141–199px band at every size.
- Remaining for a full v1: **the CC0 art pack in (12) only**, which is an owner decision rather
  than outstanding work. Nothing in §2–§13 is unimplemented.

## Browser verification coverage

`npm run test:browser` runs three suites and reports **114 checks** — 58 smoke, 7 event, and 49
responsive. Values that vary run to run (worker names, sample counts) are asserted on their shape,
not hardcoded:

```text
PASS  Phaser canvas mounts in the shaft
PASS  the production build keeps the shipped event pacing (nothing fires early)
PASS  tapping the shaft mines ore — 20 mined
PASS  an unaffordable purchase is disabled, not hidden
PASS  the locked drill says which depth it needs
PASS  the offline report names the real absence of about an hour — 1h 0m
PASS  an hour of absence is banked into the inventory — 1.8K ore
PASS  digging advances the depth, with new ore, gems, and rare minerals
PASS  the new worker is named and starts at level 1
PASS  putting a worker on ore raises ore output — 117/s -> 122.85/s
PASS  training raises the worker level
PASS  the shaft reaches its deepest tier — Abyssal Core
PASS  the reward is promised before it is taken — +5 -> x6
PASS  the confirmation names the full penalty, not just the reward — Resets currency, 7 drills, 1 worker, banked resources, and depth 4 back to the start.
PASS  backing out destroys nothing — Depth 4, currency 2M
PASS  the run is retired back to the surface — Depth 1
PASS  the permanent multiplier is granted and shown — x6
PASS  the reset and the prestige count reached storage, not just memory — {"count":1,"multiplier":6,"currency":0,"drills":0}
PASS  every touch target is at least 44px tall
PASS  no JavaScript errors were reported
```

### Event coverage, solved

Event timing used to be the one thing that could not be browser-verified: the shipped interval is
45–180s, so a check would either wait a minute or need a debug hook shipped as a bundle cheat.

Both problems are gone. `advanceEvents` now takes an injected `intervalRange` and `durationScale`,
and `browser-events.mjs` builds a **verification-only** bundle with those constants swapped in at
build time. In a production build they evaluate to `undefined`, the branch is dead, and nothing
about it ships — guarded two ways:

1. `grep` for `VITE_EVENT` in `dist/assets/*.js` returns nothing.
2. `browser-smoke.mjs` asserts behaviourally that no event fires early under the shipped interval.

The harness build also writes to `dist-harness/`, so it can never overwrite the real `dist/`.
The duration scale is set so each event spans many samples while two events rarely overlap — an
overlap would hide the lucky-vein boost behind a stopped drill.

The event suite seeds exactly one drill, which makes both effects unambiguous to read off the HUD:

```text
PASS  the mine runs at a steady baseline before any event — 0.5/s
PASS  a cave-in reaches the player instead of staying silent
PASS  a cave-in actually stops the drill — rate fell to 0 during a cave-in
PASS  a lucky vein reaches the player
PASS  a lucky vein actually doubles output — 0.5/s baseline -> peak 1/s over 20 samples
PASS  events are announced in a toast, not only in the HUD
PASS  no JavaScript errors were reported
```
