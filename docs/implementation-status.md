# Deep Shaft — Implementation Status Audit

## Purpose
- Record what of `mine-idle-spec.md` exists in the repository today, and what remains before Deep Shaft is playable.
- Audience: project owner and implementing agent.

## Next work
- The MVP is complete. Production refinement (durable saves, late-game scale, retention depth,
  accessibility, PWA, pacing) is planned as a TDD-executable sequence in
  `docs/superpowers/plans/v2-production-refinement-plan.md`. Follow it phase by phase; update this
  file's ledger as each phase completes.

## v2 production refinement progress

| Phase | Deliverable | Status |
|---|---|---|
| P0 | One-command production gate (`npm run gate`) | Complete |
| P1 | Durable save schema v2: migrations, outcome loads, export/import, backups | Complete |
| P2 | Magnitude abstraction (behavior-preserving) | Complete (landed with P13) |
| P3 | Prestige upgrade tree | Complete |
| P4 | Automation and QoL unlocks | Complete |
| P5 | Achievements and career stats | Complete |
| P6 | Settings, notation, safe destructive actions | Complete |
| P7 | Accessibility hardening | Complete |
| P8 | PWA and installability | Pending |
| P9 | Game-feel and UX polish | Pending |
| P10 | First-run tutorial | Pending |
| P11 | Audio layer | Pending |
| P12 | Economy simulation and rebalance | Pending |
| P13 | Big-number implementation swap | Complete |
| P14 | Cross-browser, soak, performance QA | Pending |
| P15 | Resilience and diagnostics | Pending |

### P1 — durable saves

`migrateSave` and `deserializeResult` now report structured outcomes instead of returning `null`
for both "no save" and "unreadable save". Version 1 saves migrate through `MIGRATIONS` to schema
version 2, which introduces the `settings` block. `src/core/saveTransfer.js` exports and imports a
save as readable JSON, refusing empty, corrupt, foreign, and future-version input without touching
the current save. The storage adapter keeps a backup slot on every successful write and recovers
the previous save when the primary is unreadable; an unreadable primary is preserved rather than
overwritten.

Evidence: full suite 404 passed (29 files); build clean; `npm run test:browser:smoke` 58/58. The
focused RED was outcome-shaped refusals reporting `{ ok: false, reason }` and missing
`loadBackup`/backup-slot behavior.

### P2 + P13 — magnitude seam and late-game scale

All economy arithmetic on currency, resources, rates, and multipliers now goes through
`src/core/numbers/magnitude.js`. The interface is number-first: values in the float range stay
plain JS numbers, so persisted saves and ordinary gameplay are byte-for-byte unchanged. A value
that would overflow a float is silently promoted to the arbitrary-precision backend in
`bigMagnitude.js` (the only module that imports `break_eternity.js`), and `formatNumber` prints it
as `1e400` rather than `∞`. `config.numbers.implementation` selects the backend.

Evidence: full suite 420 passed (30 files); `npm run gate` green (unit tests, build,
58/58 smoke + 7/7 event, 49/49 responsive).

### P3 — prestige points and an upgrade tree

Prestige now grants a second permanent currency, prestige points, on a curve separate from the
multiplier. Points buy always-on upgrades (Deep Core extraction, Gem Sense, Rare Instinct, Night
Shift offline cap) whose levels survive every reset. `upgradeEffects(state)` is consumed by
production, drops, and offline as a sibling read beside `workerEffects`, so no formula branches on
an individual upgrade. The new `prestigePanel` renders the tree; a maxed or unaffordable row is
disabled and never dispatches.

Evidence: full suite 436 passed (32 files); build clean. Focused RED: the new modules did not
exist. Mutations caught: flat cost curve, reset clearing points, and the rare-chance branch.

### P4 — prestige-gated automation

Three automation kinds (auto-sell, auto-buy, auto-dig) are unlocked by prestige upgrades and
switched on by player toggles in the prestige panel. `runAutomation` executes the same commands a
player issues, so it is refused identically when unaffordable; auto-buy stops at a configured
safety bound. The live tick and offline catch-up both call the same function, so offline
automation is one rule rather than two. A locked toggle is ignored even if a save sets it true.

Evidence: full suite 451 passed (33 files); build clean.

### P5 — career achievements

Ten declarative achievements (`{ stat, gte }`) are evaluated once per tick from a flat stats
snapshot. Evaluation is idempotent, so a goal is announced exactly once; achievements live at the
top level of state and are never cleared by prestige. The `achievementsPanel` shows earned rows and
progress on locked ones, and `main.js` toasts newly earned goals through the panel's injected
announcer.

Evidence: full suite 465 passed (36 files); build clean.

### P6 — settings, notation, and safe destructive actions

Player settings (number notation, reduced motion, sound, haptics) normalize untrusted storage and
are set only through `setSetting`, which refuses unknown keys and invalid values. `formatNumber`
accepts a `notation` option (`suffix` unchanged by default, plus `scientific` and `engineering`),
and every panel passes the configured notation from state. The settings panel exports and imports
saves through the pure transfer functions and resets through a reusable confirm modal that names
the full loss and dispatches nothing until confirmed.

Evidence: full suite 485 passed (38 files); build clean.

### P7 — accessibility hardening

Mining has a real keyboard-focusable Mine button. Modals trap Tab and Shift+Tab, are labelled by
their heading, and restore focus to whatever opened them on close, cancel, or Escape.
`:focus-visible` draws a keyboard-only ring; `prefers-reduced-motion` disables animation and
transition; a polite live region announces milestone transitions (new depth, prestige available,
workers unlocked) once each. The browser smoke's 44px touch-target check also caught the unstyled
upgrade buttons, which now meet the minimum.

Evidence: full suite 497 passed (41 files); `npm run gate` green.

## How this audit was produced
- Compared `mine-idle-spec.md` requirement by requirement against the tracked file tree.
- Ran the project verification commands to distinguish "documented" from "verified".

Commands run at audit time:

```bash
find . -type f -not -path './.git/*' -not -path './node_modules/*' | sort
npm test -- --run
npm run build
```

Observed repository contents (11 files, documentation only):

```text
./AGENTS.md
./docs/AGENTS.md
./docs/superpowers/AGENTS.md
./mine-idle-spec.md
./src/AGENTS.md
./src/core/AGENTS.md
./src/data/AGENTS.md
./src/platform/AGENTS.md
./src/scenes/AGENTS.md
./src/ui/AGENTS.md
./tests/AGENTS.md
```

Observed command results: both `npm test -- --run` and `npm run build` failed with
`Could not read package.json`, because no `package.json` exists.

## Bottom line (audit at start of work)

**Playable completion: 0%.** The repository contained the product specification and the
DOX/ownership contract files only. No runtime source, no test suite, no build system.

This was not a partial implementation to be completed — it was an unimplemented project
with an unusually good set of written contracts. Every capability below was planned and
owned but unbuilt.

> **Superseded:** the foundation, save system, economy, drills, formatting, offline progress,
> drop rolls, depth tiers, workers, random events, and the playable browser shell are now
> implemented and verified. See "Current state after phases 0–10" below. The audit tables
> beneath this section describe the repository as it was found and are kept as the
> starting-point record.

## Current state after all twelve spec §12 steps

The core loop is playable in a browser end to end, verified in a real browser. Every MVP step in
spec §12 is implemented; the only outstanding item is the CC0 art pack, which is an owner decision
rather than unwritten code.

| Capability | State |
|---|---|
| Vite + Phaser 3 + Vitest project foundation | Implemented, builds clean |
| Serializable state with schema version and migration | Implemented |
| `localStorage` save/load with structured failure handling | Implemented |
| Manual mining, ore inventory, selling, currency | Implemented |
| Tiered drills with x1 / x10 / max purchasing | Implemented |
| Automatic production with fractional accumulation | Implemented |
| Big-number formatting used by every displayed value | Implemented |
| Capped offline progress with a visible report | Implemented |
| Phaser shaft rendering with tap-to-mine | Implemented |
| Mobile-first HUD, drill shop, and toast notifications | Implemented |
| Autosave plus save-on-hide/unload | Implemented |
| Gems and rare minerals (drop rolls) | Implemented |
| Depth tiers and Dig Deeper (five tiers) | Implemented |
| Workers (hire, assign, train) | Implemented |
| Random events (cave-in, lucky vein) | Implemented |
| Depth-reading shaft (labelled strata, metres, swatches, texture, rails, marker) | Implemented |
| Responsive layout measured at 8 viewports, 320px to 1920px | Implemented |
| Prestige (run reset for a permanent multiplier, with confirmation) | Implemented |
| Real CC0 visual assets | **Not started** — procedural graphics in use; needs owner sign-off on a pack |

Verification evidence:

```text
npm test -- --run     → 386 passed (28 files)
npm run build         → dist/index.html, dist/assets/index-*.css, dist/assets/index-*.js
npm run test:browser  → 58/58 smoke + 7/7 event + 49/49 responsive checks in headless Chromium
```

The browser run (`scripts/browser-smoke.mjs`) plays the real game at a phone viewport: it taps the
shaft to mine, sells, buys a drill, watches production accumulate, saves on tab-hide, reloads and
confirms persistence, backdates the save to prove an hour of offline production is banked and
reported, then digs from `Surface Cut` to `Abyssal Core` verifying that resources, drill tiers,
and the depth panel all follow. It then hires a worker, confirms the generated name and level 1,
assigns it to ore, confirms the extraction rate rises from `117/s` to `122.85/s`, and trains it to
level 2. A third scenario retires a run for its multiplier. It also asserts every touch target is
at least 44px tall and that no JavaScript errors are raised.

Each scenario runs in its own browser context, because pages in one context share `localStorage`
and every page autosaves — scenarios sharing a context overwrite each other's saves.

The event run (`scripts/browser-events.mjs`) drives a cave-in and a lucky vein to their visible
conclusions in the browser, which the shipped 45–180s interval would otherwise make impractical.
It does this with a verification-only build rather than a runtime switch: `advanceEvents` accepts
injected `intervalRange` and `durationScale` options, and the harness supplies them through
build-time `define` constants. In a production build those constants are `undefined`, the branch
is dead code, and nothing about the harness ships — checked by grepping the bundle for
`VITE_EVENT` and by a smoke check asserting no event fires early under the real pacing.

Prestige is verified in both layers. `tests/core/prestige.test.js` covers eligibility, the scaling
formula, compounding across cycles, the refusal path leaving state untouched, and exactly what the
reset clears; `tests/ui/prestigeModal.test.js` covers the confirm/cancel/Escape paths and the
penalty copy. The browser run seeds a save whose run has earned 20M, asserts the promise (`+5`,
`x6`) before it is taken, that the confirmation names the penalty in full, that backing out
destroys nothing, that confirming returns the mine to Depth 1 with no drills or crew, and that the
multiplier and count reach `localStorage` rather than only memory.

Responsive layout is verified by measurement, not by eye. `scripts/browser-responsive.mjs` boots the
production bundle at eight viewports — 320px phone, 390, 430, landscape 844×390, tablet portrait,
tablet landscape, 1440, and 1920 — and at each one asserts there is no horizontal scrolling, no
element crosses the viewport edge, no label is clipped inside its own box, every touch target is at
least 44px tall, the stacked-versus-side-by-side layout matches the configured breakpoint, and no
card stretches past 560px. That sweep found six real defects at 320px, 820px, and 844px, all from
one cause: the HUD derived its column count from the *viewport* while the actual constraint is the
width of the panel column it sits in. HUD cards now measure 141–199px at every size, against a
103–262px spread before.

Visual depth progression is verified two ways. `tests/scenes/shaftVisual.test.js` asserts the
geometry — labels, metres, resource swatches, deterministic rock texture, rails, marker, and
degradation on a 1×1 viewport — and `screenshots/shaft.png` is captured for human review, because
pixels cannot be asserted without an image decoder.

## Status by spec area (as-found, kept as the starting-point record)

Every row below reads "Not built" because this table records the repository as it was audited, not
as it stands now. For the current state, see the table above.

| Spec area | Requirement | Status |
|---|---|---|
| §1 Tech stack | Vite + Phaser 3 + ES modules | Not built |
| §1 Structure | System-per-concern modules | Contract declared in `src/AGENTS.md`; no modules exist |
| §2 Core loop | Click → currency → drills → workers → depth → events → prestige | Not built |
| §3 Resources | Ore / gems / rare minerals per tier with separate sell curves | Not built |
| §4 Drills | Tiered drills, exponential cost, x1/x10/max bulk buy | Not built |
| §5 Workers | Named workers, speed/luck, assignment, leveling, hire curve | Not built |
| §6 Depth | Dig Deeper purchase, higher ceiling, shaft update | Not built |
| §7 Events | Cave-in and lucky vein on weighted timers | Not built |
| §8 Number format | Abbreviated big-number display used everywhere | Not built |
| §9 Visuals | Depth-communicating shaft, CC0 pack, responsive UI | Not built |
| §10 Prestige | Threshold, reset, permanent run-scaled multiplier | Not built |
| §11 Save system | localStorage key, full state, offline batch, autosave | Not built |
| §12 MVP order | 12 sequential playable steps | None started |
| §13 Out of scope | No ads/backend/multitplayer/sound/physics | No violations — nothing exists |
| — | (superseded) all of the above except the CC0 art pack | Implemented — see the current-state table above |
| §14 Open config | Central tunable config object | Not built |

Documentation completeness, in contrast, is high: product spec, root project contract,
and per-boundary DOX contracts for `core`, `data`, `platform`, `scenes`, `ui`, and
`tests` all exist and are mutually consistent.

## What "playable" requires

A defensible definition of playable for v1, derived from spec §2 and §12:

1. `index.html` boots a Phaser app in a browser with no console errors.
2. Player taps the shaft and receives ore.
3. Player sells ore for currency and sees a formatted total.
4. Player buys drills in x1/x10/max quantities with visible cost scaling.
5. Drills produce resources over time without further input.
6. Closing the tab and returning grants capped offline production with a visible message.
7. Player digs to deeper tiers with new resource names and better drills.
8. The layout is usable on a phone viewport with large touch targets.

Steps 5–8 of spec §12 (offline, gems/rare minerals, depth tiers, workers) plus events
and prestige are required before the game is complete as intended, but steps 1–4 are the
first state that can honestly be called playable.

## Known gaps that were previously invisible

- The spec's suggested structure uses `src/systems/`; the DOX contract in `src/AGENTS.md`
  instead names `src/core/`. Those must not both exist. **Decision: `src/core/` wins**,
  because it is the durable boundary contract and carries the "no Phaser/DOM/localStorage"
  rule that makes gameplay testable.
- The spec asks for a CC0 pixel-art asset pack. Nothing in the repository vendors one, and
  sourcing art is a licensing decision. **Decision: ship Phaser `Graphics`-drawn
  procedural visuals for now**, so the game is playable without an asset-licensing
  dependency. Real art is deferred to the visual pass and needs owner sign-off on a pack.
- Spec §14 leaves six values open (cost growth, worker milestone, event weights, offline
  cap, prestige formula, tier count). **Decision: `src/data/config.js` is the single
  tuning surface.** v1 target is five depth tiers per `src/data/AGENTS.md`.

## Verification status at audit time

| Command | Result at audit time |
|---|---|
| `npm test -- --run` | Failed — no `package.json` |
| `npm run build` | Failed — no `package.json` |
| `npm run test:watch` | Failed — no `package.json` |

No behavior could be called verified while these commands failed. The implementation plan in
`docs/superpowers/plans/v1-implementation-plan.md` treats both as required gates per phase.
