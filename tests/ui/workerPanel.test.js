// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkerPanel } from '../../src/ui/workerPanel.js';
import { createInitialState } from '../../src/core/state.js';
import { hireCost, trainCost } from '../../src/core/workers.js';
import { config } from '../../src/data/config.js';
import { drills } from '../../src/data/drills.js';
import { RESOURCE_CATEGORIES } from '../../src/data/resources.js';

function worker(overrides = {}) {
  return {
    id: 'worker-1',
    name: 'Ada Vale',
    speed: 0.05,
    luck: 0.01,
    level: 1,
    assignment: null,
    ...overrides,
  };
}

/** A mine past the worker milestone. */
function unlockedMine(overrides = {}) {
  const state = createInitialState();
  state.stats.totalEarned = config.workers.unlockCurrency;
  state.currency = 100_000;
  return Object.assign(state, overrides);
}

function mount() {
  document.body.innerHTML = '';
  const dispatch = vi.fn();
  const panel = createWorkerPanel({ root: document.body, dispatch });
  return {
    panel,
    dispatch,
    field: (name) => panel.element.querySelector(`[data-field="${name}"]`),
    row: (id) => panel.element.querySelector(`[data-worker="${id}"]`),
    hireButton: () => panel.element.querySelector('[data-action="hire-worker"]'),
  };
}

describe('workerPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('explains the milestone while workers are still locked', () => {
    const { panel, field, hireButton } = mount();
    const state = createInitialState();
    state.currency = 100_000;

    panel.render(state);

    expect(field('worker-lock').textContent).toContain('5K');
    expect(hireButton().disabled).toBe(true);
  });

  it('hides the milestone note once workers are unlocked', () => {
    const { panel, field } = mount();

    panel.render(unlockedMine());

    expect(field('worker-lock').textContent).toBe('');
  });

  it('enables hiring when the mine can afford it', () => {
    const { panel, hireButton, field } = mount();
    const state = unlockedMine();

    panel.render(state);

    expect(field('hire-cost').textContent.length).toBeGreaterThan(0);
    expect(hireButton().disabled).toBe(false);
  });

  it('disables hiring while the mine cannot afford it', () => {
    const { panel, hireButton } = mount();
    const state = unlockedMine({ currency: 0 });

    panel.render(state);

    expect(hireButton().disabled).toBe(true);
  });

  it('disables hiring once the roster is full', () => {
    const { panel, hireButton } = mount();
    const roster = Array.from({ length: config.workers.maxRoster }, (_, index) =>
      worker({ id: `worker-${index + 1}` }),
    );

    panel.render(unlockedMine({ workers: roster }));

    expect(hireButton().disabled).toBe(true);
  });

  it('dispatches a hireWorker command', () => {
    const { panel, dispatch, hireButton } = mount();
    panel.render(unlockedMine());

    hireButton().click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'hireWorker' });
  });

  it('leases the hire cost for display', () => {
    const { panel, field } = mount();
    const state = unlockedMine();

    panel.render(state);

    expect(Number(field('hire-cost').textContent)).toBe(hireCost(state));
  });

  it('lists each worker with a name, level, and stats', () => {
    const { panel, row, field } = mount();
    const roster = [worker({ speed: 0.05, luck: 0.01 }), worker({ id: 'worker-2', name: 'Bo Hale' })];

    panel.render(unlockedMine({ workers: roster }));

    expect(panel.element.querySelectorAll('[data-worker]')).toHaveLength(2);
    expect(row('worker-1').textContent).toContain('Ada Vale');
    expect(row('worker-1').textContent).toContain('Lv 1');
    expect(row('worker-1').querySelector('[data-field="worker-speed"]').textContent).toContain('5');
    expect(row('worker-1').querySelector('[data-field="worker-luck"]').textContent).toContain('1');
  });

  it('offers an assignment option for every drill and resource category', () => {
    const { panel, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));

    const options = [...row('worker-1').querySelectorAll('option')].map((option) => option.value);

    for (const drillId of Object.keys(drills)) {
      expect(options).toContain(`drill:${drillId}`);
    }
    for (const category of Object.values(RESOURCE_CATEGORIES)) {
      expect(options).toContain(`category:${category}`);
    }
    expect(options).toContain('');
  });

  it('reflects the current assignment', () => {
    const { panel, row } = mount();
    const roster = [worker({ assignment: { kind: 'category', id: RESOURCE_CATEGORIES.GEMS } })];

    panel.render(unlockedMine({ workers: roster }));

    expect(row('worker-1').querySelector('[data-field="worker-assignment"]').value).toBe(
      `category:${RESOURCE_CATEGORIES.GEMS}`,
    );
  });

  it('dispatches an assignWorker command with the chosen target', () => {
    const { panel, dispatch, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));
    const select = row('worker-1').querySelector('[data-field="worker-assignment"]');

    select.value = 'drill:drill-2';
    select.dispatchEvent(new Event('change'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'assignWorker',
      workerId: 'worker-1',
      assignment: { kind: 'drill', id: 'drill-2' },
    });
  });

  it('dispatches an unassign when the worker is set back to idle', () => {
    const { panel, dispatch, row } = mount();
    const roster = [worker({ assignment: { kind: 'drill', id: 'drill-1' } })];
    panel.render(unlockedMine({ workers: roster }));
    const select = row('worker-1').querySelector('[data-field="worker-assignment"]');

    select.value = '';
    select.dispatchEvent(new Event('change'));

    expect(dispatch).toHaveBeenCalledWith({
      type: 'assignWorker',
      workerId: 'worker-1',
      assignment: null,
    });
  });

  it('shows the training cost and dispatches a trainWorker command', () => {
    const { panel, dispatch, row } = mount();
    const roster = [worker()];
    panel.render(unlockedMine({ workers: roster }));

    const trainButton = row('worker-1').querySelector('[data-action="train-worker"]');
    expect(Number(row('worker-1').querySelector('[data-field="train-cost"]').textContent))
      .toBe(trainCost(roster[0]));

    trainButton.click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'trainWorker', workerId: 'worker-1' });
  });

  it('disables training at the level cap', () => {
    const { panel, row } = mount();
    const roster = [worker({ level: config.workers.maxLevel })];

    panel.render(unlockedMine({ workers: roster }));

    expect(row('worker-1').querySelector('[data-action="train-worker"]').disabled).toBe(true);
  });

  it('adds a row when a worker joins the roster', () => {
    const { panel } = mount();
    const state = unlockedMine();
    panel.render(state);
    expect(panel.element.querySelectorAll('[data-worker]')).toHaveLength(0);

    state.workers = [worker()];
    panel.render(state);

    expect(panel.element.querySelectorAll('[data-worker]')).toHaveLength(1);
  });

  it('removes the row when a worker leaves the roster', () => {
    const { panel } = mount();
    const state = unlockedMine({ workers: [worker()] });
    panel.render(state);

    state.workers = [];
    panel.render(state);

    expect(panel.element.querySelectorAll('[data-worker]')).toHaveLength(0);
  });
});
