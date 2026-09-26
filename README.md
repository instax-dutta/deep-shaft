# Deep Shaft

[![CI](https://github.com/instax-dutta/deep-shaft/actions/workflows/ci/badge.svg)](https://github.com/instax-dutta/deep-shaft/actions/workflows/ci)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Vite](https://img.shields.io/badge/built%20with-Vite-646CFF.svg)](https://vitejs.dev)
[![Phaser 3](https://img.shields.io/badge/engine-Phaser%203-red.svg)](https://phaser.io)

A mobile-first browser idle mine-management game. Buy drills, hire a named crew,
dig through five depth tiers of ore, gems, and rare minerals, survive cave-ins,
ride lucky veins, automate, and retire runs for permanent multipliers.

**Play it:** https://deepshaft.sdad.pro/ — free, no account, no ads, works offline after first load.

## Why this is fun

- **Real idle loop:** manual digging bootstraps into drills that earn while the tab is closed (offline progress, capped).
- **Management layer:** named workers with speed/luck stats, leveling, and drill assignments.
- **Depth tiers:** five tiers, each with its own ore/gem/rare-mineral set, drill ceiling, and event weights.
- **Drama:** cave-ins (temporary downtime, always announced) vs. lucky veins (temporary boosts).
- **Prestige:** retire a run for a permanent multiplier that scales with how far you got.
- **Quiet by design:** `localStorage` saves only, PWA installable, no backend, no tracking.

## Quick start

Requires Node 22+.

```bash
npm install
npm run dev          # Vite dev server
npm test -- --run    # full Vitest suite
npm run gate         # unit tests + build + every browser suite (the release gate)
```

No environment variables, API keys, or services needed. Clone, install, play.

## How to play

1. Click the shaft to dig ore by hand (first minute only).
2. Buy drills — they auto-produce. Buy x1 / x10 / max.
3. Sell resources for currency, then **Dig Deeper** to unlock the next tier.
4. Hire workers (unlocks at Tier 2), assign them to drills, train them up.
5. Automate sales/upgrades, push for prestige upgrades and achievements.
6. Prestige when progress stalls — come back faster with a permanent multiplier.

Saves autosave every few seconds plus on tab hide/close. Settings has Export/Import
(JSON) for backups and moving between devices.

## Project structure

```
src/
  core/        # deterministic game rules (no Phaser, no DOM, no localStorage)
  data/        # balance + content: tiers, drills, workers, events, art pack
  platform/    # browser adapters: storage, clock, autosave, service worker
  scenes/      # Phaser boot + shaft rendering
  ui/          # DOM HUD, shop, depth, events, prestige, settings
  main.js      # composition + startup
tests/         # Vitest suites mirroring src/ + deploy file contracts
scripts/       # gate, headless-Chromium browser suites, asset generators
docs/          # implementation status, plans, per-boundary contracts
```

Rules to keep it healthy:

- `src/core/` is pure and serializable — inject clock/RNG, return structured
  `{ ok, reason }` results instead of throwing for normal validation failures.
- Balance lives in `src/data/`, never in rendering code.
- Spec: `mine-idle-spec.md`. Contracts: `AGENTS.md` + each folder's `AGENTS.md`.

## Tech

- **Engine:** Phaser 3 + ES modules, built with Vite into a plain static site.
- **Tests:** Vitest (unit) + Playwright headless Chromium (boot, canvas, save/offline journey, responsive/PWA/perf/soak).
- **Persistence:** `localStorage` only — schema-versioned, with backup slot, migrations, and export/import.
- **Installable:** PWA manifest + service worker, boots offline after first load.
- **Numbers:** magnitude abstraction past float range, consistent abbreviated formatting everywhere.

## Testing

```bash
npm test -- --run              # full unit suite (~600 tests)
npm run test:watch             # local TDD loop
npm run build                  # production bundle into dist/
npm run gate                   # the release gate: unit + build + browser suites
npm run test:browser           # Phaser boot, canvas, save/offline in Chromium
npx playwright install chromium  # first run on a fresh machine
```

Browser suites cover smoke, events, responsive (phone/tablet/desktop), shaft
render, PWA/offline, soak, perf, and boot-failure fallback, plus Firefox/WebKit
functional checks via `npm run test:browser:all`.

## Build

```bash
npm run build        # emits dist/ — index.html, hashed assets, manifest, service worker
```

`dist/` is fully self-contained and deployable anywhere that can serve static files over HTTPS
(or localhost — the service worker's offline shell requires a secure context).

## Deploying

The build output is portable; pick whichever target you like.

### Vercel

Zero-config: import the repository and Vercel detects the Vite build. `vercel.json` pins it
explicitly (`npm run build` → `dist/`).

```bash
npx vercel           # or: npx vercel --prod
```

### Netlify

`netlify.toml` in the repository root sets build and publish, plus the cache headers. Deploy via
the dashboard or:

```bash
npx netlify deploy --build --prod
```

### Cloudflare Pages

Dashboard: framework preset **Vite**, build command `npm run build`, output directory `dist`.
No config file needed.

### GitHub Pages

The build uses relative asset paths (`base: './'`), so it works from a project subpath:

```bash
npm run build
# publish dist/ to the gh-pages branch, e.g.:
npx gh-pages --dist dist
```

### Docker

```bash
docker build -t deep-shaft .
docker run --rm -p 8080:8080 deep-shaft
# or: docker compose up --build
```

Multi-stage: node builds the bundle, nginx (listening on 8080) serves it. Hashed assets get
immutable caching; the shell and service worker revalidate so a new build actually ships.

### Any static host

Upload the contents of `dist/` — Apache, Caddy, `python3 -m http.server`, an S3 bucket, a
Raspberry Pi in a closet. Any of them works; only two headers matter:

- `index.html` and `sw.js` should be served with `Cache-Control: no-cache`.
- Hashed `/assets/*` files may be cached forever (`immutable`).

### Android app (APK, no store needed)

The game ships as a Capacitor-wrapped Android app with the whole bundle inside, so it plays
fully offline and installs from a file.

```bash
npm run apk          # web build -> cap sync -> gradle assembleDebug -> releases/deep-shaft.apk
```

Building needs the Android SDK (JDK 17+ plus `platforms;android-36`, `build-tools;36.0.0` via
`sdkmanager`), pointed at by `android/local.properties` (`sdk.dir=...`) — not committed, it is
machine-specific. The generated Android project lives in `android/`.

Share `releases/deep-shaft.apk` directly. On a friend's phone: open the APK (a file manager or
Chrome downloads), accept the one-time "install unknown apps" prompt, done. The debug APK is
self-signed, which is exactly right for sideloading — it only means Play Protect will note that
the signature is unknown, which is expected.

- Saves live in the app's own storage: fresh install = fresh mine, uninstall deletes progress.
  The in-game Settings > Export/Import is the backup path.
- Regenerating the launcher icon/splash: edit `scripts/generate-app-assets.mjs`, run it, then
  `npx @capacitor/assets generate --android --assetPath assets`.
- iOS is intentionally not set up yet; when it is, the same `assets/` feed
  `npx @capacitor/assets generate --ios`.

## Self-hosting notes

- **HTTPS:** the PWA offline shell only activates in a secure context. `localhost` counts;
  a LAN IP does not. Terminate TLS at your proxy (Caddy does this automatically with
  `deep-shaft.example.com { reverse_proxy localhost:8080 }`).
- **Data stays in the browser.** There is no server-side state to back up; a player's save lives
  in their own `localStorage`, with export/import in the in-game Settings panel.

## Privacy and security

- No backend, no accounts, no analytics, no third-party requests at runtime.
- No secrets in this repo by design — there is nothing to leak because there are no API keys,
  tokens, or credentials. `.gitignore` blocks `.env*`, keystores, and local SDK paths; the
  Android debug APK is self-signed locally and never committed.
- Diagnostics (Settings > Diagnostics) are local-only and scrubbed of save-content tokens.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Small PRs with test evidence merge fastest.
v1 scope stays frozen (static, local saves, five tiers); balance and polish PRs welcome.

## Documentation

- `mine-idle-spec.md` — the product specification (v1 scope).
- `docs/implementation-status.md` — what exists, what was verified, with command evidence.
- `docs/superpowers/plans/` — the v1 implementation plan and the v2 production refinement plan.
- Per-boundary contracts: `src/AGENTS.md`, `tests/AGENTS.md`, `scripts/AGENTS.md`.

## License

MIT — see [LICENSE](./LICENSE). Fork it, reskin the mine, ship your own idle game.
