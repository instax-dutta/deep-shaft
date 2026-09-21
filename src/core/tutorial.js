/**
 * First-run tutorial: a tiny explicit state machine over the core loop.
 *
 * The tutorial is four named steps — mine, sell, buy a drill, dig deeper — advanced by the
 * commands the player actually issues. It is a career fact: prestige replaces the run but never
 * re-runs the tutorial, so a returning player is never nagged twice.
 *
 * Advancing is driven by the composition layer, which calls `advanceTutorial` after a successful
 * command. The machine itself never reads currency or drills; it only follows the order of
 * events, so it stays pure and testable.
 */

export const TUTORIAL_EVENTS = Object.freeze({
  MINED: 'mined',
  SOLD: 'sold',
  BOUGHT_DRILL: 'boughtDrill',
  DUG: 'dug',
  DISMISSED: 'dismissed',
});

/** One step per entry, in the order a first-time player experiences the loop. */
export const TUTORIAL_STEPS = Object.freeze([
  {
    event: TUTORIAL_EVENTS.MINED,
    instruction: 'Tap the shaft to mine ore by hand.',
  },
  {
    event: TUTORIAL_EVENTS.SOLD,
    instruction: 'Sell your ore for currency.',
  },
  {
    event: TUTORIAL_EVENTS.BOUGHT_DRILL,
    instruction: 'Buy a drill so the mine works without you.',
  },
  {
    event: TUTORIAL_EVENTS.DUG,
    instruction: 'Dig deeper to find richer resources.',
  },
]);

export function createTutorialState() {
  return { step: 1, completed: false };
}

/**
 * The current tutorial view, or a completed marker for everyone past the first run.
 *
 * A fresh mine starts at step 1; a completed tutorial reports no instruction so the panel can
 * hide itself entirely.
 */
export function tutorialState(state) {
  const tutorial = state.tutorial ?? createTutorialState();
  if (tutorial.completed) {
    return { step: TUTORIAL_STEPS.length, total: TUTORIAL_STEPS.length, completed: true, instruction: '' };
  }

  const index = Math.min(Math.max(Math.floor(tutorial.step) || 1, 1), TUTORIAL_STEPS.length);
  return {
    step: index,
    total: TUTORIAL_STEPS.length,
    completed: false,
    instruction: TUTORIAL_STEPS[index - 1]?.instruction ?? '',
  };
}

/**
 * Attempts one step of the tutorial.
 *
 * Only the step's own event advances it; an out-of-order or repeated event is refused with the
 * state untouched, so a player spamming the shaft cannot skip ahead or double-advance.
 */
export function advanceTutorial(state, event) {
  const tutorial = state.tutorial ?? createTutorialState();
  if (tutorial.completed) {
    return { ok: false, reason: 'already_completed' };
  }
  if (!Object.values(TUTORIAL_EVENTS).includes(event)) {
    return { ok: false, reason: 'unknown_event' };
  }

  const expected = TUTORIAL_STEPS[tutorial.step - 1];
  if (!expected || expected.event !== event) {
    return { ok: false, reason: 'wrong_step' };
  }

  if (tutorial.step >= TUTORIAL_STEPS.length) {
    tutorial.completed = true;
    return {
      ok: true,
      step: tutorial.step,
      completed: true,
      newlyCompleted: true,
    };
  }

  tutorial.step += 1;
  return { ok: true, step: tutorial.step, completed: false, newlyCompleted: false };
}
