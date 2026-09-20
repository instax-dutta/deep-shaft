/**
 * Service worker registration adapter.
 *
 * Registration is a browser boundary: the API is absent on older browsers and inside Vitest, and
 * `register()` rejects whenever the script is unreachable or the policy forbids it. None of that
 * may throw into the game loop — installability is a bonus, and the game plays on without it — so
 * every outcome is reported as a structured result.
 */

import { config } from '../data/config.js';

/**
 * Registers the offline app shell.
 *
 * @returns {Promise<
 *   | { ok: true, status: 'registered', registration: unknown }
 *   | { ok: true, status: 'unsupported' }
 *   | { ok: false, reason: 'registration_failed' }
 * >}
 */
export async function registerServiceWorker(
  host = globalThis,
  {
    url = config.pwa.serviceWorkerUrl,
    scope = config.pwa.serviceWorkerScope,
  } = {},
) {
  const container = host?.navigator?.serviceWorker;
  if (!container || typeof container.register !== 'function') {
    return { ok: true, status: 'unsupported' };
  }

  try {
    const registration = await container.register(url, { scope });
    return { ok: true, status: 'registered', registration };
  } catch {
    return { ok: false, reason: 'registration_failed' };
  }
}
