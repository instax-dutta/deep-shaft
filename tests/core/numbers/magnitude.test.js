import { describe, expect, it } from 'vitest';

import { M } from '../../../src/core/numbers/magnitude.js';

describe('M.from', () => {
  it('accepts numbers, numeric strings, and magnitudes', () => {
    expect(M.toNumber(M.from(42))).toBe(42);
    expect(M.toNumber(M.from('42.5'))).toBe(42.5);
    expect(M.toNumber(M.from(M.from(7)))).toBe(7);
  });

  it('returns null for values that are not numeric', () => {
    expect(M.from('lots')).toBeNull();
    expect(M.from(null)).toBeNull();
    expect(M.from(Number.NaN)).toBeNull();
    expect(M.from(undefined)).toBeNull();
  });
});

describe('M arithmetic', () => {
  it('add / sub / mul / div compose correctly across types', () => {
    expect(M.toNumber(M.add(2, 3))).toBe(5);
    expect(M.toNumber(M.sub(10, 4))).toBe(6);
    expect(M.toNumber(M.mul(6, '7'))).toBe(42);
    expect(M.toNumber(M.div(9, 3))).toBe(3);
    expect(M.toNumber(M.add(M.from('1.5'), 2.5))).toBe(4);
  });

  it('cmp and its comparisons order correctly, including equal values', () => {
    expect(M.cmp(1, 2)).toBe(-1);
    expect(M.cmp(2, 2)).toBe(0);
    expect(M.cmp(3, 2)).toBe(1);
    expect(M.lt(1, 2)).toBe(true);
    expect(M.lte(2, 2)).toBe(true);
    expect(M.gt(3, 2)).toBe(true);
    expect(M.gte(2, 3)).toBe(false);
    expect(M.max(2, 9)).toBe(9);
    expect(M.min(2, 9)).toBe(2);
  });

  it('pow handles the drill and prestige exponents', () => {
    expect(M.toNumber(M.pow(1.15, 10))).toBeCloseTo(1.15 ** 10, 10);
    expect(M.toNumber(M.pow(3, 4))).toBe(81);
  });
});

describe('M numeric range', () => {
  it('toNumber returns a finite number for in-range values', () => {
    expect(M.toNumber(M.pow(10, 300))).toBe(1e300);
    expect(Number.isFinite(M.toNumber(M.add(1e300, 1e300)))).toBe(true);
  });

  it('isFinite is false for values beyond JS float range', () => {
    expect(M.isFinite(M.from(1e300))).toBe(true);
    expect(M.isFinite(M.from('1e400'))).toBe(false);
    expect(M.isFinite(M.pow(10, 400))).toBe(false);
  });

  it('toNumber is Infinity only for genuine numeric overflow', () => {
    expect(M.toNumber(M.from('1e400'))).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('M beyond float range', () => {
  it('values beyond JS float range still add, subtract, compare, and multiply correctly', () => {
    const huge = M.from('1e400');
    const bigger = M.mul(huge, 10);

    expect(M.gt(bigger, huge)).toBe(true);
    expect(M.cmp(bigger, huge)).toBe(1);
    expect(M.toString(M.sub(bigger, huge))).not.toBe('0');
    expect(M.toString(M.add(huge, huge))).toContain('e400');
    expect(M.isFinite(bigger)).toBe(false);
  });

  it('a large base raised by a big exponent does not collapse to Infinity', () => {
    const raised = M.pow(M.from('1e300'), 100);

    expect(M.isFinite(raised)).toBe(false);
    expect(M.toString(raised)).not.toContain('Infinity');
    expect(M.toNumber(raised)).toBe(Number.POSITIVE_INFINITY);
  });

  it('mixed number and big magnitudes compare without losing the big side', () => {
    expect(M.gt(M.from('1e400'), 1e300)).toBe(true);
    expect(M.lt(1e300, M.from('1e400'))).toBe(true);
    expect(M.toString(M.max(M.from('1e400'), 1e300))).toBe(M.toString(M.from('1e400')));
  });
});
