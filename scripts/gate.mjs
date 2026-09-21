/**
 * One-command production gate.
 *
 * Runs every verification suite in order — unit tests, production build, and the browser
 * checks — and prints a summary table. Exits non-zero on the first failure so it can be used
 * as a release stop, and reports the real command output so a failure is diagnosable.
 *
 * The individual commands remain available (`npm test`, `npm run test:browser`, ...). This is
 * the aggregate gate every phase in the v2 plan is expected to leave green.
 */

import { spawnSync } from 'node:child_process';

/** The gate, in order. Later entries depend on the earlier ones having passed. */
const STEPS = [
  { label: 'Unit tests', command: 'npm', args: ['test', '--', '--run'] },
  { label: 'Production build', command: 'npm', args: ['run', 'build'] },
  { label: 'Browser smoke + events', command: 'npm', args: ['run', 'test:browser'] },
  { label: 'Browser responsive layout', command: 'npm', args: ['run', 'test:browser:responsive'] },
  { label: 'Browser shaft render', command: 'npm', args: ['run', 'test:browser:render'] },
  { label: 'Browser PWA + offline', command: 'npm', args: ['run', 'test:browser:pwa'] },
  { label: 'Browser soak (30s)', command: 'npm', args: ['run', 'test:browser:soak'] },
  { label: 'Browser perf', command: 'npm', args: ['run', 'test:browser:perf'] },
  { label: 'Boot failure fallback', command: 'npm', args: ['run', 'test:browser:boot-failure'] },
];

function runStep(step) {
  const started = Date.now();
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return {
    ...step,
    ok: result.status === 0,
    seconds: (Date.now() - started) / 1000,
  };
}

function printSummary(results) {
  const width = Math.max(...results.map((entry) => entry.label.length));
  console.log('\nProduction gate summary');
  console.log('─'.repeat(width + 24));
  for (const entry of results) {
    const status = entry.ok ? 'PASS' : 'FAIL';
    console.log(`${entry.label.padEnd(width)}  ${status}  ${entry.seconds.toFixed(1)}s`);
  }
  console.log('─'.repeat(width + 24));
}

const results = [];
for (const step of STEPS) {
  const result = runStep(step);
  results.push(result);
  if (!result.ok) {
    // Do not run later steps against a broken earlier one: a failing build makes the browser
    // checks meaningless noise.
    printSummary(results);
    console.error(`\nProduction gate failed at: ${step.label}`);
    process.exit(1);
  }
}

printSummary(results);
console.log('\nProduction gate passed.');
