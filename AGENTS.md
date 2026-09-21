# Deep Shaft — Project Contract

## Purpose
- Build Deep Shaft, a mobile-first browser idle mine-management game.
- Keep gameplay rules deterministic, data-driven, serializable, and independently testable.

## Ownership
- Root owns project-wide architecture, scope, workflow, quality gates, and the child DOX index.
- `mine-idle-spec.md` is the product source specification.
- `docs/` owns durable design, implementation, and process documentation.
- `src/` owns runtime code.
- `tests/` owns automated verification.

## Local Contracts
- Use JavaScript ES modules with Vite and Phaser 3.
- Use Vitest for all automated tests.
- Keep Phaser and browser APIs at the edges; core gameplay rules must not require a browser or Phaser.
- Keep balancing values in `src/data/` or a central configuration module; do not embed tuning constants in rendering code.
- Preserve the v1 scope: static deployment, localStorage persistence, five depth tiers, no backend, accounts, ads, sound, multiplayer, or physics digging.
- Every gameplay behavior follows RED → GREEN → REFACTOR: write a focused failing test, observe the expected failure, implement the minimum behavior, rerun focused and relevant full tests, then refactor while green.
- Every meaningful change includes a DOX pass for affected ownership, contracts, verification, and indexes.
- Do not claim tests, builds, or requirements are complete without fresh command evidence.

## Work Guidance
- Work phase by phase. Each phase must leave an independently playable or verifiable increment.
- Prefer small pure functions with explicit inputs and outputs over hidden mutable state.
- Inject clock and random-number providers wherever time or randomness affects behavior.
- Use semantic command names and stable serialized state shapes.
- Reject invalid player actions with structured results rather than throwing for normal gameplay validation failures.
- Keep UI copy clear and non-silent for penalties, offline gains, and reset actions.

## Deployment
- `README.md` owns the run, build, and deployment story (Vercel, Netlify, Cloudflare Pages,
  GitHub Pages, Docker, and generic static hosts). Keep deploy targets in sync with
  `tests/deploy/deploy.test.js`, which pins the build command, the output directory, and the
  cache-header decisions as a file contract.

## Verification
- `npm test -- --run` runs the complete Vitest suite.
- `npm run build` verifies the production bundle.
- `npm run test:browser` builds, serves, and plays the game in headless Chromium. Use it for
  anything Vitest cannot reach: Phaser boot, canvas rendering, the real save/offline journey, and
  measured layout across phone, tablet, and desktop viewports.
- `npm run test:watch` is the local TDD loop.
- Phase-specific verification commands are recorded in the implementation plan.

## Child DOX Index
- `docs/AGENTS.md` — durable project documentation and process records.
- `src/AGENTS.md` — runtime source tree and subsystem boundaries.
- `tests/AGENTS.md` — Vitest organization and test-quality rules.
- `scripts/AGENTS.md` — standalone verification tooling that cannot run inside Vitest.
