// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { AUTOMATION_KINDS, automationUnlockUpgrade } from '../../src/data/automation.js';
import { PRESTIGE_UPGRADE_IDS, prestigeUpgrades } from '../../src/data/prestigeUpgrades.js';
import { createPrestigePanel } from '../../src/ui/prestigePanel.js';

const PRODUCTION = PRESTIGE_UPGRADE_IDS.PRODUCTION;

function setup() {
  const dispatch = vi.fn();
  const panel = createPrestigePanel({ dispatch });
  return { dispatch, panel };
}

function upgradeRow(panel, id) {
  return panel.element.querySelector(`[data-upgrade="${id}"]`);
}

describe('prestige panel', () => {
  it('the panel shows the current points balance', () => {
    const { panel } = setup();
    const state = createInitialState();
    state.prestige.points = 7;

    panel.render(state);

    expect(panel.element.querySelector('[data-field="prestige-points"]').textContent).toContain('7');
  });

  it('an affordable upgrade is enabled and dispatches buyUpgrade', () => {
    const { dispatch, panel } = setup();
    const state = createInitialState();
    state.prestige.points = 100;
    panel.render(state);

    const button = upgradeRow(panel, PRODUCTION).querySelector('button');
    expect(button.disabled).toBe(false);

    button.click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'buyUpgrade', upgradeId: PRODUCTION });
  });

  it('an unaffordable upgrade is disabled and never dispatches', () => {
    const { dispatch, panel } = setup();
    const state = createInitialState();
    state.prestige.points = 0;
    panel.render(state);

    const button = upgradeRow(panel, PRODUCTION).querySelector('button');
    expect(button.disabled).toBe(true);

    button.click();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('a locked automation toggle is disabled until its upgrade is owned', () => {
    const { panel } = setup();

    panel.render(createInitialState());

    const input = panel.element.querySelector('input[data-automation="autoBuy"]');
    expect(input.disabled).toBe(true);
  });

  it('toggling an unlocked automation dispatches setAutomation', () => {
    const { dispatch, panel } = setup();
    const state = createInitialState();
    state.prestige.upgrades[automationUnlockUpgrade(AUTOMATION_KINDS.AUTO_BUY)] = 1;
    panel.render(state);

    const input = panel.element.querySelector('input[data-automation="autoBuy"]');
    expect(input.disabled).toBe(false);

    input.checked = true;
    input.dispatchEvent(new Event('change'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'setAutomation',
      kind: AUTOMATION_KINDS.AUTO_BUY,
      enabled: true,
    });
  });

  it('the automation toggle reflects stored state', () => {
    const { panel } = setup();
    const state = createInitialState();
    state.prestige.upgrades[automationUnlockUpgrade(AUTOMATION_KINDS.AUTO_SELL)] = 1;
    state.automation[AUTOMATION_KINDS.AUTO_SELL] = true;

    panel.render(state);

    expect(panel.element.querySelector('input[data-automation="autoSell"]').checked).toBe(true);
  });

  it('a maxed upgrade shows Max and stays disabled', () => {
    const { dispatch, panel } = setup();
    const state = createInitialState();
    state.prestige.points = 1e9;
    state.prestige.upgrades[PRODUCTION] = prestigeUpgrades[PRODUCTION].maxLevel;
    panel.render(state);

    const row = upgradeRow(panel, PRODUCTION);
    const button = row.querySelector('button');

    expect(row.textContent).toContain('Max');
    expect(button.disabled).toBe(true);

    button.click();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
