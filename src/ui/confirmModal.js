/**
 * Reusable destructive-action confirmation.
 *
 * A destructive action must state its full consequence and never fire on open: opening the modal
 * dispatches nothing, only an explicit confirm does. The safe option takes focus, the dialog is
 * labelled by its heading for screen readers, and Escape closes it without acting.
 *
 * The element is returned rather than mounted, so a caller can place it inside its own panel.
 */

import { createElement } from './dom.js';
import { trapFocus } from './focusTrap.js';

let modalCount = 0;

export function createConfirmModal({
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dialogName = 'confirm',
  onConfirm,
} = {}) {
  modalCount += 1;
  const headingId = `confirm-heading-${modalCount}`;

  const cancel = createElement('button', {
    className: 'confirm__cancel',
    text: cancelLabel,
    attrs: { type: 'button', 'data-action': 'cancel' },
  });
  const confirm = createElement('button', {
    className: 'confirm__confirm',
    text: confirmLabel,
    attrs: { type: 'button', 'data-action': 'confirm' },
  });

  const dialog = createElement('div', {
    className: 'confirm__dialog',
    attrs: {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': headingId,
      'data-dialog': dialogName,
    },
    children: [
      createElement('div', {
        className: 'confirm__card',
        children: [
          createElement('h3', { className: 'confirm__heading', text: title, attrs: { id: headingId } }),
          createElement('p', { className: 'confirm__message', text: message }),
          createElement('div', { className: 'confirm__buttons', children: [cancel, confirm] }),
        ],
      }),
    ],
  });
  dialog.hidden = true;

  let open = false;
  let trap = null;

  function setOpen(next) {
    open = next;
    dialog.hidden = !next;
    if (next) {
      // Trap first, while the opener still holds focus, so release restores it there.
      trap = trapFocus(dialog);
      // Focus the safe option: the other one cannot be undone.
      cancel.focus();
    } else {
      trap?.release();
      trap = null;
    }
  }

  cancel.addEventListener('click', () => setOpen(false));
  confirm.addEventListener('click', () => {
    if (confirm.disabled) {
      return;
    }
    setOpen(false);
    onConfirm?.();
  });

  return {
    element: dialog,
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
  };
}
