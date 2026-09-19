import { describe, expect, it } from 'vitest';

import { runAutomation, setAutomation } from '../../src/core/automation.js';
import { digDeeperCost } from '../../src/core/depth.js';
import { applyOfflineProgress } from '../../src/core/offline.js';
import { createInitialState } from '../../src/core/state.js';
import { AUTOMATION_KINDS, automationUnlockUpgrade } from '../../src/data/automation.js';
import { config } from '../../src/data/config.js';

const NOW = 1_700_000_000_000;

/** Owns the gating upgrade and switches the behaviour on. */
function unlocked(kind, state) {
  state.prestige.upgrades[automationUnlockUpgrade(kind)] = 1;
  state.automation[kind] = true;
  return state;
}

describe('automation gating', () => {
  it('automation does nothing while locked', () => {
    const state = createInitialState();
    state.resources = { 'tier1-ore': 10 };
    state.currency = 100;

    const result = runAutomation(state, 1);

    expect(result.ok).toBe(true);
    expect(result.actions).toEqual([]);
    expect(state.resources).toEqual({ 'tier1-ore': 10 });
    expect(state.currency).toBe(100);
  });

  it('setting a known kind stores a boolean', () => {
    const state = createInitialState();

    expect(setAutomation(state, AUTOMATION_KINDS.AUTO_BUY, true)).toEqual({
      ok: true,
      kind: AUTOMATION_KINDS.AUTO_BUY,
      enabled: true,
    });
    expect(state.automation[AUTOMATION_KINDS.AUTO_BUY]).toBe(true);
  });

  it('setting an unknown automation kind is refused with state unchanged', () => {
    const state = createInitialState();
    const before = JSON.parse(JSON.stringify(state));

    expect(setAutomation(state, 'not-a-kind', true).reason).toBe('unknown_automation');
    expect(state).toEqual(before);
  });

  it('a locked automation toggle is ignored even if the save sets it true', () => {
    const state = createInitialState();
    state.automation[AUTOMATION_KINDS.AUTO_SELL] = true;
    state.resources = { 'tier1-ore': 5 };

    const result = runAutomation(state, 1);

    expect(result.actions).toEqual([]);
    expect(state.resources).toEqual({ 'tier1-ore': 5 });
  });
});

describe('auto-sell', () => {
  it('converts the whole inventory at the configured sell value and credits earnings', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_SELL, createInitialState());
    state.resources = { 'tier1-ore': 10 };

    const result = runAutomation(state, 1);

    expect(state.currency).toBe(10);
    expect(state.resources).toEqual({});
    expect(result.actions[0]).toMatchObject({ kind: AUTOMATION_KINDS.AUTO_SELL, value: 10 });
  });

  it('preserves the currency invariant when there is nothing to sell', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_SELL, createInitialState());
    state.currency = 5;

    const result = runAutomation(state, 1);

    expect(state.currency).toBe(5);
    expect(result.actions).toEqual([]);
  });
});

describe('auto-buy', () => {
  it('purchases one unit of the cheapest affordable unlocked drill per interval', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_BUY, createInitialState());
    state.currency = 100;

    const result = runAutomation(state, 1);

    expect(state.drills['drill-1']).toBe(1);
    expect(state.currency).toBe(85);
    expect(result.actions[0]).toMatchObject({
      kind: AUTOMATION_KINDS.AUTO_BUY,
      drillId: 'drill-1',
      quantity: 1,
    });
  });

  it('stops at the configured safety bound and never overspends', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_BUY, createInitialState());
    // Rich enough that the next unit is affordable even at the bound, so the bound itself is
    // what stops the purchase rather than the cost curve.
    state.currency = 1e40;
    state.drills['drill-1'] = config.automation.autoBuySafetyBound;

    const result = runAutomation(state, 1);

    expect(state.drills['drill-1']).toBe(config.automation.autoBuySafetyBound);
    expect(state.currency).toBe(1e40);
    expect(result.actions).toEqual([]);
  });

  it('never overspends when the cheapest drill is unaffordable', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_BUY, createInitialState());
    state.currency = 10;

    const result = runAutomation(state, 1);

    expect(state.drills).toEqual({});
    expect(state.currency).toBe(10);
    expect(result.actions).toEqual([]);
  });
});

describe('auto-dig', () => {
  it('only advances depth when the next tier is affordable and enabled', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_DIG, createInitialState());
    state.currency = 0;

    const blocked = runAutomation(state, 1);
    expect(state.depthTier).toBe(1);
    expect(blocked.actions).toEqual([]);

    state.currency = digDeeperCost(state);
    const dug = runAutomation(state, 1);
    expect(state.depthTier).toBe(2);
    expect(dug.actions[0]).toMatchObject({ kind: AUTOMATION_KINDS.AUTO_DIG, tier: 2 });
  });
});

describe('offline automation', () => {
  it('runs during offline catch-up and reports the actions it took', () => {
    const state = unlocked(AUTOMATION_KINDS.AUTO_SELL, createInitialState());
    state.drills = { 'drill-1': 1 };
    state.lastSavedAt = NOW - 3_600_000;

    const result = applyOfflineProgress(state, { nowMs: NOW });

    expect(result.seconds).toBe(3600);
    expect(result.actions.some((action) => action.kind === AUTOMATION_KINDS.AUTO_SELL)).toBe(true);
    expect(state.currency).toBeGreaterThan(0);
  });
});

describe('automation determinism', () => {
  it('is deterministic under an injected clock and random source', () => {
    const build = () => {
      const state = unlocked(AUTOMATION_KINDS.AUTO_SELL, createInitialState());
      state.resources = { 'tier1-ore': 4 };
      return state;
    };
    const left = build();
    const right = build();

    expect(runAutomation(left, 1)).toEqual(runAutomation(right, 1));
    expect(left).toEqual(right);
  });
});
