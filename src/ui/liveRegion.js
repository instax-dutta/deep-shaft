/**
 * Screen-reader announcements for milestone crossings.
 *
 * The live region is polite and deliberately low-frequency: it announces *transitions* (a new
 * depth, prestige becoming available, workers unlocking), never a per-tick value. An announcer
 * snapshots the milestone facts it has already reported, so a re-render of unchanged state is
 * silent instead of repeating itself every 200ms.
 */

import { canPrestige } from '../core/prestige.js';
import { workersUnlocked } from '../core/workers.js';
import { createElement } from './dom.js';

export function createLiveRegion({ root } = {}) {
  const element = createElement('div', {
    className: 'live-region',
    attrs: { role: 'status', 'aria-live': 'polite' },
  });

  root?.append(element);

  return {
    element,
    announce(message) {
      if (message) {
        element.textContent = message;
      }
    },
  };
}

/** The facts a transition is measured against — never per-tick numbers. */
function milestoneSnapshot(state) {
  return {
    depthTier: state.depthTier,
    prestige: canPrestige(state),
    workers: workersUnlocked(state),
  };
}

export function thresholdCrossings(previous, next) {
  const messages = [];

  if (next.depthTier !== previous.depthTier) {
    messages.push(`Now working depth ${next.depthTier}.`);
  }
  if (next.prestige && !previous.prestige) {
    messages.push('Prestige is available.');
  }
  if (next.workers && !previous.workers) {
    messages.push('Workers are available to hire.');
  }

  return messages;
}

export function createAnnouncer({ region }) {
  let previous = { depthTier: 1, prestige: false, workers: false };

  return {
    /** Reports only what is newly crossed, and returns those messages for testing. */
    update(state) {
      const next = milestoneSnapshot(state);
      const messages = thresholdCrossings(previous, next);
      previous = next;

      for (const message of messages) {
        region.announce(message);
      }
      return messages;
    },
  };
}
