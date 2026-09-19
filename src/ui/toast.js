/**
 * Toast notifications.
 *
 * Penalties, offline gains, and refused purchases must never be silent — an idle game that
 * punishes you quietly feels broken. This is a polite live region so screen readers announce
 * it too.
 */

import { createElement } from './dom.js';

export function createToast({ root } = {}) {
  const element = createElement('div', {
    className: 'toast',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });
  element.hidden = true;
  element.dataset.tone = 'neutral';

  root?.append(element);

  function show(message, { tone = 'neutral' } = {}) {
    if (!message) {
      return;
    }
    element.textContent = message;
    element.dataset.tone = tone;
    element.hidden = false;
  }

  function clear() {
    element.textContent = '';
    element.hidden = true;
  }

  return { element, show, clear };
}
