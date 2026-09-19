/**
 * Browser check for random events.
 *
 * The shipped event interval is 45–180s, which is correct for a player and impossible to verify
 * in a test run. This script builds a *verification-only* bundle with the pacing swapped in at
 * build time (see `createEventAdvanceOptions` in `src/main.js`), so events fire every couple of
 * seconds and last a fraction of their normal time. Nothing about that pacing survives into a
 * production build.
 *
 * The mine is seeded with exactly one drill, which makes the two effects unambiguous to read off
 * the HUD: a cave-in stops that drill (output 0), a lucky vein doubles it.
 *
 * Run: npm run test:browser:events
 */

const { createReporter, boot, launch, openPage, parseDisplayed, serve, text, failProcessIfNeeded } =
  await import('./browser-harness.mjs');

const PORT = 4321;
const HARNESS_INTERVAL_SECONDS = 2;
// Long enough that each event spans many samples, short enough that two events rarely overlap
// (an overlap would hide the lucky-vein boost behind a stopped drill).
const HARNESS_DURATION_SCALE = 0.12;
const OBSERVATION_WINDOW_MS = 30_000;
const SAMPLE_INTERVAL_MS = 200;

const reporter = createReporter('events');

const soloDrillSave = {
  schemaVersion: 1,
  currency: 1_000,
  depthTier: 1,
  resources: {},
  // Exactly one drill, so a cave-in zeroes output and a lucky vein doubles it.
  drills: { 'drill-1': 1 },
  workers: [],
  prestige: { count: 0, multiplier: 1, lifetimeEarned: 0 },
  stats: { totalEarned: 0, manualExtractions: 0 },
  lastSavedAt: 0,
};

const server = await serve({
  port: PORT,
  // A separate output directory keeps this verification-only build out of the real dist/.
  outDir: 'dist-harness',
  define: {
    'import.meta.env.VITE_EVENT_INTERVAL_SECONDS': JSON.stringify(String(HARNESS_INTERVAL_SECONDS)),
    'import.meta.env.VITE_EVENT_DURATION_SCALE': JSON.stringify(String(HARNESS_DURATION_SCALE)),
  },
});

const session = await launch();
const page = await openPage(session.context);

/**
 * Reads the banner and the rate from one DOM snapshot.
 *
 * Reading them in two round-trips let an event expire in between, so a sample could report
 * "Lucky vein" beside an already-restored rate. Both values now come from the same instant.
 */
async function readSample() {
  const sample = await page.evaluate(() => ({
    status: (document.querySelector('[data-field="status"]')?.textContent ?? '').trim(),
    rate: (document.querySelector('[data-field="rate"]')?.textContent ?? '').trim(),
  }));
  return { status: sample.status, rate: parseDisplayed(sample.rate) };
}

/**
 * Samples the HUD until both effects have actually been demonstrated, or the window closes.
 *
 * Stopping once both event *names* had been seen was racy: the scaled duration is only a few
 * samples wide, so the effect could be missed on the one sample that also carried the name. The
 * loop now keeps watching until it has seen the drill actually stop and actually speed up.
 */
async function observeEvents() {
  const observation = {
    kindsSeen: new Set(),
    caveInStoppedProduction: false,
    luckyVeinRaisedProduction: false,
    toastShown: false,
    samples: 0,
  };

  const baseline = parseDisplayed(await text(page, 'rate'));
  observation.baseline = baseline;

  const deadline = Date.now() + OBSERVATION_WINDOW_MS;
  while (
    Date.now() < deadline &&
    !(observation.caveInStoppedProduction && observation.luckyVeinRaisedProduction)
  ) {
    const { status, rate } = await readSample();
    observation.samples += 1;

    if (status.includes('Cave-in')) {
      observation.kindsSeen.add('Cave-in');
      if (rate === 0) {
        observation.caveInStoppedProduction = true;
      }
    }
    if (status.includes('Lucky vein')) {
      observation.kindsSeen.add('Lucky vein');
      // Only meaningful without a cave-in also suppressing the same drill.
      if (!status.includes('Cave-in')) {
        observation.peakVeinRate = Math.max(observation.peakVeinRate ?? 0, rate);
        if (rate > baseline) {
          observation.luckyVeinRaisedProduction = true;
        }
      }
    }
    if (!observation.toastShown && (await page.locator('.toast').isVisible())) {
      observation.toastShown = true;
    }

    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
  }

  return observation;
}

try {
  await boot(page, server.url, { save: JSON.stringify(soloDrillSave) });

  const baseline = parseDisplayed(await text(page, 'rate'));
  reporter.check('the mine runs at a steady baseline before any event', baseline > 0, `${baseline}/s`);

  const observed = await observeEvents();

  reporter.check(
    'a cave-in reaches the player instead of staying silent',
    observed.kindsSeen.has('Cave-in'),
    `${observed.samples} samples`,
  );
  reporter.check(
    'a cave-in actually stops the drill',
    observed.caveInStoppedProduction,
    `rate fell to 0 during a cave-in`,
  );
  reporter.check(
    'a lucky vein reaches the player',
    observed.kindsSeen.has('Lucky vein'),
  );
  reporter.check(
    'a lucky vein actually doubles output',
    observed.luckyVeinRaisedProduction,
    `${observed.baseline}/s baseline -> peak ${observed.peakVeinRate ?? 0}/s over ${observed.samples} samples`,
  );
  reporter.check('events are announced in a toast, not only in the HUD', observed.toastShown);

  const fatal = session.errors.filter((entry) => !/favicon|net::ERR_/i.test(entry));
  reporter.check('no JavaScript errors were reported', fatal.length === 0, fatal.slice(0, 3).join(' | '));
} catch (error) {
  reporter.check('event run completed without throwing', false, String(error).split('\n')[0]);
}

await session.close();
await server.close();
failProcessIfNeeded(reporter);
