// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { creditEarnings } from '../../src/core/resources.js';
import { createInitialState } from '../../src/core/state.js';
import { config } from '../../src/data/config.js';
import { createPrestigeModal } from '../../src/ui/prestigeModal.js';

const THRESHOLD = config.prestige.thresholdCurrency;

function readyState(amount = THRESHOLD) {
  const state = createInitialState();
  creditEarnings(state, amount);
  return state;
}

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const modal = createPrestigeModal({ root: document.body, dispatch });
  return {
    modal,
    dispatch,
    field: (name) => modal.element.querySelector(`[data-field="${name}"]`),
    trigger: () => modal.element.querySelector('[data-action="open-prestige"]'),
    confirm: () => modal.element.querySelector('[data-action="confirm-prestige"]'),
    cancel: () => modal.element.querySelector('[data-action="cancel-prestige"]'),
    dialog: () => modal.element.querySelector('[data-dialog="prestige"]'),
  };
}

describe('prestigeModal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('stays closed until the player asks for it', () => {
    const { modal, dialog } = mount();

    modal.render(readyState());

    expect(modal.isOpen()).toBe(false);
    expect(dialog().hidden).toBe(true);
  });

  it('marks itself up as a modal dialog', () => {
    const { dialog } = mount();

    expect(dialog().getAttribute('role')).toBe('dialog');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
  });

  it('focuses the way out when it opens, so a stray Enter cannot wipe the run', () => {
    const { modal, trigger, cancel } = mount();
    modal.render(readyState());

    trigger().click();

    expect(document.activeElement).toBe(cancel());
  });

  it('opens the confirmation when the player asks to prestige', () => {
    const { modal, dialog, trigger } = mount();
    modal.render(readyState());

    trigger().click();

    expect(modal.isOpen()).toBe(true);
    expect(dialog().hidden).toBe(false);
  });

  it('dispatches nothing merely for opening the confirmation', () => {
    const { modal, dispatch, trigger } = mount();
    modal.render(readyState());

    trigger().click();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('promises the multiplier the player will gain', () => {
    const { modal, field, trigger } = mount();
    // A 2M run sits below the +1 gain floor, so the promise is the floor: +1, next x2.
    const state = readyState(THRESHOLD * 2);
    modal.render(state);

    trigger().click();

    expect(field('prestige-gain').textContent).toMatch(/\+1/);
    expect(field('prestige-next').textContent).toContain('2');
  });

  it('names the penalty in full rather than hiding it', () => {
    const { modal, field, trigger } = mount();
    const state = readyState(THRESHOLD * 2);
    state.depthTier = 3;
    state.drills = { 'drill-1': 4, 'drill-2': 1 };
    state.workers = [{ id: 'worker-1', name: 'Gus Stone', level: 2, speed: 0.1, luck: 0.01 }];
    modal.render(state);

    trigger().click();

    const summary = field('prestige-summary').textContent;
    expect(summary).toContain('5');
    expect(summary).toContain('1');
    expect(summary).toMatch(/depth 3/i);
  });

  it('shows career earnings beside what this run earned, so the two are not confused', () => {
    const { modal, field, trigger } = mount();
    const state = createInitialState();
    // An earlier run already banked 9M; this one has earned 2M on top of it.
    state.prestige.lifetimeEarned = 9_000_000;
    creditEarnings(state, THRESHOLD * 2);
    modal.render(state);

    trigger().click();

    expect(field('prestige-run-earned').textContent).toBe('2M');
    expect(field('prestige-lifetime').textContent).toBe('11M');
  });

  it('keeps the confirmation out of reach while the run is not ready', () => {
    const { modal, trigger, confirm } = mount();

    modal.render(readyState(THRESHOLD - 1));

    expect(trigger().disabled).toBe(true);
    expect(confirm().disabled).toBe(true);
  });

  it('tells the player how far they still have to go', () => {
    const { modal, field } = mount();

    modal.render(readyState(THRESHOLD / 2));

    expect(field('prestige-note').textContent).toMatch(/50%/);
  });

  it('offers the confirmation once the run is ready', () => {
    const { modal, trigger, confirm } = mount();

    modal.render(readyState());

    expect(trigger().disabled).toBe(false);
    expect(confirm().disabled).toBe(false);
  });

  it('asks the server layer to prestige only on confirmation', () => {
    const { modal, dispatch, trigger, confirm } = mount();
    modal.render(readyState());

    trigger().click();
    expect(dispatch).not.toHaveBeenCalled();

    confirm().click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'prestige' });
  });

  it('closes itself once the player confirms', () => {
    const { modal, dialog, trigger, confirm } = mount();
    modal.render(readyState());

    trigger().click();
    confirm().click();

    expect(modal.isOpen()).toBe(false);
    expect(dialog().hidden).toBe(true);
  });

  it('abandons the prestige without dispatching anything', () => {
    const { modal, dispatch, trigger, cancel } = mount();
    modal.render(readyState());

    trigger().click();
    cancel().click();

    expect(modal.isOpen()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('closes on Escape without dispatching anything', () => {
    const { modal, dispatch, trigger } = mount();
    modal.render(readyState());
    trigger().click();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(modal.isOpen()).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns to a fresh, not-yet-ready run after the reset', () => {
    const { modal, field, trigger, confirm } = mount();
    const state = readyState(THRESHOLD * 2);
    modal.render(state);
    trigger().click();
    confirm().click();

    modal.render(createInitialState());

    expect(field('prestige-gain').textContent).toBe('');
    expect(trigger().disabled).toBe(true);
  });
});
