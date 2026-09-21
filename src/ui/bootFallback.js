/**
 * Boot fallback.
 *
 * A page that cannot start must not be blank. This renders a readable explanation with the app
 * version, so a player reporting a problem can be diagnosed at all, and offers a reload control.
 * It is mounted into a guaranteed-present host: `document.body` when the app root is missing.
 */

import { createElement } from './dom.js';

export function createBootFallback({ host, version = '' } = {}) {
  const message = createElement('p', { className: 'boot-fallback__message' });
  const reload = createElement('button', {
    className: 'boot-fallback__reload',
    text: 'Reload the page',
    attrs: { type: 'button', 'data-action': 'reload' },
  });
  reload.addEventListener('click', () => {
    // In a browser this re-runs boot from a clean state; a jsdom test simply must not throw.
    try {
      window.location.reload();
    } catch {
      // Nothing further to do: the message is already on screen.
    }
  });

  const element = createElement('div', {
    className: 'boot-fallback',
    attrs: { role: 'alert', 'data-field': 'boot-fallback' },
    children: [
      createElement('h1', { className: 'boot-fallback__title', text: 'Deep Shaft could not start' }),
      message,
      reload,
    ],
  });
  element.hidden = true;

  host?.append(element);

  return {
    element,
    show(problem) {
      message.textContent = [
        `The mine could not start: ${problem}`,
        version ? `Version ${version}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      element.hidden = false;
    },
  };
}
