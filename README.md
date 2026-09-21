# Deep Shaft

A mobile-first browser idle mine-management game: buy drills, hire a named crew, dig through
five depth tiers of ore, gems, and rare minerals, survive cave-ins, ride lucky veins, automate,
and retire runs for permanent multipliers.

- **Engine:** Phaser 3 + ES modules, built with Vite into a plain static site.
- **Persistence:** `localStorage` only — no backend, no accounts, no tracking.
- **Installable:** PWA manifest + service worker, so the game boots offline after the first load.
- **Architecture and contracts:** see `AGENTS.md` (root) and the `docs/` index.

## Quick start

```bash
npm install
npm run dev          # dev server
npm test -- --run    # full Vitest suite
npm run gate         # unit tests + build + every browser suite (the release gate)
```

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

## Documentation

- `mine-idle-spec.md` — the product specification (v1 scope).
- `docs/implementation-status.md` — what exists, what was verified, with command evidence.
- `docs/superpowers/plans/` — the v1 implementation plan and the v2 production refinement plan.
- Per-boundary contracts: `src/AGENTS.md`, `tests/AGENTS.md`, `scripts/AGENTS.md`.
