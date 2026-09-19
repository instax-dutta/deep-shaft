import { describe, expect, it } from 'vitest';

import { M } from '../../src/core/numbers/magnitude.js';
import { formatNumber } from '../../src/core/numberFormat.js';

describe('formatNumber', () => {
  it('renders small integers without a suffix', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(7)).toBe('7');
    expect(formatNumber(999)).toBe('999');
  });

  it('abbreviates thousands with a K suffix', () => {
    expect(formatNumber(1_000)).toBe('1K');
    expect(formatNumber(1_234)).toBe('1.23K');
    expect(formatNumber(12_345)).toBe('12.35K');
  });

  it('abbreviates millions, billions, and trillions', () => {
    expect(formatNumber(1_000_000)).toBe('1M');
    expect(formatNumber(1_234_000)).toBe('1.23M');
    expect(formatNumber(1_000_000_000)).toBe('1B');
    expect(formatNumber(1_000_000_000_000)).toBe('1T');
  });

  it('keeps going past trillions instead of printing a raw float', () => {
    expect(formatNumber(1_000_000_000_000_000)).toBe('1Qa');
  });

  it('promotes a rounded value into the next suffix', () => {
    expect(formatNumber(999_999)).toBe('1M');
    expect(formatNumber(999)).toBe('999');
  });

  it('trims trailing zeros so values read cleanly', () => {
    expect(formatNumber(1_500)).toBe('1.5K');
    expect(formatNumber(2_000_000)).toBe('2M');
  });

  it('rounds fractions below one thousand to two decimals', () => {
    expect(formatNumber(12.3456)).toBe('12.35');
    expect(formatNumber(0.5)).toBe('0.5');
  });

  it('never returns an unformatted float for a fractional value', () => {
    expect(formatNumber(0.3333333333)).toBe('0.33');
  });

  it('keeps the sign on negative values', () => {
    expect(formatNumber(-1_234)).toBe('-1.23K');
    expect(formatNumber(-4)).toBe('-4');
  });

  it('handles non-finite input without printing NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('0');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('∞');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('-∞');
  });

  it('the default notation is unchanged from v1 for existing callers', () => {
    expect(formatNumber(1_234)).toBe('1.23K');
    expect(formatNumber(1_234, {})).toBe('1.23K');
    expect(formatNumber(1_234, { notation: 'suffix' })).toBe('1.23K');
  });

  it('scientific notation formats large values as coefficient times power of ten', () => {
    expect(formatNumber(1_234, { notation: 'scientific' })).toBe('1.23e3');
    expect(formatNumber(12_345, { notation: 'scientific' })).toBe('1.23e4');
  });

  it('engineering notation uses powers of three', () => {
    expect(formatNumber(12_345, { notation: 'engineering' })).toBe('12.35e3');
    expect(formatNumber(1_234_567, { notation: 'engineering' })).toBe('1.23e6');
  });

  it('formats a value beyond 1e308 as scientific, never Infinity', () => {
    const huge = M.pow(10, 400);

    const text = formatNumber(huge);

    expect(M.isFinite(huge)).toBe(false);
    expect(text).not.toContain('Infinity');
    expect(text).not.toBe('∞');
    expect(text).toContain('e400');
  });
});
