// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHud } from '../../src/ui/hud.js';
import { createInitialState } from '../../src/core/state.js';
import { getDrill } from '../../src/data/drills.js';
import { RESOURCE_CATEGORIES, resourceOfCategory } from '../../src/data/resources.js';

const firstDrill = getDrill('drill-1');
const tierOneOre = resourceOfCategory(1, RESOURCE_CATEGORIES.ORE);
const tierOneGems = resourceOfCategory(1, RESOURCE_CATEGORIES.GEMS);
const tierOneRare = resourceOfCategory(1, RESOURCE_CATEGORIES.RARE);

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const hud = createHud({ root: document.body, dispatch });
  return {
    hud,
    dispatch,
    field: (name) => hud.element.querySelector(`[data-field="${name}"]`),
  };
}

describe('hud', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('mounts exactly one region into the root', () => {
    const { hud } = mount();

    expect(document.body.querySelectorAll('section')).toHaveLength(1);
    expect(hud.element.isConnected).toBe(true);
  });

  it('shows the formatted currency instead of a raw float', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.currency = 1_234.5678;

    hud.render(state);

    expect(field('currency').textContent).toBe('1.23K');
  });

  it('shows the active tier resource and how much is banked', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.resources[tierOneOre.id] = 42.5;

    hud.render(state);

    expect(field('ore-name').textContent).toBe(tierOneOre.name);
    expect(field('ore-amount').textContent).toBe('42.5');
  });

  it('shows the production rate per second from the owned drills', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.drills[firstDrill.id] = 2;

    hud.render(state);

    expect(field('rate').textContent).toBe(`${firstDrill.baseOutput * 2}/s`);
  });

  it('shows the gem counter for the current tier, not just ore', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.resources[tierOneGems.id] = 3;

    hud.render(state);

    expect(field('gem-name').textContent).toBe(tierOneGems.name);
    expect(field('gem-amount').textContent).toBe('3');
  });

  it('shows the rare mineral counter for the current tier', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.resources[tierOneRare.id] = 1.5;

    hud.render(state);

    expect(field('rare-name').textContent).toBe(tierOneRare.name);
    expect(field('rare-amount').textContent).toBe('1.5');
  });

  it('follows gems and rare minerals into the deeper tier', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.depthTier = 3;

    hud.render(state);

    expect(field('gem-name').textContent).toBe(
      resourceOfCategory(3, RESOURCE_CATEGORIES.GEMS).name,
    );
    expect(field('rare-name').textContent).toBe(
      resourceOfCategory(3, RESOURCE_CATEGORIES.RARE).name,
    );
  });

  it('says nothing alarming while the mine runs normally', () => {
    const { hud, field } = mount();

    hud.render(createInitialState());

    expect(field('status').textContent).toBe('');
  });

  it('keeps an active cave-in visible instead of only flashing a toast', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.events.active = [
      { kind: 'caveIn', name: 'Cave-in', remainingSeconds: 12, totalSeconds: 30, drillIds: ['drill-1'] },
    ];

    hud.render(state);

    expect(field('status').textContent).toContain('Cave-in');
    expect(field('status').textContent).toContain('12');
  });

  it('keeps an active lucky vein visible with its remaining time', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.events.active = [
      { kind: 'luckyVein', name: 'Lucky vein', remainingSeconds: 8, totalSeconds: 20 },
    ];

    hud.render(state);

    expect(field('status').textContent).toContain('Lucky vein');
    expect(field('status').textContent).toContain('8');
  });

  it('shows the current depth tier', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.depthTier = 3;

    hud.render(state);

    expect(field('depth').textContent).toContain('3');
  });

  it('shows the prestige multiplier once the mine has prestiged', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.prestige.multiplier = 1.5;

    hud.render(state);

    expect(field('multiplier').textContent).toBe('x1.5');
  });

  it('renders currency in the configured notation', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.settings.notation = 'scientific';
    state.currency = 1_234_000;

    hud.render(state);

    expect(field('currency').textContent).toBe('1.23e6');
  });

  it('dispatches a sell-everything command from the resource bar', () => {
    const { hud, dispatch } = mount();

    hud.element.querySelector('[data-action="sell-all"]').click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'sellAll' });
  });

  it('keeps the resource name readable after digging deeper', () => {
    const { hud, field } = mount();
    const state = createInitialState();
    state.depthTier = 2;
    const tierTwoOre = resourceOfCategory(2, RESOURCE_CATEGORIES.ORE);

    hud.render(state);

    expect(field('ore-name').textContent).toBe(tierTwoOre.name);
  });
});
