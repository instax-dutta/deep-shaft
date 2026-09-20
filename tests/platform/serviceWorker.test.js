/**
 * Service worker registration adapter.
 *
 * Registration is a browser boundary: the API is missing on older browsers and in tests, and
 * `register()` rejects whenever the script is unreachable. Neither case may throw into the game
 * loop, so both are reported as structured results.
 */

import { describe, expect, it, vi } from 'vitest';

import { registerServiceWorker } from '../../src/platform/serviceWorker.js';

/** A window-like host whose service worker API records what it was called with. */
function hostWith(register) {
  return { navigator: { serviceWorker: { register } } };
}

describe('registerServiceWorker', () => {
  it('reports an unsupported browser without throwing', async () => {
    const result = await registerServiceWorker({});

    expect(result).toEqual({ ok: true, status: 'unsupported' });
  });

  it('registers the worker script at the configured scope when the API is available', async () => {
    const registration = { scope: './' };
    const register = vi.fn(() => Promise.resolve(registration));

    const result = await registerServiceWorker(hostWith(register));

    expect(register).toHaveBeenCalledWith('./sw.js', { scope: './' });
    expect(result).toEqual({ ok: true, status: 'registered', registration });
  });

  it('reports a rejected registration structurally instead of throwing', async () => {
    const register = vi.fn(() => Promise.reject(new Error('blocked by policy')));

    const result = await registerServiceWorker(hostWith(register));

    expect(result).toEqual({ ok: false, reason: 'registration_failed' });
  });

  it('reports a registration that throws synchronously instead of throwing', async () => {
    const register = vi.fn(() => {
      throw new Error('insecure context');
    });

    await expect(registerServiceWorker(hostWith(register))).resolves.toEqual({
      ok: false,
      reason: 'registration_failed',
    });
  });
});
