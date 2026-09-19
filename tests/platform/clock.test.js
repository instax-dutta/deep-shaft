import { describe, expect, it } from 'vitest';

import { createClock } from '../../src/platform/clock.js';

describe('createClock', () => {
  it('reads the current time in milliseconds from the injected source', () => {
    const clock = createClock(() => 1_700_000_000_000);

    expect(clock.now()).toBe(1_700_000_000_000);
  });

  it('reads the source on every call so time keeps moving', () => {
    let current = 1_000;
    const clock = createClock(() => current);

    current = 2_500;

    expect(clock.now()).toBe(2_500);
  });

  it('falls back to the system clock when no source is injected', () => {
    const clock = createClock();

    expect(Number.isFinite(clock.now())).toBe(true);
  });
});
