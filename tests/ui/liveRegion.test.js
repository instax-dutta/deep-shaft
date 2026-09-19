// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { createAnnouncer, createLiveRegion } from '../../src/ui/liveRegion.js';

function mount() {
  document.body.innerHTML = '';
  const region = createLiveRegion({ root: document.body });
  const announcer = createAnnouncer({ region });
  return { region, announcer };
}

describe('live region', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is a polite live region', () => {
    const { region } = mount();

    expect(region.element.getAttribute('aria-live')).toBe('polite');
  });

  it('unlocking a depth announces it once in the polite live region', () => {
    const { region, announcer } = mount();
    const state = createInitialState();
    announcer.update(state);

    state.depthTier = 3;
    const announced = announcer.update(state);

    expect(announced.join(' ')).toMatch(/depth 3/i);
    expect(region.element.textContent).toMatch(/depth 3/i);
  });

  it('a repeated render does not re-announce an already-announced event', () => {
    const { announcer } = mount();
    const state = createInitialState();
    announcer.update(state);
    state.depthTier = 2;
    announcer.update(state);

    expect(announcer.update(state)).toEqual([]);
  });
});
