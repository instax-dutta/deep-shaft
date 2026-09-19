/**
 * Arbitrary-precision magnitude backend.
 *
 * This is the *only* module allowed to import the big-number library directly. Everything else
 * in `core/` goes through `magnitude.js`, so swapping or upgrading the library is a one-file
 * change.
 *
 * Values that fit in a JS number are projected back to a plain number, so ordinary gameplay
 * keeps working with primitives and only genuinely huge values carry the big representation.
 */

import Decimal from 'break_eternity.js';

export function isBigMagnitude(value) {
  return value instanceof Decimal;
}

function toBig(value) {
  return isBigMagnitude(value) ? value : new Decimal(value);
}

/** A Decimal result collapses to a number whenever that is lossless enough to be portable. */
function normalize(value) {
  const numeric = value.toNumber();
  return Number.isFinite(numeric) ? numeric : value;
}

export const BIG = Object.freeze({
  /** Parses anything Decimal understands, or `null` when the value is not a finite number. */
  from(value) {
    const decimal = toBig(value);
    if (decimal.isNan() || !decimal.isFinite()) {
      return null;
    }
    return normalize(decimal);
  },

  add: (a, b) => normalize(toBig(a).add(toBig(b))),
  sub: (a, b) => normalize(toBig(a).sub(toBig(b))),
  mul: (a, b) => normalize(toBig(a).mul(toBig(b))),
  div: (a, b) => normalize(toBig(a).div(toBig(b))),
  pow: (a, b) => normalize(toBig(a).pow(toBig(b))),
  cmp: (a, b) => toBig(a).cmp(toBig(b)),
  gte: (a, b) => toBig(a).gte(toBig(b)),
  lte: (a, b) => toBig(a).lte(toBig(b)),
  gt: (a, b) => toBig(a).gt(toBig(b)),
  lt: (a, b) => toBig(a).lt(toBig(b)),
  max: (a, b) => normalize(toBig(a).max(toBig(b))),
  min: (a, b) => normalize(toBig(a).min(toBig(b))),
  toNumber: (a) => toBig(a).toNumber(),
  isFinite: (a) => Number.isFinite(toBig(a).toNumber()),
  toString: (a) => toBig(a).toString(),
});
