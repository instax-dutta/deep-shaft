# Phaser Scene Contract

## Purpose
- Own Phaser lifecycle, shaft visuals, and the visual shell around the domain engine.

## Ownership
- `BootScene` initializes the app composition.
- `GameScene` renders the mine shaft and coordinates the active simulation view.
- `shaftVisual.js` owns the pure shaft layout geometry: which bands exist, where they sit, and
  how the shaft reads while an event is active.

## Local Contracts
- Scenes do not calculate costs, production, drop rates, save formats, or prestige formulas.
- Scenes consume state snapshots and dispatch named domain commands through the composition layer.
- Scenes receive their `{ dispatch, getState, getModifiers }` context by constructor injection
  from `src/main.js`; they never import the composition layer.
- `shaftVisual.js` must stay Phaser-free so depth layout is testable without a browser.
- The shaft communicates depth and event state clearly at mobile and desktop sizes.

## Work Guidance
- Keep scene methods small and lifecycle-aware.
- Avoid making Phaser objects part of core state or save data.

## Verification
- Use focused scene smoke tests for boot, scene creation, state rendering, and responsive resize handling.
- Verify shaft layout through `shaftLayoutFor` behavior tests in `tests/scenes/shaftVisual.test.js`.
- Run `npm run build` after scene or asset changes; the Phaser bundle is verified by the build, not by tests.

## Child DOX Index
- No narrower durable scene boundary exists yet.
