/**
 * Prestige confirmation modal.
 *
 * Retiring a run destroys currency, drills, workers, banked resources, and depth, so the player
 * confirms it against a full statement of the cost rather than a single button. The reward and the
 * penalty are both rendered from `prestigePreview`, which reads the same rules the command applies
 * — the modal never re-derives the math and so cannot drift from it.
 *
 * Opening the modal dispatches nothing. Only the confirm action issues the command.
 */

import { formatNumber } from '../core/numberFormat.js';
import { prestigePreview } from '../core/prestige.js';
import { createElement, field } from './dom.js';
import { trapFocus } from './focusTrap.js';

function plural(count, singular, notation) {
  return `${formatNumber(count, { notation })} ${singular}${count === 1 ? '' : 's'}`;
}

/** Names everything the reset takes, so the penalty is never a surprise. */
function penaltySentence(summary, notation) {
  return [
    'Resets currency,',
    `${plural(summary.drillsLost, 'drill', notation)},`,
    `${plural(summary.workersLost, 'worker', notation)},`,
    'banked resources, and depth',
    `${summary.depthReached}`,
    'back to the start.',
  ].join(' ');
}

function labelledRow(labelText, valueNode) {
  return createElement('div', {
    className: 'prestige__row',
    children: [
      createElement('span', { className: 'prestige__label', text: labelText }),
      createElement('div', { className: 'prestige__value', children: [valueNode] }),
    ],
  });
}

export function createPrestigeModal({ root, dispatch } = {}) {
  const note = field('prestige-note', '');
  const gain = field('prestige-gain', '');
  const points = field('prestige-points-earned', '');
  const nextMultiplier = field('prestige-next', '');
  const runEarned = field('prestige-run-earned', '');
  const lifetimeEarned = field('prestige-lifetime', '');
  const summary = field('prestige-summary', '');

  const trigger = createElement('button', {
    className: 'prestige__action',
    text: 'Prestige',
    attrs: { type: 'button', 'data-action': 'open-prestige' },
  });
  const cancel = createElement('button', {
    className: 'prestige__cancel',
    text: 'Keep mining',
    attrs: { type: 'button', 'data-action': 'cancel-prestige' },
  });
  const confirm = createElement('button', {
    className: 'prestige__confirm',
    text: 'Prestige now',
    attrs: { type: 'button', 'data-action': 'confirm-prestige' },
  });

  const headingId = 'prestige-heading';

  const dialog = createElement('div', {
    className: 'prestige__dialog',
    attrs: {
      'data-dialog': 'prestige',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': headingId,
    },
    children: [
      createElement('div', {
        className: 'prestige__card',
        children: [
          createElement('h3', {
            className: 'prestige__heading',
            text: 'Retire this run?',
            attrs: { id: headingId },
          }),
          labelledRow('Gain', gain),
          labelledRow('Prestige points', points),
          labelledRow('New multiplier', nextMultiplier),
          labelledRow('Earned this run', runEarned),
          labelledRow('Career earnings', lifetimeEarned),
          createElement('p', { className: 'prestige__warning', children: [summary] }),
          createElement('div', {
            className: 'prestige__buttons',
            children: [cancel, confirm],
          }),
        ],
      }),
    ],
  });
  dialog.hidden = true;

  const element = createElement('section', {
    className: 'prestige',
    attrs: { 'aria-label': 'Prestige' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Prestige' }),
      note,
      trigger,
      dialog,
    ],
  });

  root?.append(element);

  let open = false;
  let trap = null;

  function setOpen(next) {
    open = next;
    dialog.hidden = !next;
    if (next) {
      // Trap first, while the opener still holds focus, so release restores it there.
      trap = trapFocus(dialog);
      // Focus the safe option: this action cannot be undone.
      cancel.focus();
    } else {
      // Releasing restores focus to whatever opened the dialog.
      trap?.release();
      trap = null;
    }
  }

  trigger.addEventListener('click', () => {
    if (trigger.disabled) {
      return;
    }
    setOpen(true);
  });

  cancel.addEventListener('click', () => setOpen(false));

  confirm.addEventListener('click', () => {
    if (confirm.disabled) {
      return;
    }
    setOpen(false);
    dispatch?.({ type: 'prestige' });
  });

  // Escape is handled at the document level so it works wherever focus sits. The open check makes
  // a listener left behind by a previous modal inert rather than acting on a closed dialog.
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
    }
  });

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    const preview = prestigePreview(state);
    const { ratio, threshold } = preview.progress;

    if (preview.ok) {
      gain.textContent = `+${formatNumber(preview.gain, { notation })}`;
      points.textContent = `+${formatNumber(preview.points, { notation })}`;
      nextMultiplier.textContent = `x${formatNumber(preview.nextMultiplier, { notation })}`;
      runEarned.textContent = formatNumber(preview.summary.runEarned, { notation });
      lifetimeEarned.textContent = formatNumber(preview.summary.lifetimeEarned, { notation });
      summary.textContent = penaltySentence(preview.summary, notation);
      note.textContent =
        'The multiplier is permanent — it survives every future reset.';
    } else {
      gain.textContent = '';
      points.textContent = '';
      nextMultiplier.textContent = '';
      runEarned.textContent = '';
      lifetimeEarned.textContent = '';
      summary.textContent = '';
      note.textContent = `Prestige unlocks at ${formatNumber(threshold, { notation })} earned this run — ${Math.round(
        ratio * 100,
      )}% there.`;
      // Nothing to confirm while the run is not worth retiring.
      if (open) {
        setOpen(false);
      }
    }

    trigger.disabled = !preview.ok;
    confirm.disabled = !preview.ok;
  }

  return {
    element,
    render,
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
