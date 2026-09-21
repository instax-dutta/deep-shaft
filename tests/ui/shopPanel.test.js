// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createShopPanel } from '../../src/ui/shopPanel.js';
import { createInitialState } from '../../src/core/state.js';
import { drillCost, maxAffordable } from '../../src/core/drills.js';
import { formatNumber } from '../../src/core/numberFormat.js';
import { drills, getDrill } from '../../src/data/drills.js';

const firstDrill = getDrill('drill-1');

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const panel = createShopPanel({ root: document.body, dispatch });
  return {
    panel,
    dispatch,
    row: (drillId) => panel.element.querySelector(`[data-drill="${drillId}"]`),
    buyButton: (drillId, mode) =>
      panel.element.querySelector(`[data-drill="${drillId}"] [data-mode="${mode}"]`),
  };
}

describe('shopPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders one row per drill definition', () => {
    const { panel } = mount();

    panel.render(createInitialState());

    expect(panel.element.querySelectorAll('[data-drill]')).toHaveLength(
      Object.keys(drills).length,
    );
  });

  it('names each drill and shows how many are owned', () => {
    const { panel, row } = mount();
    const state = createInitialState();
    state.drills[firstDrill.id] = 4;

    panel.render(state);

    expect(row(firstDrill.id).textContent).toContain(firstDrill.name);
    expect(row(firstDrill.id).querySelector('[data-field="owned"]').textContent).toBe('4');
  });

  it('shows the formatted cost of the next unit', () => {
    const { panel, row } = mount();
    const state = createInitialState();
    state.drills[firstDrill.id] = 3;
    const unitCost = drillCost(firstDrill, 3, 1);

    panel.render(state);

    const shown = row(firstDrill.id).querySelector('[data-field="unit-cost"]').textContent;
    expect(shown).toBe(formatNumber(unitCost));
    expect(shown).not.toBe(String(unitCost));
  });

  it('disables buying when the mine cannot afford the next unit', () => {
    const { panel, buyButton } = mount();
    const state = createInitialState();
    state.currency = 0;

    panel.render(state);

    expect(buyButton(firstDrill.id, 'x1').disabled).toBe(true);
  });

  it('enables buying once the mine can afford the next unit', () => {
    const { panel, buyButton } = mount();
    const state = createInitialState();
    state.currency = 100;

    panel.render(state);

    expect(buyButton(firstDrill.id, 'x1').disabled).toBe(false);
  });

  it('disables the bulk modes that are out of reach', () => {
    const { panel, buyButton } = mount();
    const state = createInitialState();
    state.currency = drillCost(firstDrill, 0, 1);

    panel.render(state);

    expect(buyButton(firstDrill.id, 'x1').disabled).toBe(false);
    expect(buyButton(firstDrill.id, 'x10').disabled).toBe(true);
    expect(buyButton(firstDrill.id, 'max').disabled).toBe(false);
  });

  it('dispatches a buyDrill command with the drill and mode', () => {
    const { panel, dispatch, buyButton } = mount();
    const state = createInitialState();
    state.currency = drillCost(firstDrill, 0, 10);
    panel.render(state);

    buyButton(firstDrill.id, 'x10').click();

    expect(dispatch).toHaveBeenCalledWith({
      type: 'buyDrill',
      drillId: firstDrill.id,
      mode: 'x10',
    });
  });

  it('dispatches nothing for a purchase the mine cannot afford', () => {
    const { panel, dispatch, buyButton } = mount();
    const state = createInitialState();
    state.currency = 0;
    panel.render(state);

    buyButton(firstDrill.id, 'x1').click();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('marks a drill locked when the depth has not reached its tier', () => {
    const { panel, row, buyButton } = mount();
    const deepDrill = getDrill('drill-3');

    panel.render(createInitialState());

    expect(row(deepDrill.id).dataset.locked).toBe('true');
    expect(buyButton(deepDrill.id, 'x1').disabled).toBe(true);
    expect(row(deepDrill.id).textContent).toContain('Depth 3');
  });

  it('unlocks a drill once the depth tier reaches it', () => {
    const { panel, row, buyButton } = mount();
    const deepDrill = getDrill('drill-3');
    const state = createInitialState();
    state.depthTier = 3;
    state.currency = 1_000_000;

    panel.render(state);

    expect(row(deepDrill.id).dataset.locked).toBe('false');
    expect(buyButton(deepDrill.id, 'x1').disabled).toBe(false);
  });

  it('is labelled for screen readers', () => {
    const { panel } = mount();

    panel.render(createInitialState());

    expect(panel.element.querySelector('h2').textContent.length).toBeGreaterThan(0);
  });
});

describe('shopPanel bulk-buy cost previews', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function mount() {
    document.body.innerHTML = '';
    const dispatch = vi.fn();
    const panel = createShopPanel({ root: document.body, dispatch });
    return panel;
  }

  it('shows what buying x10 costs beside the buttons', () => {
    const panel = mount();
    const state = createInitialState();
    state.currency = 500;

    panel.render(state);

    const row = panel.element.querySelector('[data-drill="drill-1"]');
    const preview = row.querySelector('[data-field="mode-cost-x10"]');
    expect(preview).not.toBeNull();
    // Ten hand drills: base 15 with growth 1.15 summed over ten units = 15*(1.15^10-1)/0.15.
    expect(preview.textContent).toContain(formatNumber(drillCost(getDrill('drill-1'), 0, 10)));
  });

  it('shows how many units Max would buy and their total', () => {
    const panel = mount();
    const state = createInitialState();
    state.currency = 100;

    panel.render(state);

    const row = panel.element.querySelector('[data-drill="drill-1"]');
    const affordable = maxAffordable(getDrill('drill-1'), 0, 100);
    expect(affordable).toBeGreaterThan(0);
    expect(row.querySelector('[data-field="mode-cost-max-count"]').textContent).toContain(
      formatNumber(affordable),
    );
    expect(row.querySelector('[data-field="mode-cost-max-total"]').textContent).toContain(
      formatNumber(drillCost(getDrill('drill-1'), 0, affordable)),
    );
  });

  it('shows nothing for a locked drill', () => {
    const panel = mount();
    panel.render(createInitialState());

    const lockedRow = panel.element.querySelector('[data-drill="drill-3"]');
    expect(lockedRow.querySelector('[data-field="mode-cost-x10"]').textContent).toBe('');
    expect(lockedRow.querySelector('[data-field="mode-cost-max-count"]').textContent).toBe('');
  });
});
