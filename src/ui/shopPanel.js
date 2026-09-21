/**
 * Drill shop panel.
 *
 * One row per drill tier with the three purchase modes the spec calls for (x1, x10, max).
 * Rows above the current depth are visibly locked rather than hidden, so the player can see
 * what digging deeper will unlock. The panel renders affordability but never computes economy
 * rules itself — costs come from `src/core/drills.js`.
 */

import { drillCost, maxAffordable, PURCHASE_MODES } from '../core/drills.js';
import { formatNumber } from '../core/numberFormat.js';
import { M } from '../core/numbers/magnitude.js';
import { drills } from '../data/drills.js';
import { createElement, field } from './dom.js';

const MODES = [
  { mode: PURCHASE_MODES.X1, label: 'x1', quantity: 1 },
  { mode: PURCHASE_MODES.X10, label: 'x10', quantity: 10 },
  { mode: PURCHASE_MODES.MAX, label: 'Max', quantity: null },
];

function createRow(definition, dispatch) {
  const owned = field('owned', '0');
  const unitCost = field('unit-cost', '0');
  const x10Cost = field('mode-cost-x10', '');
  const maxCount = field('mode-cost-max-count', '');
  const maxTotal = field('mode-cost-max-total', '');
  const lockHint = createElement('span', {
    className: 'shop__lock',
    attrs: { 'data-field': 'lock' },
  });

  const buttons = new Map();
  const actions = createElement('div', { className: 'shop__actions' });

  for (const { mode, label } of MODES) {
    const button = createElement('button', {
      className: 'shop__buy',
      text: label,
      attrs: { type: 'button', 'data-mode': mode, 'aria-label': `${label} ${definition.name}` },
    });
    button.addEventListener('click', () => {
      dispatch?.({ type: 'buyDrill', drillId: definition.id, mode });
    });
    buttons.set(mode, button);
    actions.append(button);
  }

  const row = createElement('div', {
    className: 'shop__row',
    dataset: { drill: definition.id, locked: 'false' },
    children: [
      createElement('div', {
        className: 'shop__info',
        children: [
          createElement('span', { className: 'shop__name', text: definition.name }),
          createElement('span', {
            className: 'shop__owned',
            children: [document.createTextNode('Owned '), owned],
          }),
        ],
      }),
      createElement('div', {
        className: 'shop__cost',
        children: [document.createTextNode('Cost '), unitCost, lockHint],
      }),
      createElement('div', {
        className: 'shop__mode-costs',
        children: [
          x10Cost,
          document.createTextNode(' '),
          maxCount,
          maxTotal,
        ],
      }),
      actions,
    ],
  });

  return { definition, row, owned, unitCost, x10Cost, maxCount, maxTotal, lockHint, buttons };
}

export function createShopPanel({ root, dispatch } = {}) {
  const rows = Object.values(drills).map((definition) => createRow(definition, dispatch));

  const element = createElement('section', {
    className: 'shop',
    attrs: { 'aria-label': 'Drills' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Drills' }),
      createElement('div', {
        className: 'shop__rows',
        children: rows.map((entry) => entry.row),
      }),
    ],
  });

  root?.append(element);

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    const fmt = (value) => formatNumber(value, { notation });
    for (const entry of rows) {
      const { definition, owned, unitCost, x10Cost, maxCount, maxTotal, lockHint, buttons } = entry;
      const count = state.drills[definition.id] ?? 0;
      const unlocked = definition.tier <= state.depthTier;
      const nextUnitCost = drillCost(definition, count, 1);

      entry.row.dataset.locked = String(!unlocked);
      owned.textContent = fmt(count);
      unitCost.textContent = fmt(nextUnitCost);
      lockHint.textContent = unlocked ? '' : `Locked — reach Depth ${definition.tier}`;

      // Bulk buttons act without confirmation, so the player sees the real totals before clicking.
      if (unlocked) {
        x10Cost.textContent = `x10 for ${fmt(drillCost(definition, count, 10))}`;
        const affordable = maxAffordable(definition, count, state.currency);
        if (affordable > 0) {
          maxCount.textContent = `Max buys ${fmt(affordable)}`;
          maxTotal.textContent = ` for ${fmt(drillCost(definition, count, affordable))}`;
        } else {
          maxCount.textContent = 'Max: none affordable yet';
          maxTotal.textContent = '';
        }
      } else {
        x10Cost.textContent = '';
        maxCount.textContent = '';
        maxTotal.textContent = '';
      }

      for (const { mode, quantity } of MODES) {
        const button = buttons.get(mode);
        if (!unlocked) {
          button.disabled = true;
          continue;
        }

        const wanted =
          quantity ?? maxAffordable(definition, count, state.currency);
        const cost = drillCost(definition, count, wanted);
        button.disabled = wanted < 1 || M.gt(cost, state.currency);
      }
    }
  }

  return { element, render };
}
