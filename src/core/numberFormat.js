/**
 * Big-number display formatting.
 *
 * Idle games outgrow raw floats within minutes, so every number the player can read goes
 * through here: `1.23K`, `4.56M`, `7.89B`, `1Qa`, and scientific notation once the suffix
 * chain is exhausted. Never render a raw float in the UI.
 *
 * Accepts plain numbers and magnitudes, so a late-game value that passed the float range still
 * reads as `1e400` rather than collapsing to `∞`.
 */

import { M } from './numbers/magnitude.js';

const SUFFIXES = Object.freeze([
  '',
  'K',
  'M',
  'B',
  'T',
  'Qa',
  'Qi',
  'Sx',
  'Sp',
  'Oc',
  'No',
  'Dc',
]);

const SUFFIX_LIMIT = 1000 ** SUFFIXES.length;

/**
 * Formats a value that has outgrown a JS float.
 *
 * A genuine `±Infinity` still reads as the familiar symbol, but an arbitrary-precision value
 * is printed from its own decimal form — never as `Infinity`.
 */
function formatBeyondFloat(value) {
  if (typeof value === 'number') {
    return value > 0 ? '∞' : '-∞';
  }

  const text = M.toString(value);
  if (text === 'Infinity') {
    return '∞';
  }
  if (text === '-Infinity') {
    return '-∞';
  }

  const match = /^(-?)(\d+(?:\.\d+)?)e([+-]?\d+)$/.exec(text);
  if (match) {
    const [, sign, mantissa, exponent] = match;
    return `${sign}${trimTrailingZeros(Number(mantissa).toFixed(2))}e${exponent}`;
  }
  return text;
}

/** Drops the decimal point and trailing zeros: '1.50' -> '1.5', '2.00' -> '2'. */
function trimTrailingZeros(text) {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function formatScientific(magnitude, sign) {
  const exponent = Math.floor(Math.log10(magnitude));
  const mantissa = magnitude / 10 ** exponent;
  return `${sign}${trimTrailingZeros(mantissa.toFixed(2))}e${exponent}`;
}

/** Engineering notation keeps the exponent a multiple of three, so the mantissa reads 1..1000. */
function formatEngineering(magnitude, sign) {
  const exponent = Math.floor(Math.log10(magnitude) / 3) * 3;
  const mantissa = magnitude / 10 ** exponent;
  return `${sign}${trimTrailingZeros(mantissa.toFixed(2))}e${exponent}`;
}

function formatSmall(magnitude) {
  const rounded = Number(magnitude.toFixed(2));
  if (rounded >= 1000) {
    // Rounds up into the next suffix, e.g. 999.999 -> 1K.
    return formatNumber(rounded);
  }
  return Number.isInteger(rounded)
    ? String(rounded)
    : trimTrailingZeros(rounded.toFixed(2));
}

export function formatNumber(value, { notation = 'suffix' } = {}) {
  const numeric = M.toNumber(value);
  if (Number.isNaN(numeric)) {
    return '0';
  }
  if (!Number.isFinite(numeric)) {
    // Either a real Infinity or a value past the float range that still has a big form.
    return formatBeyondFloat(value);
  }

  const sign = numeric < 0 ? '-' : '';
  let magnitude = Math.abs(numeric);

  if (magnitude < 1000) {
    return sign + formatSmall(magnitude);
  }
  if (notation === 'scientific') {
    return formatScientific(magnitude, sign);
  }
  if (notation === 'engineering') {
    return formatEngineering(magnitude, sign);
  }
  if (magnitude >= SUFFIX_LIMIT) {
    return `${sign}${magnitude.toExponential(2)}`;
  }

  let index = 0;
  while (magnitude >= 1000 && index < SUFFIXES.length - 1) {
    magnitude /= 1000;
    index += 1;
  }

  let scaled = Number(magnitude.toFixed(2));
  if (scaled >= 1000 && index < SUFFIXES.length - 1) {
    scaled /= 1000;
    index += 1;
  }

  return `${sign}${trimTrailingZeros(scaled.toFixed(2))}${SUFFIXES[index]}`;
}
