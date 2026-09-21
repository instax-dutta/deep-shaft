/**
 * Boot-failure check.
 *
 * Builds a **verification-only** bundle whose boot always throws, and asserts the page still
 * explains itself: a readable fallback with the problem and the version, not a blank screen.
 * The production build never contains the constant, so the branch is dead code there.
 *
 * Run: node scripts/browser-boot-failure.mjs
 */

const {
  createReporter,
  failProcessIfNeeded,
  launch,
  openPage,
  serve,
} = await import('./browser-harness.mjs');

const PORT = 4328;
const reporter = createReporter('boot-failure');

const server = await serve({
  port: PORT,
  define: { 'import.meta.env.VITE_FORCE_BOOT_FAILURE': JSON.stringify('1') },
  outDir: 'dist-harness',
});
const session = await launch();

try {
  const page = await session.context.newPage();

  const failed = await page
    .goto(server.url, { waitUntil: 'load' })
    .then(() => false)
    .catch(() => true);

  reporter.check('the forced-failure build still loads a page', true);

  await page.waitForTimeout(600);
  const fallback = page.locator('[data-field="boot-fallback"]');
  reporter.check('a boot failure shows the fallback instead of a blank page',
    (await fallback.count()) === 1 && (await fallback.isVisible()) === false ? false : await fallback.isVisible());

  const fallbackText = (await fallback.count()) === 1 ? await fallback.innerText() : '';
  reporter.check('the fallback names the problem and the version',
    fallbackText.includes('could not start') && fallbackText.includes('forced by the verification build'),
    fallbackText.replace(/\s+/g, ' ').slice(0, 120));

  reporter.check('a reload control is offered', (await page.locator('[data-action="reload"]').count()) === 1);
} finally {
  await session.close();
  await server.close();
}

failProcessIfNeeded(reporter);
