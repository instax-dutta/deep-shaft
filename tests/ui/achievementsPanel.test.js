// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { createInitialState } from '../../src/core/state.js';
import { createAchievementsPanel } from '../../src/ui/achievementsPanel.js';

function rowFor(panel, id) {
  return panel.element.querySelector(`[data-achievement="${id}"]`);
}

describe('achievements panel', () => {
  it('earned achievements are shown as earned and locked ones show progress', () => {
    const panel = createAchievementsPanel({ announce: vi.fn() });
    const state = createInitialState();
    state.achievements.earned.firstOre = true;
    state.stats.manualExtractions = 1;

    panel.render(state);

    expect(rowFor(panel, 'firstOre').textContent).toContain('Earned');
    expect(rowFor(panel, 'millionaire').textContent).toContain('/');
  });

  it('a newly earned achievement is announced in a toast, not silently', () => {
    const announce = vi.fn();
    const panel = createAchievementsPanel({ announce });

    panel.announce([{ id: 'firstOre', name: 'First Strike' }]);

    expect(announce).toHaveBeenCalledWith(
      expect.stringContaining('First Strike'),
      expect.anything(),
    );
  });

  it('announcing an empty list is silent', () => {
    const announce = vi.fn();
    const panel = createAchievementsPanel({ announce });

    panel.announce([]);

    expect(announce).not.toHaveBeenCalled();
  });
});
