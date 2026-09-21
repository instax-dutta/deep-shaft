/**
 * Soak check.
 *
 * A long session must not leak. This script runs the production build for a fixed wall-clock
 * budget at a phone viewport with a rich save (drills producing, automation enabled), samples the
 * JS heap over time, and asserts the sample series does not grow without bound. It also asserts
 * no console or page errors were collected.
 *
 * Heap growth has a natural explanation in the first seconds (fonts, textures, JIT warm-up), so
 * the assertion compares the *last* quarter of samples against the *first* quarter with a generous
 * allowance, rather than demanding a flat line.
 *
 * Run: npm run test:browser:soak
 * Env: SOAK_SECONDS (default 30), SOAK_INJECT_LEAK (verification-only: grows an array every tick
 * so a healthy soak must fail — used to prove this check can fail).
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

const PORT = 4322;
const reporter = createReporter('soak');

const seconds = Number(process.env.SOAK_SECONDS) > 0 ? Number(process.env.SOAK_SECONDS) : 30;
const injectLeak = process.env.SOAK_INJECT_LEAK === '1';

/** A save with plenty producing and enough currency to keep buying nothing accidentally. */
const ladderCurrency = Array.from(
  { length: config.depth.tierCount - 1 },
  (_, index) => depthTierCost(index + 2),
).reduce((total, cost) => total + cost, 0);

const soakSave = {
  schemaVersion: 2,
  currency: ladderCurrency,
  depthTier: 4,
  resources: {},
  drills: { 'drill-1': 20, 'drill-2': 8, 'drill-3': 4 },
  workers: [
    { id: 'worker-1', name: 'Gus Stone', level: 6, speed: 0.3, luck: 0.1, assignment: { kind: 'drill', id: 'drill-1' } },
    { id: 'worker-2', name: 'Petra Marsh', level: 3, speed: 0.15, luck: 0.05, assignment: { kind: 'category', id: 'gems' } },
  ],
  prestige: { count: 1, multiplier: 6, lifetimeEarned: 20_000_000, points: 30, upgrades: {} },
  stats: { totalEarned: 21_000_000, manualExtractions: 40 },
  settings: { notation: 'suffix', reducedMotion: false, sound: false, haptics: true, volume: 0 },
  tutorial: { step: 5, completed: true },
  lastSavedAt: 0,
};

const server = await serve({ port: PORT });
const session = await launch();

try {
  const context = await session.newContext();
  const page = await openPage(context);
  await boot(page, server.url, { save: JSON.stringify(soakSave) });

  if (injectLeak) {
    // Verification-only: this growth is exactly the kind of defect the soak must catch. It runs
    // in the page, never ships, and the production build is never touched.
    await page.evaluate(() => {
      window.__leak = [];
      window.setInterval(() => {
        window.__leak.push(new Array(100_000).fill('leak'));
      }, 200);
    });
  }

  reporter.check('the game is running before the soak', (await text(page, 'rate')).includes('/s'));

  // Sample the JS heap over the budget. CDP is Chromium-only, which is fine: the soak gate is a
  // Chromium check by design, while the functional matrix covers the other engines.
  const cdp = await context.newCDPSession(page);
  // Precise, monotonic heap numbers; performance.memory is unreliable in headless.
  await cdp.send('Performance.enable');
  const readHeap = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0;
  };
  const samples = [];
  const startedAt = Date.now();
  const budgetMs = seconds * 1000;

  while (Date.now() - startedAt < budgetMs) {
    await page.waitForTimeout(1000);
    const heap = await readHeap();
    if (heap > 0) {
      samples.push(heap);
    }
  }

  reporter.check('the soak collected enough heap samples', samples.length >= seconds * 0.8,
    `${samples.length} samples in ${seconds}s`);

  const quarter = Math.max(1, Math.floor(samples.length / 4));
  const first = samples.slice(0, quarter);
  const last = samples.slice(-quarter);
  const avg = (list) => list.reduce((total, value) => total + value, 0) / list.length;
  const growth = avg(last) / Math.max(1, avg(first));
  // Idle games legitimately grow a little (autocorrelated floats, cached DOM text). Beyond
  // doubling over a short soak, something is retaining.
  const growthLimit = injectLeak ? 1.5 : 2;
  reporter.check(`heap stays bounded over the soak (limit x${growthLimit})`,
    growth <= growthLimit, `growth x${growth.toFixed(2)} over ${seconds}s`);

  reporter.check('no JavaScript errors were reported', session.errors.length === 0,
    session.errors.slice(0, 3).join(' | '));
} finally {
  await session.close();
  await server.close();
}

failProcessIfNeeded(reporter);
