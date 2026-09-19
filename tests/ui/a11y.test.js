// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { creditEarnings } from '../../src/core/resources.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { createHud } from '../../src/ui/hud.js';
import { createPrestigeModal } from '../../src/ui/prestigeModal.js';

function eligibleState() {
  const state = createInitialState();
  creditEarnings(state, config.prestige.thresholdCurrency);
  return state;
}

function pressKey(element, key, { shiftKey = false } = {}) {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
}

function openPrestigeModal() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const modal = createPrestigeModal({ root: document.body, dispatch });
  modal.render(eligibleState());

  const trigger = modal.element.querySelector('[data-action="open-prestige"]');
  trigger.focus();
  trigger.click();

  const dialog = modal.element.querySelector('[data-dialog="prestige"]');
  return { modal, dispatch, trigger, dialog };
}

describe('keyboard mining', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('the HUD exposes a keyboard-focusable Mine control that dispatches mine', () => {
    const dispatch = vi.fn();
    const hud = createHud({ root: document.body, dispatch });
    hud.render(createInitialState());

    const button = hud.element.querySelector('[data-action="mine"]');
    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');

    button.click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'mine' });
  });
});

describe('prestige dialog focus management', () => {
  it('the dialog is labelled by its heading via aria-labelledby', () => {
    const { dialog } = openPrestigeModal();

    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(dialog.querySelector(`#${labelledBy}`).textContent).toContain('Retire');
  });

  it('opening focuses the safe option', () => {
    const { dialog } = openPrestigeModal();

    expect(document.activeElement).toBe(dialog.querySelector('[data-action="cancel-prestige"]'));
  });

  it('the prestige dialog traps Tab focus inside itself', () => {
    const { dialog } = openPrestigeModal();
    const cancelButton = dialog.querySelector('[data-action="cancel-prestige"]');
    const confirmButton = dialog.querySelector('[data-action="confirm-prestige"]');

    confirmButton.focus();
    pressKey(confirmButton, 'Tab');

    expect(document.activeElement).toBe(cancelButton);
  });

  it('Shift+Tab from the first control wraps to the last', () => {
    const { dialog } = openPrestigeModal();
    const cancelButton = dialog.querySelector('[data-action="cancel-prestige"]');
    const confirmButton = dialog.querySelector('[data-action="confirm-prestige"]');

    cancelButton.focus();
    pressKey(cancelButton, 'Tab', { shiftKey: true });

    expect(document.activeElement).toBe(confirmButton);
  });

  it('closing the dialog restores focus to the control that opened it', () => {
    const { trigger, dialog } = openPrestigeModal();

    dialog.querySelector('[data-action="cancel-prestige"]').click();

    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes the dialog and restores focus', () => {
    const { trigger, dialog } = openPrestigeModal();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialog.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });
});
