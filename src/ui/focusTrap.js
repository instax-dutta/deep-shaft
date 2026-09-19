/**
 * Keyboard focus trap for modal dialogs.
 *
 * While a modal is open, Tab must not walk out of it into the page behind — a keyboard user who
 * tabs past the last dialog control lands somewhere invisible. `trapFocus` keeps Tab and Shift+Tab
 * inside the container and restores focus to whatever opened the dialog when it is released.
 *
 * Disabled controls are skipped because they cannot receive focus. Visibility is not probed:
 * jsdom has no layout, and in the real DOM a hidden dialog is not focusable anyway.
 */

const FOCUSABLE_SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function focusableWithin(container) {
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => !element.disabled);
}

/**
 * Starts trapping focus inside `container`.
 *
 * Returns `{ release() }`, which stops trapping and returns focus to the element that was focused
 * when the trap began.
 */
export function trapFocus(container) {
  const opener = document.activeElement;

  function onKeydown(event) {
    if (event.key !== 'Tab') {
      return;
    }

    const items = focusableWithin(container);
    if (items.length === 0) {
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    const inside = container.contains(active);

    if (event.shiftKey) {
      if (!inside || active === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!inside || active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);

  return {
    release() {
      container.removeEventListener('keydown', onKeydown);
      if (opener && typeof opener.focus === 'function') {
        opener.focus();
      }
    },
  };
}
