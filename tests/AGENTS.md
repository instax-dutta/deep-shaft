# Test Contract

## Purpose
- Own automated verification for the Deep Shaft runtime.

## Ownership
- Tests mirror runtime boundaries and verify behavior rather than implementation details.

## Local Contracts
- Vitest is the required test runner.
- Tests use real domain code; mocks are limited to unavoidable browser or clock boundaries.
- Core tests are deterministic and do not depend on Phaser or a live browser.
- Every new behavior starts with a focused failing test and records the expected failure before implementation.
- The default environment is `node`. DOM tests opt in per file with a `// @vitest-environment jsdom`
  docblock on the first line rather than through global config, so jsdom cost is paid only by
  the suites that need it.
- Scene tests cover the pure layout helpers; Phaser scene classes and real rendered layout are
  verified in headless Chromium by `npm run test:browser`, which can boot the canvas.
- Test directories mirror runtime boundaries: `tests/core`, `tests/data`, `tests/platform`,
  `tests/ui`, `tests/scenes`.
- Accessibility contracts are tested in jsdom where possible (`tests/ui/a11y.test.js` for focus
  trapping, `liveRegion.test.js` for announcements) and by reading the stylesheet where jsdom has
  no layout (`reducedMotion.test.js`, alongside `responsiveStyles.test.js`).
- `npm run gate` (see `scripts/AGENTS.md`) runs the unit suite, the build, and the browser suites in
  one command and is the aggregate check every phase leaves green.
- Installability is a file contract plus a browser behavior. `tests/ui/pwaManifest.test.js` reads
  `index.html`, `public/manifest.webmanifest`, and `public/sw.js` with `node:fs` and asserts the
  decisions a browser run cannot report — that the manifest is linked with relative paths, that
  every icon it promises exists at the size its PNG header declares, and that the worker derives its
  cache list from the built shell rather than hardcoding a hashed asset name. Registration,
  activation, and the offline reload are measured in headless Chromium by `npm run test:browser:pwa`.
  `tests/platform/serviceWorker.test.js` covers the adapter's structured outcomes (including an
  unsupported browser and a rejecting `register()`) with a fake host, so no real worker is needed.
- A stylesheet has no runtime to exercise in Vitest, so `tests/ui/responsiveStyles.test.js` asserts
  on the *decisions* in `src/ui/styles.css` — that the CSS breakpoint agrees with
  `config.ui.mobileBreakpointPx`, that the HUD columns follow the panel column, and that a value
  line can wrap — rather than on markup, and never with whole-file snapshots. Actual layout at each
  viewport is measured in the browser, not here.

## Work Guidance
- Use clear behavior names such as `mining adds ore to the active tier inventory`.
- Keep one primary behavior per test.
- Include boundary and invalid-action cases beside happy paths.
- Use test fixtures only for repeated valid state setup, not to hide assertions.

## Verification
- Focused command: `npm test -- --run tests/<file>.test.js`.
- Full command: `npm test -- --run`.
- Build command: `npm run build` when browser wiring is affected.

## Child DOX Index
- No narrower durable test boundary exists yet.
