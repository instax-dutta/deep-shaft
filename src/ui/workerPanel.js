/**
 * Worker panel.
 *
 * The management layer: hire named workers, put each one on a specific drill or resource
 * category, and train them. Rows are reconciled rather than rebuilt, so a worker keeps its
 * focus and scroll position while the roster changes around it.
 */

import { formatNumber } from '../core/numberFormat.js';
import { canHireWorker, hireCost, trainCost } from '../core/workers.js';
import { config } from '../data/config.js';
import { drills } from '../data/drills.js';
import { CATEGORY_LABELS, ASSIGNMENT_KINDS } from '../data/workers.js';
import { RESOURCE_CATEGORIES } from '../data/resources.js';
import { createElement, field } from './dom.js';

/** Encodes an assignment as a single `<select>` value: 'drill:drill-1'. */
export function encodeAssignment(assignment) {
  return assignment ? `${assignment.kind}:${assignment.id}` : '';
}

export function decodeAssignment(value) {
  if (!value) {
    return null;
  }
  const separator = value.indexOf(':');
  if (separator < 1) {
    return null;
  }
  return { kind: value.slice(0, separator), id: value.slice(separator + 1) };
}

function percent(value, notation) {
  return `${formatNumber(value * 100, { notation })}%`;
}

function createAssignmentSelect(worker, dispatch) {
  const select = createElement('select', {
    className: 'worker__assign',
    attrs: { 'data-field': 'worker-assignment', 'aria-label': `Assignment for ${worker.name}` },
  });

  select.append(createElement('option', { text: 'Idle', attrs: { value: '' } }));
  for (const drill of Object.values(drills)) {
    select.append(
      createElement('option', {
        text: drill.name,
        attrs: { value: `${ASSIGNMENT_KINDS.DRILL}:${drill.id}` },
      }),
    );
  }
  for (const category of Object.values(RESOURCE_CATEGORIES)) {
    select.append(
      createElement('option', {
        text: CATEGORY_LABELS[category],
        attrs: { value: `${ASSIGNMENT_KINDS.CATEGORY}:${category}` },
      }),
    );
  }

  select.addEventListener('change', () => {
    dispatch?.({
      type: 'assignWorker',
      workerId: select.closest('[data-worker]')?.dataset.worker,
      assignment: decodeAssignment(select.value),
    });
  });

  return select;
}

function createRow(worker, dispatch) {
  const name = field('worker-name');
  const level = field('worker-level');
  const speed = field('worker-speed');
  const luck = field('worker-luck');
  const trainCostField = field('train-cost');

  const trainButton = createElement('button', {
    className: 'worker__train',
    text: 'Train',
    attrs: { type: 'button', 'data-action': 'train-worker' },
  });
  trainButton.addEventListener('click', () => {
    dispatch?.({ type: 'trainWorker', workerId: row.dataset.worker });
  });

  const row = createElement('li', {
    className: 'worker',
    dataset: { worker: worker.id },
    children: [
      createElement('div', {
        className: 'worker__head',
        children: [name, level],
      }),
      createElement('div', {
        className: 'worker__stats',
        children: [speed, luck],
      }),
      createAssignmentSelect(worker, dispatch),
      createElement('div', {
        className: 'worker__train-row',
        children: [trainButton, trainCostField],
      }),
    ],
  });

  return { worker, element: row, name, level, speed, luck, trainCostField, trainButton };
}

export function createWorkerPanel({ root, dispatch } = {}) {
  const lockNote = field('worker-lock', '');
  const hireCostField = field('hire-cost', '');
  const list = createElement('ul', { className: 'workers__list' });
  const rows = new Map();

  const hireButton = createElement('button', {
    className: 'workers__hire-button',
    text: 'Hire worker',
    attrs: { type: 'button', 'data-action': 'hire-worker' },
  });
  hireButton.addEventListener('click', () => dispatch?.({ type: 'hireWorker' }));

  const element = createElement('section', {
    className: 'workers',
    attrs: { 'aria-label': 'Workers' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Workers' }),
      lockNote,
      createElement('div', {
        className: 'workers__hire',
        children: [
          createElement('span', { className: 'workers__hire-label', text: 'Hire cost' }),
          hireCostField,
          hireButton,
        ],
      }),
      list,
    ],
  });

  root?.append(element);

  function updateRow(row, worker, notation) {
    row.name.textContent = worker.name;
    row.level.textContent = `Lv ${worker.level}`;
    row.speed.textContent = `+${percent(worker.speed, notation)} speed`;
    row.luck.textContent = `+${percent(worker.luck, notation)} luck`;

    const select = row.element.querySelector('[data-field="worker-assignment"]');
    select.value = encodeAssignment(worker.assignment);

    const cost = trainCost(worker);
    const atCap = worker.level >= config.workers.maxLevel;
    row.trainCostField.textContent = atCap ? 'Max level' : formatNumber(cost, { notation });
    row.trainButton.disabled = atCap;
  }

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    const canHire = canHireWorker(state);
    const unlocked = canHire.reason !== 'workers_locked';

    lockNote.textContent = unlocked
      ? ''
      : `Workers unlock after earning ${formatNumber(config.workers.unlockCurrency, { notation })} in total.`;
    hireCostField.textContent = formatNumber(hireCost(state), { notation });
    hireButton.disabled = !canHire.ok;

    const seen = new Set();
    for (const worker of state.workers) {
      seen.add(worker.id);
      let row = rows.get(worker.id);
      if (!row) {
        row = createRow(worker, dispatch);
        rows.set(worker.id, row);
        list.append(row.element);
      }
      row.worker = worker;
      updateRow(row, worker, notation);
    }

    for (const [id, row] of [...rows]) {
      if (!seen.has(id)) {
        row.element.remove();
        rows.delete(id);
      }
    }
  }

  return { element, render };
}
