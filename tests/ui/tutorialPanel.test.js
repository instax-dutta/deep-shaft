// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { TUTORIAL_EVENTS, advanceTutorial } from '../../src/core/tutorial.js';
import { createTutorialPanel } from '../../src/ui/tutorialPanel.js';

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const panel = createTutorialPanel({ root: document.body, dispatch });
  return { panel, dispatch };
}

describe('tutorialPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the current instruction on a fresh mine', () => {
    const { panel } = mount();

    panel.render(createInitialState());

    const element = panel.element;
    expect(element.hidden).toBe(false);
    expect(element.textContent).toContain('Tap the shaft to mine ore by hand.');
  });

  it('follows the tutorial as its steps advance', () => {
    const { panel } = mount();
    const state = createInitialState();

    advanceTutorial(state, TUTORIAL_EVENTS.MINED);
    panel.render(state);
    expect(panel.element.textContent).toContain('Sell your ore for currency.');
  });

  it('hides entirely once the tutorial is completed', () => {
    const { panel } = mount();
    const state = createInitialState();
    for (const event of [TUTORIAL_EVENTS.MINED, TUTORIAL_EVENTS.SOLD, TUTORIAL_EVENTS.BOUGHT_DRILL, TUTORIAL_EVENTS.DUG]) {
      advanceTutorial(state, event);
    }

    panel.render(state);

    expect(panel.element.hidden).toBe(true);
  });

  it('shows no instruction text while hidden', () => {
    const { panel } = mount();
    const state = createInitialState();
    for (const event of [TUTORIAL_EVENTS.MINED, TUTORIAL_EVENTS.SOLD, TUTORIAL_EVENTS.BOUGHT_DRILL, TUTORIAL_EVENTS.DUG]) {
      advanceTutorial(state, event);
    }

    panel.render(state);

    expect(panel.element.textContent).not.toContain('Dig deeper to find richer resources.');
  });

  it('offers a dismiss control that dispatches a dismissed event', () => {
    const { panel, dispatch } = mount();
    panel.render(createInitialState());

    panel.element.querySelector('[data-action="dismiss-tutorial"]').click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'advanceTutorial', event: 'dismissed' });
  });
});
