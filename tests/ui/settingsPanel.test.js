// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { createSettingsPanel, settingsRootClasses } from '../../src/ui/settingsPanel.js';

function setup() {
  const dispatch = vi.fn();
  const panel = createSettingsPanel({ dispatch });
  const state = createInitialState();
  panel.render(state);
  return { dispatch, panel, state };
}

function field(panel, name) {
  return panel.element.querySelector(`[data-field="${name}"]`);
}

function action(panel, name) {
  return panel.element.querySelector(`[data-action="${name}"]`);
}

describe('settings panel controls', () => {
  it('changing notation dispatches setSetting', () => {
    const { dispatch, panel } = setup();

    const select = panel.element.querySelector('[data-setting="notation"]');
    select.value = 'scientific';
    select.dispatchEvent(new Event('change'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'setSetting',
      key: 'notation',
      value: 'scientific',
    });
  });

  it('toggling reduced motion dispatches setSetting', () => {
    const { dispatch, panel } = setup();

    const checkbox = panel.element.querySelector('[data-setting="reducedMotion"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'setSetting',
      key: 'reducedMotion',
      value: true,
    });
  });

  it('reduced motion maps to a root class', () => {
    expect(settingsRootClasses({ reducedMotion: true })).toContain('reduced-motion');
    expect(settingsRootClasses({ reducedMotion: false })).not.toContain('reduced-motion');
  });
});

describe('destructive reset', () => {
  it('Reset game opens a confirmation naming the full loss and dispatches nothing until confirm', () => {
    const { dispatch, panel } = setup();

    action(panel, 'reset-game').click();

    expect(dispatch).not.toHaveBeenCalled();
    const dialog = panel.element.querySelector('[data-dialog="confirm-reset"]');
    expect(dialog.hidden).toBe(false);
    expect(dialog.textContent).toMatch(/permanent/i);
  });

  it('confirming reset dispatches resetGame', () => {
    const { dispatch, panel } = setup();
    action(panel, 'reset-game').click();

    panel.element.querySelector('[data-dialog="confirm-reset"] [data-action="confirm"]').click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'resetGame' });
  });

  it('cancelling reset dispatches nothing and closes the dialog', () => {
    const { dispatch, panel } = setup();
    action(panel, 'reset-game').click();

    const dialog = panel.element.querySelector('[data-dialog="confirm-reset"]');
    dialog.querySelector('[data-action="cancel"]').click();

    expect(dispatch).not.toHaveBeenCalled();
    expect(dialog.hidden).toBe(true);
  });
});

describe('save transfer controls', () => {
  it('Export produces a readable save string', () => {
    const { panel } = setup();

    action(panel, 'export-save').click();

    const text = field(panel, 'export-text').value;
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('Importing a valid export dispatches the restored state', () => {
    const { dispatch, panel, state } = setup();
    state.currency = 999;
    panel.render(state);

    action(panel, 'export-save').click();
    field(panel, 'import-text').value = field(panel, 'export-text').value;
    action(panel, 'import-save').click();

    const call = dispatch.mock.calls.find(([command]) => command.type === 'importSave');
    expect(call).toBeDefined();
    expect(call[0].state.currency).toBe(999);
  });

  it('importing invalid text shows an error and does not destroy the current save', () => {
    const { dispatch, panel } = setup();

    field(panel, 'import-text').value = 'not a save';
    action(panel, 'import-save').click();

    expect(dispatch).not.toHaveBeenCalled();
    expect(field(panel, 'import-error').textContent.length).toBeGreaterThan(0);
  });
});
