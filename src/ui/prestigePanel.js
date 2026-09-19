/**
 * Prestige upgrade tree panel.
 *
 * Shows the permanent points balance and one row per upgrade. Affordability, cost, and the max
 * level all come from `src/core/prestigeUpgrades.js`, so the panel renders the rules rather than
 * re-deriving them. A row that cannot be bought is disabled and never dispatches.
 */

import { formatNumber } from '../core/numberFormat.js';
import {
  canBuyUpgrade,
  upgradeCost,
  upgradeLevel,
} from '../core/prestigeUpgrades.js';
import {
  AUTOMATION_LABELS,
  AUTOMATION_ORDER,
  automationUnlockUpgrade,
} from '../data/automation.js';
import { prestigeUpgrades } from '../data/prestigeUpgrades.js';
import { createElement, field } from './dom.js';

function createRow(definition, dispatch) {
  const level = field('upgrade-level', '0');
  const levelWrap = createElement('span', {
    className: 'upgrade__level',
    children: [level, createElement('span', { text: `/${definition.maxLevel}` })],
  });
  const cost = field('upgrade-cost', '');
  const button = createElement('button', {
    className: 'upgrade__buy',
    text: 'Buy',
    attrs: { type: 'button', 'data-action': `buy-upgrade-${definition.id}` },
  });

  button.addEventListener('click', () => {
    if (button.disabled) {
      return;
    }
    dispatch?.({ type: 'buyUpgrade', upgradeId: definition.id });
  });

  const row = createElement('div', {
    className: 'upgrade',
    dataset: { upgrade: definition.id },
    children: [
      createElement('div', {
        className: 'upgrade__text',
        children: [
          createElement('span', { className: 'upgrade__name', text: definition.name }),
          createElement('span', { className: 'upgrade__description', text: definition.description }),
        ],
      }),
      createElement('div', {
        className: 'upgrade__status',
        children: [levelWrap, cost],
      }),
      button,
    ],
  });

  return { row, level, cost, button };
}

function createAutomationRow(kind, dispatch) {
  const input = createElement('input', {
    attrs: {
      type: 'checkbox',
      id: `automation-${kind}`,
      'data-automation': kind,
    },
  });
  input.addEventListener('change', () => {
    if (input.disabled) {
      return;
    }
    dispatch?.({ type: 'setAutomation', kind, enabled: input.checked });
  });

  const lock = field(`automation-lock-${kind}`, '');
  const row = createElement('div', {
    className: 'automation__row',
    dataset: { automation: kind },
    children: [
      input,
      createElement('label', {
        className: 'automation__label',
        text: AUTOMATION_LABELS[kind] ?? kind,
        attrs: { for: `automation-${kind}` },
      }),
      lock,
    ],
  });

  return { row, input, lock };
}

export function createPrestigePanel({ root, dispatch } = {}) {
  const points = field('prestige-points', '0');
  const list = createElement('div', { className: 'upgrades__list' });
  const rows = new Map();
  const automationRows = new Map();

  for (const definition of Object.values(prestigeUpgrades)) {
    const entry = createRow(definition, dispatch);
    rows.set(definition.id, entry);
    list.append(entry.row);
  }

  const automationList = createElement('div', { className: 'automation__list' });
  for (const kind of AUTOMATION_ORDER) {
    const entry = createAutomationRow(kind, dispatch);
    automationRows.set(kind, entry);
    automationList.append(entry.row);
  }

  const element = createElement('section', {
    className: 'upgrades',
    attrs: { 'aria-label': 'Permanent upgrades' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Permanent upgrades' }),
      createElement('p', {
        className: 'upgrades__points',
        children: [
          createElement('span', { className: 'upgrades__points-label', text: 'Prestige points' }),
          points,
        ],
      }),
      list,
      createElement('h3', { className: 'panel__subtitle', text: 'Automation' }),
      automationList,
    ],
  });

  root?.append(element);

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    points.textContent = formatNumber(state.prestige.points, { notation });

    for (const [id, entry] of rows) {
      const definition = prestigeUpgrades[id];
      const level = upgradeLevel(state, id);
      const maxed = level >= definition.maxLevel;

      entry.level.textContent = String(level);
      entry.cost.textContent = maxed ? 'Max' : formatNumber(upgradeCost(state, id), { notation });
      entry.button.textContent = maxed ? 'Max' : 'Buy';
      entry.button.disabled = !canBuyUpgrade(state, id).ok;
    }

    for (const [kind, entry] of automationRows) {
      const unlockId = automationUnlockUpgrade(kind);
      const unlocked = unlockId !== null && upgradeLevel(state, unlockId) > 0;
      entry.input.disabled = !unlocked;
      entry.input.checked = unlocked && state.automation[kind] === true;
      entry.lock.textContent = unlocked ? '' : 'Locked — buy the upgrade above.';
    }
  }

  return { element, render };
}
