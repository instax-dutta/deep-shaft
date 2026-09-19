# Platform Contract

## Purpose
- Own browser integration that cannot run in the pure domain layer.

## Ownership
- localStorage persistence adapter, application clock, autosave scheduler, and visibility/unload lifecycle belong here.

## Local Contracts
- Adapters expose narrow interfaces and can be replaced with in-memory test implementations.
- localStorage failures must not destroy the in-memory session.
- `createStorage` exposes `loadResult()` (structured outcome with `source: 'primary' | 'backup'`),
  `load()`/`loadBackup()` (state or `null`), `save()`/`saveBackup()`, `hasSave()`, and `clear()`.
  A successful `save` also writes the backup slot; an unreadable primary is preserved into the
  backup slot before the caller starts a fresh mine.
- Timestamp reads and writes use milliseconds; core offline calculations use seconds.
- Browser event listeners are registered and removed through explicit lifecycle functions.

## Work Guidance
- Keep browser globals at module boundaries.
- Test serialization and adapter behavior without relying on a real browser when possible.

## Verification
- Run persistence, malformed-save, timestamp, autosave, and lifecycle tests.
- Run the production build for browser API bundling.

## Child DOX Index
- No narrower durable platform boundary exists yet.
