/**
 * Resource HUD.
 *
 * Always-visible status strip: currency, the banked ore / gems / rare minerals of the current
 * tier, the extraction rate, the current depth, and the permanent prestige multiplier. Every
 * number is rendered through `formatNumber`, so nothing raw ever reaches the player.
 */

import { formatNumber } from '../core/numberFormat.js';
import { productionPerSecond } from '../core/production.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../data/resources.js';
import { createElement, field } from './dom.js';

/** Wraps a field element in a labelled stat cell. */
function statCell(labelText, valueElement) {
  return createElement('div', {
    className: 'hud__stat',
    children: [
      createElement('span', { className: 'hud__label', text: labelText }),
      valueElement,
    ],
  });
}

/** A resource cell showing the tier's resource name, its banked amount, and a sell control. */
function resourceCell(labelText, nameElement, amountElement, rateElement, sellButton) {
  return createElement('div', {
    className: 'hud__stat',
    children: [
      createElement('span', { className: 'hud__label', text: labelText }),
      createElement('span', {
        className: 'hud__value',
        children: [nameElement, amountElement],
      }),
      rateElement,
      sellButton,
    ],
  });
}

/** Per-category sell control: selling gems must not force selling the ore too. */
function categorySellButton(category, dispatch) {
  const button = createElement('button', {
    className: 'hud__sell',
    text: 'Sell',
    attrs: { type: 'button', 'data-action': `sell-${category}` },
  });
  button.addEventListener('click', () => dispatch?.({ type: 'sellCategory', category }));
  return button;
}

export function createHud({ root, dispatch } = {}) {
  const currency = field('currency', '0');
  const oreName = field('ore-name', '—');
  const oreAmount = field('ore-amount', '0');
  const gemName = field('gem-name', '—');
  const gemAmount = field('gem-amount', '0');
  const gemRate = field('gem-rate', '0/s');
  const rareName = field('rare-name', '—');
  const rareAmount = field('rare-amount', '0');
  const rareRate = field('rare-rate', '0/s');
  const rate = field('rate', '0/s');
  const depth = field('depth', 'Depth 1');
  const multiplier = field('multiplier', 'x1');
  const status = field('status', '');

  // A real button so mining is reachable by keyboard and assistive tech, not only by tapping the
  // canvas. It dispatches the same `mine` command the shaft does.
  const mineButton = createElement('button', {
    className: 'hud__action',
    text: 'Mine',
    attrs: { type: 'button', 'data-action': 'mine' },
  });
  mineButton.addEventListener('click', () => dispatch?.({ type: 'mine' }));

  const sellButton = createElement('button', {
    className: 'hud__action',
    text: 'Sell everything',
    attrs: { type: 'button', 'data-action': 'sell-all' },
  });
  sellButton.addEventListener('click', () => dispatch?.({ type: 'sellAll' }));

  const element = createElement('section', {
    className: 'hud',
    attrs: { 'aria-label': 'Mine status' },
    children: [
      statCell('Currency', currency),
      resourceCell('Ore', oreName, oreAmount, null, categorySellButton(RESOURCE_CATEGORIES.ORE, dispatch)),
      resourceCell('Gems', gemName, gemAmount, gemRate, categorySellButton(RESOURCE_CATEGORIES.GEMS, dispatch)),
      resourceCell(
        'Rare finds',
        rareName,
        rareAmount,
        rareRate,
        categorySellButton(RESOURCE_CATEGORIES.RARE, dispatch),
      ),
      status,
      statCell('Per second', rate),
      statCell('Depth', depth),
      statCell('Prestige', multiplier),
      mineButton,
      sellButton,
    ],
  });

  root?.append(element);

  function resourceFields(state, category) {
    const definition = resourceOfCategory(state.depthTier, category);
    return {
      name: definition ? definition.name : '—',
      amount: definition ? state.resources[definition.id] ?? 0 : 0,
    };
  }

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    const fmt = (value) => formatNumber(value, { notation });
    const ore = resourceFields(state, RESOURCE_CATEGORIES.ORE);
    const gems = resourceFields(state, RESOURCE_CATEGORIES.GEMS);
    const rare = resourceFields(state, RESOURCE_CATEGORIES.RARE);
    const oreDefinition = resourceOfCategory(state.depthTier, RESOURCE_CATEGORIES.ORE);
    const rates = productionPerSecond(state);
    const orePerSecond = oreDefinition ? rates[oreDefinition.id] ?? 0 : 0;

    currency.textContent = fmt(state.currency);
    oreName.textContent = ore.name;
    oreAmount.textContent = fmt(ore.amount);
    gemName.textContent = gems.name;
    gemAmount.textContent = fmt(gems.amount);
    // Gems and rare income is otherwise invisible: a player could not tell whether a worker on
    // gems changed anything without mental math.
    const gemDefinition = resourceOfCategory(state.depthTier, RESOURCE_CATEGORIES.GEMS);
    const rareDefinition = resourceOfCategory(state.depthTier, RESOURCE_CATEGORIES.RARE);
    gemRate.textContent = `${fmt(gemDefinition ? rates[gemDefinition.id] ?? 0 : 0)}/s`;
    rareRate.textContent = `${fmt(rareDefinition ? rates[rareDefinition.id] ?? 0 : 0)}/s`;
    rareName.textContent = rare.name;
    rareAmount.textContent = fmt(rare.amount);
    // Shows what the player actually banks: ore per second, including workers put on ore.
    rate.textContent = `${fmt(orePerSecond)}/s`;
    depth.textContent = `Depth ${state.depthTier}`;
    multiplier.textContent = `x${fmt(state.prestige.multiplier)}`;
    // An active penalty stays on screen; a toast alone would be easy to miss.
    status.textContent = (state.events?.active ?? [])
      .map((event) => `${event.name} — ${Math.max(1, Math.ceil(event.remainingSeconds))}s`)
      .join(' · ');
  }

  return { element, render };
}
