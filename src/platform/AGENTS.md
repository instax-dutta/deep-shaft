# Platform Contract

## Purpose
- Own browser integration that cannot run in the pure domain layer.

## Ownership
- localStorage persistence adapter, application clock, autosave scheduler, visibility/unload lifecycle, and service worker registration belong here.

## Local Contracts
- Adapters expose narrow interfaces and can be replaced with in-memory test implementations.
- localStorage failures must not destroy the in-memory session.
- `createStorage` exposes `loadResult()` (structured outcome with `source: 'primary' | 'backup'`),
  `load()`/`loadBackup()` (state or `null`), `save()`/`saveBackup()`, `hasSave()`, and `clear()`.
  A successful `save` also writes the backup slot; an unreadable primary is preserved into the
  backup slot before the caller starts a fresh mine.
- Timestamp reads and writes use milliseconds; core offline calculations use seconds.
- `serviceWorker.js` owns offline app-shell registration. `registerServiceWorker(host)` resolves to
  `{ ok: true, status: 'registered', registration }`, `{ ok: true, status: 'unsupported' }` when the
  API is absent, or `{ ok: false, reason: 'registration_failed' }` when registration rejects or
  throws. It never throws: installability is a bonus, and boot must not depend on it. The script URL
  and scope come from `config.pwa` rather than being restated here.
- The worker script itself is a static asset (`public/sw.js`), not a bundled module: it is copied
  verbatim into the build, so it cannot import `src/`. It derives the app shell it caches from the
  built HTML at install time instead of holding a hashed-asset list.
- Browser event listeners are registered and removed through explicit lifecycle functions.

## Work Guidance
- Keep browser globals at module boundaries.
- Test serialization and adapter behavior without relying on a real browser when possible.

## Verification
- Run persistence, malformed-save, timestamp, autosave, and lifecycle tests.
- Run the production build for browser API bundling.

## Child DOX Index
- No narrower durable platform boundary exists yet.
