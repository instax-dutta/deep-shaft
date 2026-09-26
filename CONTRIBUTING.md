# Contributing to Deep Shaft

Thanks for stopping by. Deep Shaft is a small, fully client-side idle game and
contributions are welcome — balance tweaks, bug fixes, accessibility, art, and docs.

## Ground rules

- **v1 scope is frozen:** static site, `localStorage` saves, five depth tiers, no
  backend, accounts, ads, sound-as-requirement, multiplayer, or physics digging.
  (Optional audio already exists as a muted-by-default layer; keep it optional.)
- **Core stays pure:** `src/core/` must not import Phaser, DOM globals, or
  `localStorage`. Keep tuning numbers in `src/data/` or the central config, never
  in rendering code.
- **RED → GREEN → REFACTOR:** add a focused failing Vitest test first, watch it
  fail, implement the minimum, then rerun the suite and refactor while green.
- **Docs with code:** update the affected `AGENTS.md` contract and anyMD
  spec/plan references when behavior changes.

## Setup

```bash
npm install
npm run dev          # Vite dev server
npm run test:watch   # TDD loop
```

No environment variables, API keys, or services are required. There is no
`.env` file — the game runs entirely in the browser.

## Checks before you push

```bash
npm test -- --run    # full Vitest suite (node; jsdom only where a test opts in)
npm run build        # production bundle into dist/
npm run gate         # unit tests + build + headless-Chromium browser suites
```

`npm run gate` is the release gate. Browser suites need Playwright's Chromium
(`npx playwright install chromium` on a fresh machine).

## How to contribute

1. Fork the repo and create a topic branch (`feat/…`, `fix/…`, `docs/…`).
2. Add or update tests under `tests/` mirroring the runtime boundary
   (`core`, `data`, `platform`, `ui`, `scenes`).
3. Keep pull requests small and focused; describe the behavior change, the test
   evidence (`npm test -- --run`, `npm run build`, browser suites if touched),
   and any balance numbers you changed.
4. Be kind. Review feedback is about the code, and small PRs merge faster.

## Reporting bugs / suggesting balance

Open an issue with: what you did, what you expected, what happened, your
browser + viewport, and (if you are comfortable) an exported save from
Settings > Export. Never paste passwords or tokens — saves contain only game
numbers, but keep it to the game anyway.

## Security

Found something that looks like a leaked secret or a genuine vulnerability?
Please open a public issue if it is game logic, or contact the maintainers
privately if it involves credentials. There are no server-side secrets in this
repo by design — no backend exists to hold them.
