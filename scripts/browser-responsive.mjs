/**
 * Browser layout sweep.
 *
 * Responsive layout can only be judged by a real layout engine: it depends on computed styles,
 * flex/grid resolution, and actual font metrics. This script boots the production bundle at seven
 * viewports — phone through wide desktop, including landscape — and measures each one, so
 * "the layout holds up" is a measurement rather than an opinion.
 *
 * The load-bearing checks are: nothing overflows the viewport horizontally at any size, the layout
 * switches from stacked to side-by-side at the configured breakpoint, touch targets stay at least
 * 44px, and cards do not stretch into unreadably long lines on wide screens.
 *
 * Run: npm run test:browser:responsive
 */

const { boot, createReporter, failProcessIfNeeded, launch, openPage, serve, text } = await import(
  './browser-harness.mjs'
);

const PORT = 4322;

/**
 * `expect` is the layout the viewport should produce, derived from the configured breakpoint.
 * Anything here at or above it must be side-by-side; below it must be stacked.
 */
const VIEWPORTS = [
  { name: 'small phone', width: 320, height: 568, expect: 'stacked' },
  { name: 'phone', width: 390, height: 844, expect: 'stacked' },
  { name: 'large phone', width: 430, height: 932, expect: 'stacked' },
  { name: 'phone landscape', width: 844, height: 390, expect: 'side-by-side' },
  { name: 'tablet portrait', width: 820, height: 1180, expect: 'side-by-side' },
  { name: 'tablet landscape', width: 1180, height: 820, expect: 'side-by-side' },
  { name: 'desktop', width: 1440, height: 900, expect: 'side-by-side' },
  { name: 'wide desktop', width: 1920, height: 1080, expect: 'side-by-side' },
];

/** Populates every panel, so the measurements cover the shop, crew, and prestige cards too. */
const fullSave = {
  schemaVersion: 1,
  currency: 50_000_000,
  depthTier: 4,
  resources: { 'tier4-ore': 12_500 },
  drills: { 'drill-1': 12, 'drill-2': 6, 'drill-3': 3, 'drill-4': 1 },
  workers: [
    { id: 'worker-1', name: 'Tova Irons', level: 12, speed: 0.6, luck: 0.24, assignment: { kind: 'category', id: 'ore' } },
    { id: 'worker-2', name: 'Silas Cragg', level: 5, speed: 0.25, luck: 0.09, assignment: { kind: 'drill', id: 'drill-2' } },
  ],
  prestige: { count: 2, multiplier: 1.5, lifetimeEarned: 90_000_000 },
  stats: { totalEarned: 20_000_000, manualExtractions: 40 },
  lastSavedAt: 0,
};

/** One phone, one tablet, one desktop — enough to eyeball, few enough to stay tidy. */
const SCREENSHOT_NAMES = new Set(['phone', 'tablet portrait', 'desktop', 'phone landscape']);

const reporter = createReporter('responsive');
const server = await serve({ port: PORT });
const session = await launch();

function measure(page) {
  return page.evaluate(() => {
      /** A short, unique handle for an element, so a failure names what actually broke. */
      const describe = (el) => {
        const tag = el.tagName.toLowerCase();
        const cls =
          typeof el.className === 'string' && el.className
            ? '.' + el.className.trim().split(/\s+/).join('.')
            : '';
        const field = el.dataset?.field ? `[data-field=${el.dataset.field}]` : '';
        const action = el.dataset?.action ? `[data-action=${el.dataset.action}]` : '';
        return tag + cls + field + action;
      };

      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      };

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const visible = [...document.querySelectorAll('body *')].filter(isVisible);

      // Anything crossing the right edge means the page can be scrolled sideways, which is the
      // single most damaging responsive bug.
      const overflowing = visible
        .map((el) => ({ el, rect: el.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > viewportWidth + 1 || rect.left < -1)
        .map(({ el, rect }) => ({
          what: describe(el),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        }));

      const smallTargets = visible
        .filter((el) => el.tagName === 'BUTTON' && el.getBoundingClientRect().height < 44)
        .map((el) => ({
          what: describe(el),
          height: Math.round(el.getBoundingClientRect().height),
        }));

      // Text that does not fit its own box, which shows as clipped or spilling labels.
      const clipped = visible
        .filter((el) => el.matches('[data-field], button, h2, h3, p, span'))
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => ({
          what: describe(el),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
        }));

      const shaft = document.querySelector('.shaft');
      const panels = document.querySelector('.panels');
      const canvas = document.querySelector('#shaft canvas');
      const shaftRect = shaft?.getBoundingClientRect();
      const panelsRect = panels?.getBoundingClientRect();

      const cards = [...document.querySelectorAll('.hud__stat')].filter(isVisible);
      const widestCard = cards.reduce((widest, card) => {
        const width = card.getBoundingClientRect().width;
        return width > widest ? width : widest;
      }, 0);

      return {
        viewportWidth,
        viewportHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowing,
        smallTargets,
        clipped,
        // Stacked means the panel column starts at or below the shaft.
        layout: shaftRect && panelsRect && panelsRect.top >= shaftRect.bottom - 1
          ? 'stacked'
          : 'side-by-side',
        shaft: shaftRect
          ? { width: Math.round(shaftRect.width), height: Math.round(shaftRect.height) }
          : null,
        panels: panelsRect
          ? { width: Math.round(panelsRect.width), height: Math.round(panelsRect.height) }
          : null,
        canvas: canvas ? { width: Math.round(canvas.getBoundingClientRect().width) } : null,
        widestCard: Math.round(widestCard),
        panelCount: visible.filter((el) =>
          el.matches('.hud, .shop, .depth, .workers, .prestige'),
        ).length,
      };
  });
}

try {
  for (const viewport of VIEWPORTS) {
    // Each viewport gets its own context so no save or storage state carries between sizes.
    const context = await session.newContext(viewport);
    const page = await openPage(context);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await boot(page, server.url, { save: JSON.stringify(fullSave) });

    const m = await measure(page);
    const label = `${viewport.name} (${viewport.width}x${viewport.height})`;
    const detail = `${m.layout}, shaft ${m.shaft?.width}px, panels ${m.panels?.width}px`;

    reporter.check(`${label} produces the expected layout`, m.layout === viewport.expect, detail);

    reporter.check(
      `${label} does not scroll sideways`,
      m.documentScrollWidth <= m.viewportWidth + 1 &&
        m.bodyScrollWidth <= m.viewportWidth + 1 &&
        m.overflowing.length === 0,
      m.overflowing.length > 0
        ? m.overflowing.map((entry) => `${entry.what} -> ${entry.right}`).join(', ')
        : `scrollWidth ${m.documentScrollWidth} vs viewport ${m.viewportWidth}`,
    );

    reporter.check(
      `${label} keeps every touch target at least 44px tall`,
      m.smallTargets.length === 0,
      m.smallTargets.map((entry) => `${entry.what}=${entry.height}px`).join(', '),
    );

    reporter.check(
      `${label} fits every label inside its box`,
      m.clipped.length === 0,
      m.clipped.map((entry) => `${entry.what} ${entry.scrollWidth}>${entry.clientWidth}`).join(', '),
    );

    reporter.check(
      `${label} renders the shaft and all five panels at a usable size`,
      (m.canvas?.width ?? 0) > 0 &&
        (m.shaft?.height ?? 0) >= 140 &&
        (m.panels?.height ?? 0) >= 120 &&
        m.panelCount === 5,
      `canvas ${m.canvas?.width}px, shaft ${m.shaft?.height}px, panels ${m.panels?.height}px, ${m.panelCount}/5 panels`,
    );

    reporter.check(
      `${label} does not stretch a card into an unreadable line`,
      m.widestCard <= 560,
      `widest card ${m.widestCard}px`,
    );

    // Measurements cannot tell whether a layout looks right, so the representative sizes are
    // captured as artifacts for human review.
    if (SCREENSHOT_NAMES.has(viewport.name)) {
      const path = `screenshots/layout-${viewport.name.replace(/\s+/g, '-')}.png`;
      await page.screenshot({ path });
      console.log(`  screenshot: ${path}`);
    }

    await context.close();
  }
} catch (error) {
  reporter.check('responsive sweep completed without throwing', false, String(error).split('\n')[0]);
}

await session.close();
await server.close();

const fatal = session.errors.filter((entry) => !/favicon|net::ERR_/i.test(entry));
reporter.check('no JavaScript errors were reported', fatal.length === 0, fatal.slice(0, 3).join(' | '));

failProcessIfNeeded(reporter);
