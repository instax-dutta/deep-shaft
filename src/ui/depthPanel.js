/**
 * Depth panel.
 *
 * Digging deeper is a big, irreversible spend, so the player sees exactly what they are buying:
 * the tier they are working, what the next tier holds, and how deep the shaft goes. The panel
 * dispatches the command and renders affordability — the cost curve stays in `src/core/depth.js`.
 */

import { currentTierName, digDeeperCost, MAX_DEPTH_TIER } from '../core/depth.js';
import { formatNumber } from '../core/numberFormat.js';
import { M } from '../core/numbers/magnitude.js';
import { getDepthTier } from '../data/depthTiers.js';
import { resourcesForTier } from '../data/resources.js';
import { createElement, field } from './dom.js';

function labelledRow(labelText, ...valueNodes) {
  return createElement('div', {
    className: 'depth__row',
    children: [
      createElement('span', { className: 'depth__label', text: labelText }),
      createElement('div', { className: 'depth__value', children: valueNodes }),
    ],
  });
}

export function createDepthPanel({ root, dispatch } = {}) {
  const tierName = field('tier-name', '—');
  const depthNumber = field('depth-number', '');
  const nextTier = field('next-tier', '');
  const nextResources = field('next-resources', '');
  const digCost = field('dig-cost', '');
  const depthNote = field('depth-note', '');

  const digButton = createElement('button', {
    className: 'depth__action',
    text: 'Dig deeper',
    attrs: { type: 'button', 'data-action': 'dig-deeper' },
  });
  digButton.addEventListener('click', () => dispatch?.({ type: 'digDeeper' }));

  const upcoming = createElement('div', {
    className: 'depth__row',
    children: [
      createElement('span', { className: 'depth__label', text: 'Next' }),
      createElement('div', {
        className: 'depth__value',
        children: [nextTier, nextResources, digCost],
      }),
    ],
  });

  const element = createElement('section', {
    className: 'depth',
    attrs: { 'aria-label': 'Depth' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Shaft' }),
      labelledRow('Working', tierName, depthNumber),
      upcoming,
      depthNote,
      digButton,
    ],
  });

  root?.append(element);

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    const next = getDepthTier(state.depthTier + 1);
    const cost = digDeeperCost(state);
    const affordable = cost !== null && M.gte(state.currency, cost);

    tierName.textContent = currentTierName(state);
    depthNumber.textContent = `Depth ${state.depthTier} of ${MAX_DEPTH_TIER}`;

    if (next) {
      const names = resourcesForTier(next.tier).map((definition) => definition.name);
      nextTier.textContent = next.name;
      nextResources.textContent = names.join(' · ');
      digCost.textContent = formatNumber(cost, { notation });
      depthNote.textContent = '';
    } else {
      nextTier.textContent = '';
      nextResources.textContent = '';
      digCost.textContent = '';
      depthNote.textContent = 'Deepest shaft reached — prestige to dig faster.';
    }

    digButton.disabled = !affordable;
  }

  return { element, render };
}
