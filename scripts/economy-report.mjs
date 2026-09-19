#!/usr/bin/env node
/**
 * Economy report.
 *
 * Prints the milestone times and progress curve produced by the deterministic economy simulation
 * (`src/core/simulation.js`) against the real `src/data/` tuning values.
 *
 * This is the human-review half of P12: `tests/core/simulation.test.js` fails if pacing leaves the
 * approved windows, and this prints the curve behind those numbers so a retune can be judged rather
 * than guessed.
 *
 * Usage:
 *   node scripts/economy-report.mjs [--strategy greedy|balanced] [--hours 48] [--step 5]
 *                                   [--sample 1800] [--curve]
 *
 * The exit code is always 0: this is a report, not a gate.
 */

import { config } from '../src/data/config.js';
import { STRATEGIES, simulateRun } from '../src/core/simulation.js';

const DEFAULTS = Object.freeze({
  strategy: STRATEGIES.GREEDY,
  hours: 48,
  step: 5,
  sample: 1_800,
  curve: false,
});

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    switch (flag) {
      case '--strategy':
        options.strategy = value;
        index += 1;
        break;
      case '--hours':
        options.hours = Number(value);
        index += 1;
        break;
      case '--step':
        options.step = Number(value);
        index += 1;
        break;
      case '--sample':
        options.sample = Number(value);
        index += 1;
        break;
      case '--curve':
        options.curve = true;
        break;
      default:
        break;
    }
  }

  return options;
}

/** Human-readable duration: seconds under two minutes, minutes under two hours, else hours. */
export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return 'not reached';
  }
  if (seconds < 120) {
    return `${seconds.toFixed(0)}s`;
  }
  if (seconds < 7_200) {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${(seconds / 3_600).toFixed(2)}h`;
}

function padEnd(text, width) {
  return String(text).padEnd(width, ' ');
}

function printMilestones(result) {
  const rows = [];
  for (let tier = 2; tier <= config.depth.tierCount; tier += 1) {
    rows.push([`Depth ${tier}`, result.milestones[`tier${tier}`]]);
  }
  rows.push(['First prestige', result.milestones.prestige]);

  console.log('\nMilestones');
  for (const [label, seconds] of rows) {
    console.log(`  ${padEnd(label, 16)}${formatDuration(seconds)}`);
  }
}

function printCurve(result) {
  console.log('\nCurve (sampled)');
  console.log(`  ${padEnd('time', 10)}${padEnd('depth', 7)}${padEnd('drills', 8)}${padEnd('currency', 16)}lifetime`);

  for (const point of result.series) {
    console.log(
      `  ${padEnd(formatDuration(point.time), 10)}${padEnd(point.depthTier, 7)}` +
        `${padEnd(point.totalDrills, 8)}${padEnd(point.currency.toExponential(3), 16)}` +
        point.lifetimeEarned.toExponential(3),
    );
  }
}

const options = parseArgs(process.argv.slice(2));
const result = simulateRun({
  strategy: options.strategy,
  maxSeconds: Math.round(options.hours * 3_600),
  stepSeconds: options.step,
  sampleSeconds: options.sample,
});

console.log('Deep Shaft — economy report');
console.log(`  strategy:     ${options.strategy}`);
console.log(`  horizon:      ${options.hours}h (step ${options.step}s)`);
console.log(`  ticks:        ${result.ticks}`);
console.log(`  prestiges:    ${result.prestiges}`);
console.log(
  `  depth ladder: cost x${config.depth.unlockCostGrowthRate} per tier, ` +
    `output x${config.production.depthOutputGrowth} per tier`,
);

printMilestones(result);
if (options.curve) {
  printCurve(result);
}
