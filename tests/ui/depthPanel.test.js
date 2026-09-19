// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDepthPanel } from '../../src/ui/depthPanel.js';
import { createInitialState } from '../../src/core/state.js';
import { digDeeperCost } from '../../src/core/depth.js';
import { formatNumber } from '../../src/core/numberFormat.js';
import { getDepthTier } from '../../src/data/depthTiers.js';
import { RESOURCE_CATEGORIES, resourceOfCategory, resourcesForTier } from '../../src/data/resources.js';

const DEEPEST_TIER = 5;

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const panel = createDepthPanel({ root: document.body, dispatch });
  return {
    panel,
    dispatch,
    field: (name) => panel.element.querySelector(`[data-field="${name}"]`),
    digButton: () => panel.element.querySelector('[data-action="dig-deeper"]'),
  };
}

describe('depthPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('names the tier the mine is working', () => {
    const { panel, field } = mount();

    panel.render(createInitialState());

    expect(field('tier-name').textContent).toBe(getDepthTier(1).name);
  });

  it('reports how deep the mine is against the deepest tier', () => {
    const { panel, field } = mount();

    panel.render(createInitialState());

    expect(field('depth-number').textContent).toContain('1');
    expect(field('depth-number').textContent).toContain(String(DEEPEST_TIER));
  });

  it('names the next tier and what it holds', () => {
    const { panel, field } = mount();

    panel.render(createInitialState());

    const nextTierResources = resourcesForTier(2).map((definition) => definition.name);
    expect(field('next-tier').textContent).toBe(getDepthTier(2).name);
    for (const name of nextTierResources) {
      expect(field('next-resources').textContent).toContain(name);
    }
  });

  it('shows the formatted cost of digging deeper', () => {
    const { panel, field } = mount();
    const state = createInitialState();

    panel.render(state);

    expect(field('dig-cost').textContent).toBe(formatNumber(digDeeperCost(state)));
  });

  it('disables digging while the mine cannot afford it', () => {
    const { panel, digButton } = mount();
    const state = createInitialState();
    state.currency = 0;

    panel.render(state);

    expect(digButton().disabled).toBe(true);
  });

  it('enables digging once the mine can afford it', () => {
    const { panel, digButton } = mount();
    const state = createInitialState();
    state.currency = digDeeperCost(state);

    panel.render(state);

    expect(digButton().disabled).toBe(false);
  });

  it('dispatches a digDeeper command', () => {
    const { panel, dispatch, digButton } = mount();
    const state = createInitialState();
    state.currency = digDeeperCost(state);
    panel.render(state);

    digButton().click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'digDeeper' });
  });

  it('dispatches nothing while digging is unaffordable', () => {
    const { panel, dispatch, digButton } = mount();
    panel.render(createInitialState());

    digButton().click();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('reports the deepest shaft instead of a next tier', () => {
    const { panel, field, digButton } = mount();
    const state = createInitialState();
    state.depthTier = DEEPEST_TIER;
    state.currency = Number.MAX_SAFE_INTEGER;

    panel.render(state);

    expect(field('tier-name').textContent).toBe(getDepthTier(DEEPEST_TIER).name);
    expect(field('next-tier').textContent).toBe('');
    expect(field('dig-cost').textContent).toBe('');
    expect(field('depth-note').textContent.length).toBeGreaterThan(0);
    expect(digButton().disabled).toBe(true);
  });

  it('offers the deepest tier the mine has reached, not one beyond it', () => {
    const { panel, field } = mount();
    const state = createInitialState();
    state.depthTier = 3;
    state.currency = 10_000_000;

    panel.render(state);

    expect(field('next-tier').textContent).toBe(getDepthTier(4).name);
    expect(field('next-resources').textContent).toContain(
      resourceOfCategory(4, RESOURCE_CATEGORIES.RARE).name,
    );
  });
});
