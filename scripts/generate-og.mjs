/**
 * Renders the social share card (1200x630) into `public/og-image.png`.
 *
 * The card is composed in headless Chromium from an inline HTML template using the game's own
 * palette and depth-strata motif, then screenshotted at the exact size platforms read. Run:
 * node scripts/generate-og.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public', 'og-image.png');

const WIDTH = 1200;
const HEIGHT = 630;

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background: #12100e;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .card {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 340px 1fr;
  }
  /* The shaft: five strata, darker with depth, like the game reads it. */
  .shaft { position: relative; }
  .stratum { position: relative; flex: 1; }
  .strata {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .stratum { height: 20%; }
  .surface {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4px;
    background: #d9c9a3;
    opacity: 0.9;
  }
  .rail {
    position: absolute;
    top: 0; bottom: 0;
    width: 6px;
    background: #14110e;
    opacity: 0.8;
  }
  .marker {
    position: absolute;
    left: 30px;
    width: 0; height: 0;
    border-top: 14px solid transparent;
    border-bottom: 14px solid transparent;
    border-left: 22px solid #ffe0a3;
  }
  .copy {
    padding: 72px 80px 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 22px;
  }
  .kicker {
    font: 600 17px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.35em;
    text-transform: uppercase;
    color: #a99b86;
  }
  h1 {
    margin: 0;
    font-size: 96px;
    line-height: 1.02;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #f4e3c1;
  }
  .tagline {
    font-size: 30px;
    line-height: 1.35;
    color: #cbbba0;
    max-width: 640px;
  }
  .chips {
    display: flex;
    gap: 14px;
    margin-top: 10px;
  }
  .chip {
    padding: 10px 18px;
    border: 1px solid #302a25;
    border-radius: 10px;
    background: #1c1917;
    color: #e8d9b8;
    font: 600 20px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .chip.accent { background: #d9a441; color: #241c0d; border-color: #d9a441; }
</style>
</head>
<body>
  <div class="card">
    <div class="shaft">
      <div class="rail" style="left: 14px;"></div>
      <div class="rail" style="right: 14px;"></div>
      <div class="surface"></div>
      <div class="strata">
        <div class="stratum" style="background: #89592b;"></div>
        <div class="stratum" style="background: #716037;"></div>
        <div class="stratum" style="background: #4e5751;"></div>
        <div class="stratum" style="background: #364253;"></div>
        <div class="stratum" style="background: #26283b;"></div>
      </div>
      <div class="marker" style="top: 268px;"></div>
    </div>
    <div class="copy">
      <div class="kicker">AN IDLE MINE MANAGEMENT GAME</div>
      <h1>Deep Shaft</h1>
      <div class="tagline">Buy drills, hire a crew, and dig through five tiers of ore, gems, and rare minerals - the mine works while you are away.</div>
      <div class="chips">
        <div class="chip accent">Idle</div>
        <div class="chip">Offline progress</div>
        <div class="chip">Prestige</div>
      </div>
    </div>
  </div>
</body>
</html>`;

const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await page.waitForTimeout(200);
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  console.log(`wrote ${outPath} (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
