# Phaser Scene Contract

## Purpose
- Own Phaser lifecycle, shaft visuals, and the visual shell around the domain engine.

## Ownership
- `BootScene` preloads the art pack and initializes the app composition.
- `GameScene` renders the mine shaft and coordinates the active simulation view.
- `shaftVisual.js` owns the pure shaft layout: which bands exist, where they sit, which art key
  each one uses, where its mineral sprites go, and how the shaft reads while an event is active.

## Local Contracts
- Scenes do not calculate costs, production, drop rates, save formats, or prestige formulas.
- Scenes consume state snapshots and dispatch named domain commands through the composition layer.
- Scenes receive their `{ dispatch, getState, getModifiers }` context by constructor injection
  from `src/main.js`; they never import the composition layer.
- `shaftVisual.js` must stay Phaser-free so depth layout is testable without a browser.
- The shaft is drawn from the art pack, never from inline drawing code. Every texture key comes
  from `data/artPack.js` and every colour from `data/artPalette.js`; the scene decides z-order,
  tinting, and text, but it never names an art file or invents a colour.
- `shaftVisual.js` decides art *placement*, never artwork: it returns `textureKey` plus
  `tileScaleX`/`tileScaleY` for bands and rails, a `minerals` list of tinted sprite placements, and
  a `marker` sprite position. The scene turns those into `TileSprite`/`Image` objects.
- Layer order is explicit via `DEPTH` in `GameScene` (strata → minerals → marker → rails →
  overlay → labels). Art is destroyed and rebuilt on a layout change rather than reconciled,
  because the layout only changes when depth, size, or an event changes.
- `BootScene` loads exactly `artLoadList()` from `data/artPack.js`. A missing file surfaces as
  Phaser's missing-texture placeholder and a console error, which the browser smoke run treats as
  a failure.
- The shaft communicates depth and event state clearly at mobile and desktop sizes.

## Work Guidance
- Keep scene methods small and lifecycle-aware.
- Avoid making Phaser objects part of core state or save data.

## Verification
- Use focused scene smoke tests for boot, scene creation, state rendering, and responsive resize handling.
- Verify shaft layout through `shaftLayoutFor` behavior tests in `tests/scenes/shaftVisual.test.js`,
  including that it only ever hands the renderer art keys the pack declares.
- Verify the pack files themselves in `tests/data/artPack.test.js`, and that the boot scene really
  fetched them in `scripts/browser-smoke.mjs`.
- Run `npm run build` after scene or asset changes; the Phaser bundle is verified by the build, not by tests.

## Child DOX Index
- No narrower durable scene boundary exists yet.
