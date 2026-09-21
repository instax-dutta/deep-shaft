// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBootFallback } from '../../src/ui/bootFallback.js';

describe('bootFallback', () => {
  let host;

  beforeEach(() => {
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.append(host);
  });

  it('renders a readable message instead of throwing', () => {
    const fallback = createBootFallback({ host, version: '0.1.0' });

    expect(() => fallback.show('Phaser failed to start')).not.toThrow();
    expect(fallback.element.textContent).toContain('could not start');
    expect(fallback.element.textContent).toContain('Phaser failed to start');
    expect(fallback.element.isConnected).toBe(true);
  });

  it('names the reported problem and the app version', () => {
    const fallback = createBootFallback({ host, version: '9.9.9' });

    fallback.show('Phaser failed');

    expect(fallback.element.textContent).toContain('Phaser failed');
    expect(fallback.element.textContent).toContain('9.9.9');
  });

  it('is hidden until shown', () => {
    const fallback = createBootFallback({ host, version: '0.1.0' });

    expect(fallback.element.hidden).toBe(true);

    fallback.show('anything');

    expect(fallback.element.hidden).toBe(false);
  });

  it('a reload control is offered but dispatches nothing automatically', () => {
    const fallback = createBootFallback({ host, version: '0.1.0' });

    fallback.show('boom');

    const reload = fallback.element.querySelector('[data-action="reload"]');
    expect(reload).not.toBeNull();
    // Clicking must not throw even though no real reload happens in jsdom.
    expect(() => reload.click()).not.toThrow();
  });
});
