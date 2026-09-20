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
- `browser-pwa.mjs` builds and serves the production bundle, waits for the service worker to reach
  the active state, fetches and parses the manifest, asserts every art file named by
  `art/pack.json` is in the cache, then **takes the network away and reloads** to prove the cached
  app shell still renders the game.
- `generate-art.mjs` renders the whole art pack — shaft tiles, rail, mineral sprites, drill marker,
  and the install icons — deterministically (same command, same bytes) and emits `art/pack.json` for
  the service worker. It is the one script here that is not a verification gate: its output is
  committed. It reads its key list from `src/data/artPack.js` and its colours from
  `src/data/artPalette.js`, so it cannot render art the pack does not declare, and it throws on a
  key with no recipe rather than skipping it.
- `review-screenshot.mjs` decodes a PNG (8-bit, non-interlaced) and prints a contrast-normalised
  luminance map plus colour statistics, optionally for a `--crop`. It is how a rendered
  `screenshots/*.png` is actually read: a screenshot is for human review, but composition and
  "this region is flat colour" are checkable without eyes. It found the stretched rail tile. It is
  a review aid, not a gate.
- `generate-art.mjs --preview=<key|file>` prints a contrast-normalised luminance map of one asset.
  Art is judged by eye and the terminal is the only eye available while authoring; the report line
  (`coverage`, `colours`, `contrast`) is what distinguishes "textured" from "flat colour once
  stretched".
- `browser-responsive.mjs` boots the production bundle at eight viewports — small phone through
  wide desktop, including landscape — and measures each one: horizontal overflow, clipped labels,
  touch-target size, stacked versus side-by-side layout, and card width. It writes one screenshot
  per representative size for human review.
- `economy-report.mjs` prints the milestone times and progress curve produced by the deterministic
  simulation against the real `src/data/` values, for human review of a retune. It is a report, not
  a gate: it always exits 0. Run it after any pacing change.

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
- **Seed browser scenarios from `src/data/`, never from a hardcoded value.** The smoke scenario's
  rich save originally pinned `currency: 5_000_000`; a pacing retune raised the depth ladder past
  it, so the scripted run stopped short of the deepest tier and the gate failed on the game's own
  balance change. `browser-smoke.mjs` now derives its seeded currency from `depthTierCost()`.
- Scripts here are verification only. They never ship in `dist/`. Reading `src/data/` for a tuning
  value is expected; importing runtime behaviour for an assertion is not.
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
- `browser-smoke.mjs` writes `screenshots/shaft.png` for visual review. Canvas rendering is not
  asserted pixel-by-pixel, so a human has to look at it — and `review-screenshot.mjs` is the reader
  that makes looking possible from a terminal. That review is not optional: it is what caught the
  rail tile being stretched 9.4× instead of repeating, which no assertion in this directory covered.

## Local Contracts (continued)
- **A service worker's install must cache what the page fetches at runtime, not only what the HTML
  names.** The art pack is loaded by Phaser at boot, so a worker that read `index.html` alone left
  the shaft blank offline — the failure looked like "the offline page rendered but two requests
  failed", with no hint that the missing files were art. The worker now reads `art/pack.json` and
  the web app manifest, and `browser-pwa.mjs` asserts the pack is cached against that manifest.
- **Wait for a lifecycle transition; do not sample it.** The worker now fetches the whole pack
  during install, which made `ready.active.state` still read `activating` at the moment the check
  ran. The check waits on `statechange` and `controllerchange` instead of reading state once.
- **A service worker's cache lookup must ignore `Vary`.** The preview server tags the shell with
  `Vary: Origin`, while an entry filled by `cache.add()` carries no `Origin`; a `crossorigin`
  script or stylesheet request sends one, so a header-sensitive `caches.match(request)` misses the
  entry that is sitting in the cache and the offline page renders without its JavaScript. This
  failed *only* in the browser run, and only as "two requests failed", which is why
  `browser-pwa.mjs` names every failed request URL in its failure detail.
- **A service worker is a worker: assert on its sources, not on selectors.** There is no
  `DOMParser` in a worker, so the offline check cannot "parse the HTML like a browser" in Vitest;
  `tests/ui/pwaManifest.test.js` asserts against the worker source and the real offline behavior is
  proven in the browser.

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
- `npm run test:browser` runs the smoke, event, responsive, and PWA suites in order and is the gate
  for browser-facing claims.
- `npm run test:browser:smoke`, `:events`, `:responsive`, and `:pwa` run them individually.
- Run `npm run test:browser` after browser wiring, scene, pacing, or persistence changes, and before
  claiming the game boots, is playable, or that events work.

## Child DOX Index
- No narrower durable boundary exists yet.
