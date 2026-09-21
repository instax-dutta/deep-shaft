/**
 * Settings panel.
 *
 * Notation, motion/sound/haptics preferences, and the save lifecycle: export, import, and the
 * destructive reset. Export and import use the pure `core/saveTransfer.js` functions, so the
 * panel validates an import before dispatching anything — an unreadable paste surfaces an inline
 * error and leaves the current mine untouched.
 *
 * Reset goes through a confirm modal that states the full loss and dispatches nothing until the
 * player confirms.
 */

import { exportSave, importSave } from '../core/saveTransfer.js';
import { createConfirmModal } from './confirmModal.js';
import { createElement, field } from './dom.js';

const NOTATION_OPTIONS = Object.freeze([
  ['suffix', 'Short — 1.23K'],
  ['scientific', 'Scientific — 1.23e6'],
  ['engineering', 'Engineering — 1.23e6'],
]);

const IMPORT_ERROR_COPY = Object.freeze({
  empty: 'Paste a save first.',
  corrupt: 'That text is not valid save data.',
  not_a_save: 'That does not look like a Deep Shaft save.',
  unsupported_future: 'That save is from a newer version of the game.',
});

const RESET_MESSAGE =
  'This permanently deletes your mine — currency, drills, crew, depth, prestige points, ' +
  'upgrades, and achievements — and cannot be undone. Export your save first if you want to keep it.';

/** Root classes a settings block implies. Applied by the composition root. */
export function settingsRootClasses(settings) {
  const classes = [];
  if (settings?.reducedMotion === true) {
    classes.push('reduced-motion');
  }
  return classes;
}

function createToggleRow(key, labelText, dispatch) {
  const input = createElement('input', {
    attrs: { type: 'checkbox', id: `setting-${key}`, 'data-setting': key },
  });
  input.addEventListener('change', () => {
    dispatch?.({ type: 'setSetting', key, value: input.checked });
  });

  const row = createElement('div', {
    className: 'setting__row',
    children: [
      createElement('label', { text: labelText, attrs: { for: `setting-${key}` } }),
      input,
    ],
  });

  return { row, input };
}

export function createSettingsPanel({ root, dispatch, diagnostics, version = '' } = {}) {
  const notation = createElement('select', {
    className: 'settings__notation',
    attrs: { id: 'setting-notation', 'data-setting': 'notation' },
  });
  for (const [value, label] of NOTATION_OPTIONS) {
    notation.append(createElement('option', { text: label, attrs: { value } }));
  }
  notation.addEventListener('change', () => {
    dispatch?.({ type: 'setSetting', key: 'notation', value: notation.value });
  });

  const motionToggle = createToggleRow('reducedMotion', 'Reduce motion', dispatch);
  const soundToggle = createToggleRow('sound', 'Sound', dispatch);
  const hapticsToggle = createToggleRow('haptics', 'Haptics', dispatch);

  const volumeInput = createElement('input', {
    attrs: { type: 'range', min: '0', max: '1', step: '0.05', id: 'setting-volume', 'data-setting': 'volume' },
  });
  volumeInput.addEventListener('input', () => {
    dispatch?.({ type: 'setSetting', key: 'volume', value: Number(volumeInput.value) });
  });
  const volumeRow = createElement('div', {
    className: 'setting__row',
    children: [
      createElement('label', { text: 'Volume', attrs: { for: 'setting-volume' } }),
      volumeInput,
    ],
  });

  const exportText = createElement('textarea', {
    className: 'settings__save-text',
    attrs: { 'data-field': 'export-text', readonly: 'true', 'aria-label': 'Exported save' },
  });
  const importText = createElement('textarea', {
    className: 'settings__save-text',
    attrs: {
      'data-field': 'import-text',
      'aria-label': 'Save to import',
      placeholder: 'Paste a save here',
    },
  });
  const importError = field('import-error', '');

  // Diagnostics: a bounded, local-only problem log and the version, so a player reporting an
  // issue has something concrete to hand over. Rendered in a closed details element by default.
  const diagnosticsReport = field('diagnostics-report', '');

  const exportButton = createElement('button', {
    className: 'settings__action',
    text: 'Export save',
    attrs: { type: 'button', 'data-action': 'export-save' },
  });
  const importButton = createElement('button', {
    className: 'settings__action',
    text: 'Import save',
    attrs: { type: 'button', 'data-action': 'import-save' },
  });
  const resetButton = createElement('button', {
    className: 'settings__action settings__action--danger',
    text: 'Reset game',
    attrs: { type: 'button', 'data-action': 'reset-game' },
  });

  const confirmModal = createConfirmModal({
    title: 'Reset the whole mine?',
    message: RESET_MESSAGE,
    confirmLabel: 'Reset everything',
    cancelLabel: 'Keep my mine',
    dialogName: 'confirm-reset',
    onConfirm: () => dispatch?.({ type: 'resetGame' }),
  });
  resetButton.addEventListener('click', () => confirmModal.open());

  const element = createElement('section', {
    className: 'settings',
    attrs: { 'aria-label': 'Settings' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Settings' }),
      createElement('div', {
        className: 'setting__row',
        children: [
          createElement('label', { text: 'Number format', attrs: { for: 'setting-notation' } }),
          notation,
        ],
      }),
      createElement('div', {
        className: 'setting__list',
        children: [motionToggle.row, soundToggle.row, volumeRow, hapticsToggle.row],
      }),
      createElement('h3', { className: 'panel__subtitle', text: 'Save data' }),
      exportButton,
      exportText,
      importText,
      importButton,
      importError,
      createElement('h3', { className: 'panel__subtitle', text: 'Danger zone' }),
      resetButton,
      confirmModal.element,
      createElement('details', {
        className: 'settings__diagnostics',
        children: [
          createElement('summary', { text: 'Diagnostics' }),
          diagnosticsReport,
        ],
      }),
    ],
  });

  let currentState = null;

  exportButton.addEventListener('click', () => {
    if (currentState) {
      exportText.value = exportSave(currentState);
    }
  });

  importButton.addEventListener('click', () => {
    const result = importSave(importText.value);
    if (!result.ok) {
      importError.textContent = IMPORT_ERROR_COPY[result.reason] ?? 'That save could not be read.';
      return;
    }
    importError.textContent = '';
    // Dispatch the already-validated state: the import cannot fail after this point.
    dispatch?.({ type: 'importSave', state: result.state });
  });

  function render(state) {
    currentState = state;
    // Only touch a select when its value actually changes: rendering runs every tick, and
    // writing to a control under an open native dropdown glitches it.
    if (notation.value !== state.settings.notation) {
      notation.value = state.settings.notation;
    }
    motionToggle.input.checked = state.settings.reducedMotion === true;
    soundToggle.input.checked = state.settings.sound === true;
    hapticsToggle.input.checked = state.settings.haptics === true;
    volumeInput.value = String(state.settings.volume ?? 0.6);

    const report = diagnostics?.report?.();
    diagnosticsReport.textContent = report
      ? `Version ${version || 'unknown'} — ${report.count} problem${report.count === 1 ? '' : 's'} recorded${
          report.errors.length > 0 ? `: ${report.errors.map((entry) => entry.message).join('; ')}` : ''
        }`
      : `Version ${version || 'unknown'} — no problem log.`;
  }

  root?.append(element);

  return { element, render, confirmModal };
}
