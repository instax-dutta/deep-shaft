/**
 * PWA verification.
 *
 * Installability and offline operation cannot be exercised inside Vitest: they depend on a real
 * service worker lifecycle (install → activate → claim), a real browser parsing the manifest, and a
 * real network being taken away. `tests/ui/pwaManifest.test.js` guards the file contract; this
 * script proves the behavior in headless Chromium.
 *
 * The offline check is the load-bearing one. It loads the app once so the worker installs and caches
 * the built shell, then reloads with the network disabled and asserts the game still renders. That
 * is exactly the promise installability makes on a phone with no signal.
 *
 * Run: npm run test:browser:pwa
 */

const { createReporter, failProcessIfNeeded, launch, serve } = await import('./browser-harness.mjs');

const PORT = 4323;

const reporter = createReporter('pwa');
const server = await serve({ port: PORT });
const session = await launch();

try {
  const context = await session.newContext();
  const page = await context.newPage();
  await page.goto(server.url, { waitUntil: 'load' });

  // Installing the worker means fetching and caching the shell, so wait for the active state
  // rather than assuming a fixed delay is long enough.
  const worker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return { supported: false };
    }
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
    return {
      supported: true,
      activated: ready?.active?.state === 'activated',
      scope: ready?.scope ?? null,
      controlling: Boolean(navigator.serviceWorker.controller),
    };
  });

  reporter.check(
    'the browser supports service workers, so this suite is meaningful',
    worker.supported,
    JSON.stringify(worker),
  );
  reporter.check(
    'the service worker registers and reaches the active state',
    worker.activated,
    JSON.stringify(worker),
  );
  reporter.check(
    'the active worker controls the page it was registered from',
    worker.controlling,
    JSON.stringify(worker),
  );

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const icon = document.querySelector('link[rel="icon"]');
    if (!link) {
      return { linked: false };
    }
    const response = await fetch(link.href);
    const iconResponse = icon ? await fetch(icon.href) : null;
    return {
      linked: true,
      status: response.status,
      body: response.ok ? await response.json() : null,
      iconStatus: iconResponse?.status ?? null,
    };
  });

  reporter.check(
    'index.html links a manifest the browser can fetch and parse',
    manifest.linked && manifest.status === 200 && manifest.body?.name === 'Deep Shaft',
    JSON.stringify({ linked: manifest.linked, status: manifest.status, name: manifest.body?.name }),
  );
  reporter.check(
    'the manifest declares standalone display and both install icon sizes',
    manifest.body?.display === 'standalone' &&
      ['192x192', '512x512'].every((size) =>
        manifest.body.icons.some((icon) => icon.sizes === size),
      ),
    JSON.stringify({ display: manifest.body?.display, sizes: manifest.body?.icons?.map((i) => i.sizes) }),
  );
  reporter.check(
    'the linked icon is served, not a broken reference',
    manifest.iconStatus === 200,
    `status ${manifest.iconStatus}`,
  );

  // Record what the shell install actually cached, so an offline failure names the missing
  // resource rather than only reporting that something was unreachable.
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys()),
    );
    return entries.flat().map((request) => new URL(request.url).pathname);
  });

  // Name any request that fails while offline: "something was unreachable" is not diagnosable.
  const failedRequests = [];
  page.on('requestfailed', (request) =>
    failedRequests.push(`${request.url()} (${request.failure()?.errorText})`),
  );

  // Take the network away and reload. Everything must come from the worker's cache.
  await context.setOffline(true);
  let offline;
  try {
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(800);
    offline = await page.evaluate(() => ({
      currency: document.querySelector('[data-field="currency"]')?.textContent?.trim() ?? null,
      canvas: Boolean(document.querySelector('#shaft canvas')),
      title: document.title,
    }));
  } finally {
    await context.setOffline(false);
  }

  reporter.check(
    'a reload with the network offline still renders the game shell',
    offline.currency !== null && offline.canvas && offline.title === 'Deep Shaft',
    JSON.stringify({ ...offline, failedRequests, cached }),
  );

  reporter.check(
    'no JavaScript errors were reported',
    session.errors.length === 0,
    session.errors.join('; '),
  );
} finally {
  await session.close();
  await server.close();
}

failProcessIfNeeded(reporter);
