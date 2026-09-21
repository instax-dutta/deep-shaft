/**
 * First-run tutorial panel.
 *
 * A single dismissible coach line keyed to the current tutorial step. It is hidden entirely for
 * a completed tutorial, so a returning player never sees it, and dismissing it once dismisses it
 * for good — the machine persists `completed`.
 */

import { tutorialState } from '../core/tutorial.js';
import { createElement } from './dom.js';

export function createTutorialPanel({ root, dispatch } = {}) {
  const instruction = createElement('span', { className: 'tutorial__instruction' });

  const dismiss = createElement('button', {
    className: 'tutorial__dismiss',
    text: 'Skip',
    attrs: { type: 'button', 'data-action': 'dismiss-tutorial', 'aria-label': 'Skip the tutorial' },
  });
  dismiss.addEventListener('click', () => {
    dispatch?.({ type: 'advanceTutorial', event: 'dismissed' });
  });

  const element = createElement('section', {
    className: 'tutorial',
    attrs: { 'aria-label': 'Getting started', 'data-field': 'tutorial' },
    children: [instruction, dismiss],
  });

  root?.append(element);

  function render(state) {
    const view = tutorialState(state);
    element.hidden = view.completed;
    instruction.textContent = view.instruction;
  }

  return { element, render };
}
