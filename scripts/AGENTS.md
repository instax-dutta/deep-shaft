# Verification Scripts Contract

## Purpose
- Own standalone verification tooling for boundaries that cannot be exercised inside Vitest.

## Ownership
- `gate.mjs` owns the aggregate production gate: it runs the unit suite, the production build,
  and the browser suites in order, stops at the first failure, and prints a summary table. It is
  the one command every phase must leave green. `npm run gate` runs it.
- `browser-harness.mjs` owns the shared build/serve/launch/report helpers. It keeps the browser
  binary inside `node_modules` and provides one consistent way to run browser checks.
- `browser-smoke.mjs` builds the **production** bundle and plays the real game: mine, sell, buy,
  dig, hire, save, reload, offline catch-up, touch targets, and console errors.
- `browser-events.mjs` builds a **verification-only** bundle with accelerated event pacing and
  drives cave-ins and lucky veins to their visible conclusions.
- `browser-responsive.mjs` boots the production bundle at eight viewports — small phone through
  wide desktop, including landscape — and measures each one: horizontal overflow, clipped labels,
  touch-target size, stacked versus side-by-side layout, and card width. It writes one screenshot
  per representative size for human review.

## Local Contracts
- **One browser context per scenario.** Pages in a context share `localStorage`, and every page
  runs its own autosave loop, so a scenario left open will silently overwrite another scenario's
  save. Take a context from `session.newContext()` per scenario. This bug cost a full debugging
  pass: a prestige assertion read a stale save written by a different page's autosave.
- **Never reload a seeded page to observe what it persisted.** `boot({ save })` registers an init
  script, which re-runs on every navigation and re-seeds the *original* save over the real one. Read
  persisted state from a plain new page in the same context. This has now caused two separate false
  results — an offline check that credited zero seconds, and a prestige check that proved nothing.
- **Read related DOM values from one snapshot.** Two sequential round-trips can straddle a game tick
  and report a combination that never existed, such as an event banner beside an already-restored
  rate.
- **Observe until the effect is demonstrated, not until the event appears.** Event windows are only a
  few samples wide, so a check that stops on the first sighting of an event name will flake. Sample
  until the measured effect is confirmed, and put the measured values in the failure detail so a
  failure is diagnosable rather than cryptic.
- Scripts here are verification only. They never ship in `dist/` and never import runtime code.
- The browser binary stays project-local: the harness sets `PLAYWRIGHT_BROWSERS_PATH=0` before
  Playwright loads, so nothing is downloaded outside the project.
- **Verification-only build constants must be swapped in at build time** via `define`, never read
  from a runtime source such as the URL. A query parameter would be a shipped cheat; a build-time
  constant is eliminated from a production build entirely.
- A verification-only build writes to its own output directory (`dist-harness/`) so it can never
  overwrite the real `dist/`.
- Anyone adding a pacing or debugging override must also keep a check proving the production build
  behaves normally without it. `browser-smoke.mjs` asserts that no event fires early under the
  shipped interval.
- Browser automation complements Vitest rather than replacing it. Gameplay rules still belong in
  `src/core/` with Vitest coverage; this directory only covers what a DOM test cannot reach.
- Assert layout on **measurements**, not on screenshots or assumptions: element rectangles, computed
  layout mode, `scrollWidth` versus `innerWidth`. A screenshot is an artifact for a human, never an
  assertion.
- Include a viewport narrow enough to break a layout and one wide enough to stretch it. The HUD
  overflow only appeared at 820–844px and the stretched cards only at 1920px; a three-device check
  would have missed both.
- Verify the negative space as well as the positive: "does not scroll sideways" and "no label is
  clipped" catch layout regressions that "the panels render" cannot.
- Scripts exit non-zero when any check fails, so they are usable as a gate.
- Checks assert observable player-facing behavior (rendered values, enabled/disabled controls,
  visible notifications) rather than internal state.
- `browser-smoke.mjs` writes `screenshots/shaft.png` for visual review. Canvas rendering cannot be
  asserted pixel-by-pixel without an image decoder, so a human has to look at it.

## Work Guidance
- Add a check whenever a change touches the composition root, Phaser scenes, or persistence.
- Keep reported check names answerable: a failure should name the player-visible promise that broke.
- Verification-only pacing knobs must stay on the slow side of a race: an event window much shorter
  than the sampling interval is untestable, and overlapping events mask each other's effects.
- Prefer a state that makes one check unambiguous over a shared fixture. The event suite seeds
  exactly one drill so a cave-in reads as `0/s` and a lucky vein as a clean doubling.

## Verification
- `npm run gate` runs the complete production gate (unit tests → build → browser suites) in one
  command and exits non-zero on the first failure.
- `npm run test:browser` runs both suites and is the gate for browser-facing claims.
- `npm run test:browser:smoke` and `npm run test:browser:events` run them individually.
- Run `npm run test:browser` after browser wiring, scene, pacing, or persistence changes, and before
  claiming the game boots, is playable, or that events work.

## Child DOX Index
- No narrower durable boundary exists yet.
