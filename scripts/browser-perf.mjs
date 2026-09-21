/**
 * Performance check.
 *
 * The tick loop re-renders every panel every 200ms. At a large state (many drills, workers,
 * achievements, and resources banked) that work must stay inside a per-tick budget, or a phone
 * would drop frames and burn battery.
 *
 * This script seeds a large state, waits for the game to settle, then measures how long the
 * panels take to settle after each forced invalidation (a mine click forces renders), sampling
 * repeatedly and asserting a per-sample budget. It also asserts the frame loop stays responsive
 * while the tick runs by measuring `requestAnimationFrame` deltas.
 *
 * Run: npm run test:browser:perf
 */

import assert from 'node:assert';

const {
  createReporter,
  failProcessIfNeeded,
  launch,
  openPage,
  boot,
  serve,
  text,
} = await import('./browser-harness.mjs');

const { depthTierCost } = await import('../src/data/depthTiers.js');
const { config } = await import('../src/data/config.js');

const PORT = 4324;
const reporter = createReporter('perf');

const ladderCurrency = Array.from(
  { length: config.depth.tierCount - 1 },
  (_, index) => depthTierCost(index + 2),
).reduce((total, cost) => total + cost, 0);

const roster = Array.from({ length: config.workers.maxRoster }, (_, index) => ({
  id: `worker-${index + 1}`,
  name: `Worker ${index + 1}`,
  level: 10,
  speed: 0.3,
  luck: 0.1,
  assignment: { kind: 'drill', id: 'drill-1' },
}));

const largeSave = {
  schemaVersion: 2,
  currency: ladderCurrency,
  depthTier: 5,
  resources: { 'tier5-ore': 1_000_000, 'tier5-gems': 100_000, 'tier5-rare': 10_000 },
  drills: { 'drill-1': 60, 'drill-2': 40, 'drill-3': 25, 'drill-4': 10, 'drill-5': 5 },
  workers: roster,
  prestige: { count: 3, multiplier: 20, lifetimeEarned: 500_000_000, points: 80, upgrades: {} },
  stats: { totalEarned: 501_000_000, manualExtractions: 500 },
  settings: { notation: 'suffix', reducedMotion: false, sound: false, haptics: true, volume: 0 },
  tutorial: { step: 5, completed: true },
  lastSavedAt: 0,
};

const server = await serve({ port: PORT });
const session = await launch();

try {
  const context = await session.newContext();
  const page = await openPage(context);
  await boot(page, server.url, { save: JSON.stringify(largeSave) });

  reporter.check('a large state boots to a depth-5 mine', (await text(page, 'tier-name')) === 'Abyssal Core',
    await text(page, 'tier-name'));
  reporter.check('a large state renders the whole crew',
    (await page.locator('[data-worker]').count()) === config.workers.maxRoster);

  // Frame responsiveness while the tick loop runs: measure rAF deltas over 60 frames.
  const frameStats = await page.evaluate(() => new Promise((resolve) => {
    const deltas = [];
    let last = performance.now();
    let frames = 0;
    function step(now) {
      deltas.push(now - last);
      last = now;
      frames += 1;
      if (frames < 60) {
        requestAnimationFrame(step);
      } else {
        const sorted = [...deltas].sort((a, b) => a - b);
        resolve({
          median: sorted[Math.floor(sorted.length / 2)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
        });
      }
    }
    requestAnimationFrame(step);
  }));

  // Headless software rendering is slow; the budget is generous but real. A median frame over
  // 200ms would mean the tick loop is starving the frame loop.
  reporter.check('frames stay responsive under a large state',
    frameStats.median < 100, `median ${frameStats.median.toFixed(1)}ms p95 ${frameStats.p95.toFixed(1)}ms`);

  // Panel work per mine click must stay inside a budget: mine dispatches render + tutorial +
  // achievements + HUD rates, the most expensive synchronous path a tap can trigger.
  const renderMs = await page.evaluate(() => {
    const button = document.querySelector('[data-action="mine"]');
    const samples = [];
    for (let index = 0; index < 20; index += 1) {
      const started = performance.now();
      button.click();
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    return { median: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * 0.95)] };
  });

  reporter.check('a mine tap stays inside its synchronous budget',
    renderMs.median < 25, `median ${renderMs.median.toFixed(1)}ms p95 ${renderMs.p95.toFixed(1)}ms`);

  reporter.check('no JavaScript errors were reported', session.errors.length === 0,
    session.errors.slice(0, 3).join(' | '));
} finally {
  await session.close();
  await server.close();
}

failProcessIfNeeded(reporter);
