/**
 * The single numeric interface every economy calculation uses.
 *
 * Two rules make this seam worth the indirection:
 *
 * 1. **Number-first.** Values in the ordinary gameplay range stay plain JS numbers, so `core/`
 *    code and persisted saves look exactly as they did before. Only a value that would overflow
 *    a float is promoted to the big representation, and then it is promoted silently.
 * 2. **No game concepts.** This module knows nothing about drills, currency, or prestige, so the
 *    implementation behind it can be swapped (see `config.numbers.implementation`) without
 *    touching a single gameplay rule.
 *
 * `core/` modules must not do raw arithmetic on currency or resources; they call `M` instead.
 */

import { config } from '../../data/config.js';
import { BIG, isBigMagnitude } from './bigMagnitude.js';

const IMPLEMENTATION = config.numbers?.implementation ?? 'big';

/** In `'float'` mode, overflow stays `Infinity`; the big backend is not consulted. */
function useBig() {
  return IMPLEMENTATION !== 'float';
}

/** Projects a Decimal back to a plain number whenever that does not lose the value. */
function normalize(value) {
  if (!isBigMagnitude(value)) {
    return value;
  }
  const numeric = value.toNumber();
  return Number.isFinite(numeric) ? numeric : value;
}

/** The float view of a magnitude, for the number-first fast path. */
function toPrimitive(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (isBigMagnitude(value)) {
    return value.toNumber();
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? Number.NaN : numeric;
}

/**
 * Parses a stored or computed value into a magnitude.
 *
 * Returns `null` for anything that is not a finite number, so persistence sanitizers can drop
 * unusable fields instead of trusting storage.
 */
export function from(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (isBigMagnitude(value)) {
    return value.isFinite() ? normalize(value) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // `new Decimal('lots')` coerces to 0 rather than NaN, so reject non-numeric strings first.
    if (trimmed.length === 0 || Number.isNaN(Number(trimmed))) {
      return null;
    }
    const numeric = Number(trimmed);
    if (!useBig()) {
      return Number.isFinite(numeric) ? numeric : null;
    }
    return BIG.from(trimmed);
  }
  return null;
}

function binary(a, b, numberOp, bigOp) {
  const result = numberOp(toPrimitive(a), toPrimitive(b));
  if (Number.isFinite(result) || !useBig()) {
    return result;
  }
  return normalize(bigOp(a, b));
}

function compare(a, b) {
  const left = toPrimitive(a);
  const right = toPrimitive(b);
  if (Number.isFinite(left) && Number.isFinite(right)) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (!useBig()) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  return BIG.cmp(a, b);
}

export const M = Object.freeze({
  from,
  add: (a, b) => binary(a, b, (x, y) => x + y, BIG.add),
  sub: (a, b) => binary(a, b, (x, y) => x - y, BIG.sub),
  mul: (a, b) => binary(a, b, (x, y) => x * y, BIG.mul),
  div: (a, b) => binary(a, b, (x, y) => x / y, BIG.div),
  pow: (a, b) => binary(a, b, (x, y) => x ** y, BIG.pow),
  cmp: compare,
  gte: (a, b) => compare(a, b) >= 0,
  lte: (a, b) => compare(a, b) <= 0,
  gt: (a, b) => compare(a, b) > 0,
  lt: (a, b) => compare(a, b) < 0,
  max: (a, b) => (compare(a, b) >= 0 ? normalize(from(a) ?? a) : normalize(from(b) ?? b)),
  min: (a, b) => (compare(a, b) <= 0 ? normalize(from(a) ?? a) : normalize(from(b) ?? b)),
  toNumber: (a) => toPrimitive(a),
  isFinite: (a) => Number.isFinite(toPrimitive(a)),
  toString: (a) => (isBigMagnitude(a) ? a.toString() : String(a)),
});

/** True when `value` is a magnitude this implementation can use. */
export function isMagnitude(value) {
  return from(value) !== null;
}
