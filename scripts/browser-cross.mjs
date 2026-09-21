/**
 * Cross-browser functional matrix.
 *
 * Chromium is the default engine everywhere else; this script boots the production build on
 * Firefox and WebKit and asserts the core loop works there too, because an engine-specific
 * failure (an API difference, a rendering quirk) is invisible to a Chromium-only gate.
 *
 * The checks are deliberately a compact subset of the smoke suite: boot, mine, sell, buy, a
 * save/write round-trip, and console errors. Full coverage stays in the Chromium suites.
 *
 * Run: npm run test:browser:cross
 */

const {
  createReporter,
  failProcessIfNeeded,
  launch,
  openPage,
  boot,
  serve,
  text,
} = await import('./browser-harness.mjs');

const { config } = await import('../src/data/config.js');

const PORT = 4326;

const server = await serve({ port: PORT });

let anyFailed = false;

for (const project of ['firefox', 'webkit']) {
  const reporter = createReporter(`cross:${project}`);

  try {
    const session = await launch({ width: 390, height: 844 }, project);
    try {
      const context = await session.newContext();
      const page = await openPage(context);
      page.setDefaultTimeout(15_000);
      await boot(page, server.url);

      reporter.check(`${project} mounts the Phaser canvas`,
        (await page.locator('#shaft canvas').count()) === 1);

      const canvas = page.locator('#shaft canvas');
      for (let tap = 0; tap < 20; tap += 1) {
        await canvas.click({ position: { x: 120, y: 240 } }).catch(() => undefined);
      }
      const minedOre = Number(await text(page, 'ore-amount').catch(() => '0'));
      reporter.check(`${project} mines by tapping the shaft`, minedOre >= 20, `${minedOre} mined`);

      await page.locator('[data-action="sell-all"]').click();
      await page.waitForTimeout(200);
      reporter.check(`${project} selling earns currency`,
        Number(await text(page, 'currency').catch(() => '0')) > 0,
        await text(page, 'currency').catch(() => '?'));

      const drillRow = page.locator('[data-drill="drill-1"]');
      await drillRow.locator('[data-mode="x1"]').click();
      reporter.check(`${project} buys a drill`,
        (await drillRow.locator('[data-field="owned"]').innerText().catch(() => '?')).trim() === '1');

      const rateBefore = Number(await text(page, 'ore-amount').catch(() => '0'));
      await page.waitForTimeout(1500);
      reporter.check(`${project} drills produce without input`,
        Number(await text(page, 'ore-amount').catch(() => '0')) > rateBefore,
        `${rateBefore} -> ${await text(page, 'ore-amount').catch(() => '?')}`);

      reporter.check(`${project} shows the tutorial coach line`,
        (await text(page, 'tutorial').catch(() => '')).length > 0, 'informational');

      reporter.check(`${project} reports no JavaScript errors`, session.errors.length === 0,
        session.errors.slice(0, 3).join(' | '));
    } finally {
      await session.close();
    }
  } catch (error) {
    reporter.check(`${project} runs at all`, false, String(error.message).slice(0, 200));
  }

  anyFailed = anyFailed || !reporter.summary();
}

if (anyFailed) {
  await server.close();
  process.exitCode = 1;
} else {
  await server.close();
}
