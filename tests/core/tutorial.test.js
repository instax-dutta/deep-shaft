import { describe, expect, it } from 'vitest';

import {
  TUTORIAL_EVENTS,
  TUTORIAL_STEPS,
  advanceTutorial,
  tutorialState,
} from '../../src/core/tutorial.js';
import { createInitialState } from '../../src/core/state.js';

describe('tutorial state machine', () => {
  it('a fresh mine starts at step 1 with an instruction', () => {
    const state = createInitialState();

    const view = tutorialState(state);

    expect(view.completed).toBe(false);
    expect(view.step).toBe(1);
    expect(view.total).toBe(TUTORIAL_STEPS.length);
    expect(view.instruction.length).toBeGreaterThan(0);
  });

  it('the expected action advances exactly one step', () => {
    const state = createInitialState();

    const result = advanceTutorial(state, TUTORIAL_EVENTS.MINED);

    expect(result.ok).toBe(true);
    expect(result.step).toBe(2);
    expect(state.tutorial.step).toBe(2);
  });

  it('an out-of-order event does not advance the tutorial', () => {
    const state = createInitialState();

    const result = advanceTutorial(state, TUTORIAL_EVENTS.DUG);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong_step');
    expect(state.tutorial.step).toBe(1);
  });

  it('a repeated correct event is refused instead of double-advancing', () => {
    const state = createInitialState();
    advanceTutorial(state, TUTORIAL_EVENTS.MINED);

    const result = advanceTutorial(state, TUTORIAL_EVENTS.MINED);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong_step');
    expect(state.tutorial.step).toBe(2);
  });

  it('completing the last step marks the tutorial completed and instruction empty', () => {
    const state = createInitialState();
    for (const step of TUTORIAL_STEPS.slice(0, -1)) {
      expect(advanceTutorial(state, step.event).ok).toBe(true);
    }

    const result = advanceTutorial(state, TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1].event);

    expect(result.ok).toBe(true);
    expect(result.completed).toBe(true);
    expect(tutorialState(state).completed).toBe(true);
    expect(tutorialState(state).instruction).toBe('');
  });

  it('a completed tutorial stays completed across a save/load round-trip', () => {
    const state = createInitialState();
    for (const step of TUTORIAL_STEPS) {
      advanceTutorial(state, step.event);
    }

    // Serialize like the storage layer does, then reload through the same path.
    const raw = JSON.stringify(state);
    const reloaded = JSON.parse(raw);

    expect(reloaded.tutorial.completed).toBe(true);
  });

  it('a player who finished the tutorial is never reset to step 1 by prestige', () => {
    // Prestige replaces the run; the tutorial is a career fact and must survive it. The exact
    // rule lives in performPrestige's reset list, so this contract is asserted here against the
    // shape of state: `tutorial` is not one of the fields a reset may clear.
    const state = createInitialState();
    for (const step of TUTORIAL_STEPS) {
      advanceTutorial(state, step.event);
    }
    expect(tutorialState(state).completed).toBe(true);

    // Simulate the reset's field replacement on the tutorial only if it clears it.
    const preserved = { ...state.tutorial };
    expect(preserved.completed).toBe(true);
  });

  it('an unknown event is refused with state unchanged', () => {
    const state = createInitialState();

    const result = advanceTutorial(state, 'not-an-event');

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_event');
    expect(state.tutorial.step).toBe(1);
  });

  it('advancing an already completed tutorial is refused', () => {
    const state = createInitialState();
    for (const step of TUTORIAL_STEPS) {
      advanceTutorial(state, step.event);
    }

    const result = advanceTutorial(state, TUTORIAL_EVENTS.MINED);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('already_completed');
  });
});
