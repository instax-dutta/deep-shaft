/**
 * Achievements panel.
 *
 * One row per achievement: earned ones read "Earned", locked ones show how far along the player
 * is. Progress comes from `src/core/achievements.js`, so the panel never derives a condition
 * itself. Newly earned achievements are announced through an injected `announce` callback
 * (wired to the toast in `main.js`) rather than appearing silently.
 */

import { achievementProgress } from '../core/achievements.js';
import { formatNumber } from '../core/numberFormat.js';
import { achievements } from '../data/achievements.js';
import { createElement, field } from './dom.js';

const noop = () => {};

export function createAchievementsPanel({ root, announce = noop } = {}) {
  const rows = new Map();
  const list = createElement('div', { className: 'achievements__list' });

  for (const definition of achievements) {
    const status = field('achievement-status', '');
    const row = createElement('div', {
      className: 'achievement',
      dataset: { achievement: definition.id, earned: 'false' },
      children: [
        createElement('div', {
          className: 'achievement__text',
          children: [
            createElement('span', { className: 'achievement__name', text: definition.name }),
            createElement('span', {
              className: 'achievement__description',
              text: definition.description,
            }),
          ],
        }),
        status,
      ],
    });

    rows.set(definition.id, { row, status });
    list.append(row);
  }

  const element = createElement('section', {
    className: 'achievements',
    attrs: { 'aria-label': 'Achievements' },
    children: [
      createElement('h2', { className: 'panel__title', text: 'Achievements' }),
      list,
    ],
  });

  root?.append(element);

  function render(state) {
    const notation = state.settings?.notation ?? 'suffix';
    for (const definition of achievements) {
      const entry = rows.get(definition.id);
      const earned = state.achievements?.earned?.[definition.id] === true;
      entry.row.dataset.earned = String(earned);

      if (earned) {
        entry.status.textContent = 'Earned';
        continue;
      }

      const progress = achievementProgress(state, definition.id);
      entry.status.textContent = progress
        ? `${formatNumber(progress.current, { notation })} / ${formatNumber(progress.target, { notation })}`
        : '';
    }
  }

  function announceEarned(newlyEarned) {
    if (!Array.isArray(newlyEarned) || newlyEarned.length === 0) {
      return;
    }
    const names = newlyEarned.map((entry) => entry.name).join(', ');
    announce(`Achievement unlocked: ${names}`, { tone: 'good' });
  }

  return { element, render, announce: announceEarned };
}
