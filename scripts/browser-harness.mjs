/**
 * Shared browser verification helpers.
 *
 * Keeps the browser binaries inside the project, and gives the smoke and event scripts one
 * consistent way to build, serve, launch, and report.
 */

// Must be set before Playwright loads, or it looks in the global cache instead.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const { build, preview } = await import('vite');
const { chromium } = await import('playwright');

export const SAVE_KEY = 'deep-shaft.save';

const DISPLAY_SUFFIXES = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, Qa: 1e15 };

/** Collects check results and reports a pass/fail summary. */
export function createReporter(label) {
  const results = [];

  return {
    results,
    check(name, passed, detail = '') {
      results.push({ name, passed, detail });
      console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    summary() {
      const failed = results.filter((entry) => !entry.passed);
      console.log(
        `\n[${label}] ${results.length - failed.length}/${results.length} browser checks passed`,
      );
      if (failed.length > 0) {
        console.error(
          `Failed checks:\n${failed.map((entry) => `- ${entry.name}: ${entry.detail}`).join('\n')}`,
        );
      }
      return failed.length === 0;
    },
  };
}

/**
 * Builds the bundle and serves it.
 *
 * `define` swaps build-time constants in, and `outDir` keeps a verification-only build from
 * overwriting the real `dist/` output.
 */
export async function serve({ port, define, outDir } = {}) {
  const buildOptions = outDir ? { build: { outDir } } : {};
  await build({ logLevel: 'error', ...buildOptions, ...(define ? { define } : {}) });
  const server = await preview({
    ...buildOptions,
    preview: { port, strictPort: true },
  });
  return {
    url: server.resolvedUrls.local[0],
    close: () => server.close(),
  };
}

/**
 * Launches headless Chromium at a phone viewport by default.
 *
 * Each scenario must take its own context via `newContext()`. Pages in one context share
 * `localStorage`, and every page runs its own autosave loop (`config.persistence.autosaveIntervalMs`),
 * so a scenario left open will periodically overwrite another scenario's save. Separate contexts
 * give each scenario its own storage partition and remove that whole class of interference.
 */
export async function launch(viewport = { width: 390, height: 844 }) {
  const browser = await chromium.launch();
  const errors = [];

  function watch(context) {
    context.on('page', (page) => {
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
      });
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    });
    return context;
  }

  async function newContext(viewportOverride) {
    return watch(await browser.newContext({ viewport: viewportOverride ?? viewport }));
  }

  const context = await newContext();
  return { browser, context, errors, newContext, close: () => browser.close() };
}

export async function openPage(context) {
  return context.newPage();
}

/**
 * Loads the game, optionally seeding a save before any app script runs.
 *
 * Note that a seed registered this way is re-applied on *every* navigation of that page, so a
 * seeded page must not be reloaded to observe what it persisted — open a plain new page in the
 * same context instead.
 */
export async function boot(page, url, { save } = {}) {
  if (save) {
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [SAVE_KEY, save],
    );
  }
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(600);
}

/** Reads a HUD field, trimmed. */
export async function text(page, fieldName) {
  return (await page.locator(`[data-field="${fieldName}"]`).innerText()).trim();
}

/** Reads a formatted HUD value back into a number: '1.8K' -> 1800, '5.25/s' -> 5.25. */
export function parseDisplayed(raw) {
  const match = /^([\d.]+)\s*(K|M|B|T|Qa)?/.exec(raw.trim());
  if (!match) {
    return Number.NaN;
  }
  return Number(match[1]) * (DISPLAY_SUFFIXES[match[2]] ?? 1);
}

/** Sets document.hidden and fires the event the save-on-hide path listens for. */
export async function hidePage(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** Fails the process if any collected check failed, so the script works as a gate. */
export function failProcessIfNeeded(reporter) {
  if (!reporter.summary()) {
    process.exitCode = 1;
  }
}
