/**
 * Worker panel.
 *
 * The management layer: hire named workers, put each one on a specific drill or resource
 * category, rename, train, or dismiss them. Rows are reconciled rather than rebuilt, so a
 * worker keeps its focus and scroll position while the roster changes around it.
 *
 * Assignment options are depth-gated: a drill the mine has not reached is not a target. The
 * one exception is a drill the worker is *already* assigned to — a save can legitimately hold
 * such an assignment, and silently dropping it from the list would clear crew work.
 */

import { formatNumber } from '../core/numberFormat.js';
import { canHireWorker, hireCost, trainCost } from '../core/workers.js';
import { config } from '../data/config.js';
import { drills } from '../data/drills.js';
import { CATEGORY_LABELS, ASSIGNMENT_KINDS } from '../data/workers.js';
import { RESOURCE_CATEGORIES } from '../data/resources.js';
import { createConfirmModal } from './confirmModal.js';
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

/**
 * The drill options a mine may assign to right now: every reached tier, plus a drill a worker
 * is already on even if the mine has since moved on (it shows as the current selection).
 */
function assignableDrills(state) {
  const reached = Object.values(drills).filter((drill) => drill.tier <= state.depthTier);
  const held = new Set(
    (state.workers ?? [])
      .filter((worker) => worker.assignment?.kind === ASSIGNMENT_KINDS.DRILL)
      .map((worker) => worker.assignment.id),
  );
  const byId = new Map();
  for (const drill of [...reached, ...Object.values(drills).filter((drill) => held.has(drill.id))]) {
    byId.set(drill.id, drill);
  }
  return [...byId.values()];
}

function createAssignmentSelect(worker, dispatch) {
  const select = createElement('select', {
    className: 'worker__assign',
    attrs: { 'data-field': 'worker-assignment', 'aria-label': `Assignment for ${worker.name}` },
  });

  select.append(createElement('option', { text: 'Idle', attrs: { value: '' } }));
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

/** Refreshes the drill options to the mine's current reach, preserving the chosen value. */
function refreshDrillOptions(select, state) {
  // Keyed on the reachable drill set: rendering runs every tick, and rebuilding options under an
  // open native dropdown glitches it, so a select must only be touched when its content changes.
  const signature = `${state.depthTier}|${assignableDrills(state).map((drill) => drill.id).join(',')}`;
  if (select.dataset.drillSignature === signature) {
    return;
  }
  select.dataset.drillSignature = signature;

  const current = select.value;
  // Options after the fixed Idle + category block.
  for (const option of [...select.options].slice(1 + Object.values(RESOURCE_CATEGORIES).length)) {
    option.remove();
  }

  for (const drill of assignableDrills(state)) {
    select.append(
      createElement('option', {
        text: drill.name,
        attrs: { value: `${ASSIGNMENT_KINDS.DRILL}:${drill.id}` },
      }),
    );
  }

  if ([...select.options].some((option) => option.value === current)) {
    select.value = current;
  }
}

function createRow(worker, dispatch, { onDismiss }) {
  const handle = { worker };
  const name = field('worker-name');
  const level = field('worker-level');
  const speed = field('worker-speed');
  const luck = field('worker-luck');
  const trainCostField = field('train-cost');
  const renameInput = createElement('input', {
    className: 'worker__rename',
    attrs: {
      type: 'text',
      'data-field': 'worker-rename',
      'aria-label': `Rename ${worker.name}`,
    },
  });

  const trainButton = createElement('button', {
    className: 'worker__train',
    text: 'Train',
    attrs: { type: 'button', 'data-action': 'train-worker' },
  });
  trainButton.addEventListener('click', () => {
    dispatch?.({ type: 'trainWorker', workerId: row.dataset.worker });
  });

  const renameButton = createElement('button', {
    className: 'worker__rename-button',
    text: 'Rename',
    attrs: { type: 'button', 'data-action': 'rename-worker' },
  });
  renameButton.addEventListener('click', () => {
    const name = renameInput.value;
    if (name.trim().length === 0) {
      return;
    }
    dispatch?.({ type: 'renameWorker', workerId: row.dataset.worker, name });
  });

  const dismissButton = createElement('button', {
    className: 'worker__dismiss',
    text: 'Dismiss',
    attrs: { type: 'button', 'data-action': 'dismiss-worker', 'aria-label': `Dismiss ${worker.name}` },
  });
  dismissButton.addEventListener('click', () => {
    onDismiss?.(row.dataset.worker, handle.worker?.name ?? '');
  });

  const row = createElement('li', {
    className: 'worker',
    dataset: { worker: worker.id },
    children: [
      createElement('div', {
        className: 'worker__head',
        children: [name, level, dismissButton],
      }),
      createElement('div', {
        className: 'worker__stats',
        children: [speed, luck],
      }),
      createAssignmentSelect(worker, dispatch),
      createElement('div', {
        className: 'worker__rename-row',
        children: [renameInput, renameButton],
      }),
      createElement('div', {
        className: 'worker__train-row',
        children: [trainButton, trainCostField],
      }),
    ],
  });

  handle.element = row;
  handle.name = name;
  handle.level = level;
  handle.speed = speed;
  handle.luck = luck;
  handle.trainCostField = trainCostField;
  handle.trainButton = trainButton;
  handle.renameInput = renameInput;
  return handle;
}


export function createWorkerPanel({ root, dispatch } = {}) {
  const lockNote = field('worker-lock', '');
  const hireCostField = field('hire-cost', '');
  const list = createElement('ul', { className: 'workers__list' });
  const rows = new Map();

  // Dismissing is irreversible and pays no refund, so it goes through the shared destructive
  // confirmation. Opening dispatches nothing; only the modal's confirm issues the command.
  const dismissModal = createConfirmModal({
    title: 'Dismiss this worker?',
    message: '',
    confirmLabel: 'Dismiss',
    cancelLabel: 'Keep',
    dialogName: 'dismiss-worker',
    onConfirm: () => dispatch?.({ type: 'dismissWorker', workerId: pendingDismissId }),
  });
  let pendingDismissId = null;

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
      dismissModal.element,
    ],
  });

  root?.append(element);

  function askDismiss(workerId, workerName) {
    pendingDismissId = workerId;
    dismissModal.open();
    const message = dismissModal.element.querySelector('.confirm__message');
    if (message) {
      message.textContent = `${workerName || 'This worker'} leaves the crew and does not refund their hire cost.`;
    }
  }

  function updateRow(row, worker, state, notation) {
    row.name.textContent = worker.name;
    row.level.textContent = `Lv ${worker.level}`;
    row.speed.textContent = `+${percent(worker.speed, notation)} speed`;
    row.luck.textContent = `+${percent(worker.luck, notation)} luck`;

    const select = row.element.querySelector('[data-field="worker-assignment"]');
    refreshDrillOptions(select, state);
    const encoded = encodeAssignment(worker.assignment);
    if (select.value !== encoded) {
      select.value = encoded;
    }

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
        row = createRow(worker, dispatch, { onDismiss: askDismiss });
        rows.set(worker.id, row);
        list.append(row.element);
      }
      row.worker = worker;
      updateRow(row, worker, state, notation);
    }

    for (const [id, row] of [...rows]) {
      if (!seen.has(id)) {
        row.element.remove();
        rows.delete(id);
      }
    }

    // A dismissed worker's modal must not offer an action that can no longer succeed.
    if (pendingDismissId !== null && !seen.has(pendingDismissId)) {
      pendingDismissId = null;
      dismissModal.close();
    }
  }

  return { element, render };
}
