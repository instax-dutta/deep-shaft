# Runtime Source Contract

## Purpose
- Own the Deep Shaft browser runtime and keep domain, data, platform, rendering, and UI responsibilities separated.

## Ownership
- `core/` owns deterministic game rules and state transitions.
- `data/` owns content definitions and balance configuration.
- `platform/` owns browser APIs such as localStorage, timers, and visibility lifecycle.
- `scenes/` owns Phaser lifecycle and shaft rendering orchestration.
- `ui/` owns DOM-based player controls and presentation.
- `main.js` owns composition and application startup.

## Local Contracts
- `core/` must not import Phaser, DOM globals, or localStorage.
- `data/` exports immutable definitions consumed by core systems.
- `platform/` adapters expose narrow interfaces and are replaceable in tests.
- `scenes/` and `ui/` dispatch domain commands and render state; they do not own economy calculations.
- Runtime state is serializable through the save system and carries a schema version.

## Work Guidance
- Add a domain test before production behavior.
- Use named exports and explicit object shapes.
- Keep command results structured with success/failure and a reason or event payload.

## Verification
- Run focused Vitest tests for changed core behavior.
- Run the full suite after each phase increment.
- Run `npm run build` after browser wiring or asset changes.

## Child DOX Index
- `core/AGENTS.md` — deterministic state and gameplay rules.
- `data/AGENTS.md` — content and balance definitions.
- `platform/AGENTS.md` — browser adapters and lifecycle services.
- `scenes/AGENTS.md` — Phaser scene contracts.
- `ui/AGENTS.md` — responsive DOM UI contracts.
