// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkerPanel } from '../../src/ui/workerPanel.js';
import { createInitialState } from '../../src/core/state.js';
import { hireCost, trainCost } from '../../src/core/workers.js';
import { config } from '../../src/data/config.js';
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

  it('offers an assignment option for the reached drill tiers and every resource category', () => {
    const { panel, row } = mount();
    // Depth 3 on purpose: the panel lists drills the mine can actually reach.
    panel.render(unlockedMine({ depthTier: 3, workers: [worker()] }));

    const options = [...row('worker-1').querySelectorAll('option')].map((option) => option.value);

    for (const drillId of ['drill-1', 'drill-2', 'drill-3']) {
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
    panel.render(unlockedMine({ depthTier: 2, workers: [worker()] }));
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

describe('workerPanel assignment gating and crew management', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('offers only drill tiers the mine has reached', () => {
    const { panel, row } = mount();
    const state = unlockedMine({ depthTier: 2, workers: [worker()] });

    panel.render(state);

    const options = [...row('worker-1').querySelectorAll('option')].map((option) => option.value);
    expect(options).toContain('drill:drill-1');
    expect(options).toContain('drill:drill-2');
    expect(options).not.toContain('drill:drill-3');
    expect(options).not.toContain('drill:drill-5');
  });

  it('grows the drill options when the mine digs deeper', () => {
    const { panel, row } = mount();
    const state = unlockedMine({ depthTier: 1, workers: [worker()] });
    panel.render(state);
    const before = [...row('worker-1').querySelectorAll('option')].map((o) => o.value);

    state.depthTier = 3;
    panel.render(state);

    const after = [...row('worker-1').querySelectorAll('option')].map((o) => o.value);
    expect(before).not.toContain('drill:drill-3');
    expect(after).toContain('drill:drill-3');
  });

  it('keeps an option for a drill the worker is already on even while it is out of depth', () => {
    // A save repaired from an older version can hold a structurally valid assignment to a drill
    // above the current depth. The panel must still show it, or the select would silently clear it.
    const { panel, row } = mount();
    const roster = [worker({ assignment: { kind: 'drill', id: 'drill-4' } })];
    panel.render(unlockedMine({ depthTier: 1, workers: roster }));

    const options = [...row('worker-1').querySelectorAll('option')].map((option) => option.value);
    expect(options).toContain('drill:drill-4');
  });

  it('dispatches a renameWorker command from the rename control', () => {
    const { panel, dispatch, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));
    const renameButton = row('worker-1').querySelector('[data-action="rename-worker"]');
    const input = row('worker-1').querySelector('[data-field="worker-rename"]');

    expect(renameButton).not.toBeNull();
    expect(input).not.toBeNull();

    input.value = 'Tova Irons';
    renameButton.click();

    expect(dispatch).toHaveBeenCalledWith({
      type: 'renameWorker',
      workerId: 'worker-1',
      name: 'Tova Irons',
    });
  });

  it('does not dispatch a rename for a blank name', () => {
    const { panel, dispatch, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));

    row('worker-1').querySelector('[data-field="worker-rename"]').value = '   ';
    row('worker-1').querySelector('[data-action="rename-worker"]').click();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('asks for confirmation before dismissing a worker', () => {
    const { panel, dispatch, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));

    row('worker-1').querySelector('[data-action="dismiss-worker"]').click();
    expect(dispatch).not.toHaveBeenCalled();

    const dialog = document.querySelector('[data-dialog="dismiss-worker"]');
    expect(dialog).not.toBeNull();
    expect(dialog.hidden).toBe(false);
    expect(dialog.textContent).toContain('Ada Vale');

    dialog.querySelector('[data-action="confirm"]').click();
    expect(dispatch).toHaveBeenCalledWith({ type: 'dismissWorker', workerId: 'worker-1' });
  });

  it('cancelling dismissal removes nobody', () => {
    const { panel, dispatch, row } = mount();
    panel.render(unlockedMine({ workers: [worker()] }));

    row('worker-1').querySelector('[data-action="dismiss-worker"]').click();
    const dialog = document.querySelector('[data-dialog="dismiss-worker"]');
    dialog.querySelector('[data-action="cancel"]').click();

    expect(dispatch).not.toHaveBeenCalled();
    expect(dialog.hidden).toBe(true);
  });
});
