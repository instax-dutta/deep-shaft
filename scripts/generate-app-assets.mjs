/**
 * Renders the Capacitor source assets into `assets/`: a 1024 launcher icon and a 2732 splash.
 *
 * Same idea as the art pack and the OG card: composed in headless Chromium from the game's
 * palette, committed, and reproducible from one command. Run: node scripts/generate-app-assets.mjs
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '0';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const html = (size, forSplash) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: ${size}px; height: ${size}px; overflow: hidden;
    background: ${forSplash ? '#12100e' : '#1c1917'};
    display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  .shaft {
    width: ${forSplash ? Math.round(size * 0.42) : Math.round(size * 0.62)}px;
    height: ${forSplash ? Math.round(size * 0.42) : Math.round(size * 0.62)}px;
    position: relative;
    border-radius: ${forSplash ? '0' : Math.round(size * 0.06)}px;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .stratum { flex: 1; }
  .surface { height: ${forSplash ? 10 : 6}px; background: #d9c9a3; }
  .marker {
    position: absolute;
    left: ${forSplash ? 26 : 18}px;
    width: 0; height: 0;
    border-top: ${forSplash ? 22 : 14}px solid transparent;
    border-bottom: ${forSplash ? 22 : 14}px solid transparent;
    border-left: ${forSplash ? 34 : 20}px solid #ffe0a3;
  }
  .word {
    position: absolute;
    left: 0; right: 0;
    text-align: center;
    font: 800 ${forSplash ? Math.round(size * 0.045) : Math.round(size * 0.075)}px/1 ui-sans-serif, system-ui, sans-serif;
    letter-spacing: 0.02em;
    color: #f4e3c1;
    text-shadow: 0 2px 12px rgba(0,0,0,0.55);
  }
</style></head><body>
  ${forSplash ? `
  <div style="display:flex; flex-direction:column; align-items:center; gap:${Math.round(size * 0.05)}px;">
    <div class="shaft">
      <div class="stratum" style="background:#89592b;"></div>
      <div class="stratum" style="background:#716037;"></div>
      <div class="stratum" style="background:#4e5751;"></div>
      <div class="stratum" style="background:#364253;"></div>
      <div class="stratum" style="background:#26283b;"></div>
      <div class="marker" style="top: ${Math.round(size * 0.30)}px;"></div>
    </div>
    <div style="font-size:${Math.round(size * 0.06)}px; font-weight:800; color:#f4e3c1; letter-spacing:-0.01em;">Deep Shaft</div>
    <div style="font-size:${Math.round(size * 0.022)}px; font-weight:600; letter-spacing:0.3em; color:#a99b86; text-transform:uppercase;">an idle mine management game</div>
  </div>` : `
  <div class="shaft" style="background:#1c1917;">
    <div class="stratum" style="background:#89592b;"></div>
    <div class="stratum" style="background:#716037;"></div>
    <div class="stratum" style="background:#4e5751;"></div>
    <div class="stratum" style="background:#364253;"></div>
    <div class="stratum" style="background:#26283b;"></div>
    <div class="marker" style="top: ${Math.round(size * 0.62)}px;"></div>
    <div class="surface" style="position:absolute; top:0; left:0; right:0;"></div>
  </div>`}
</body></html>`;

const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 1 });
  mkdirSync(join(root, 'assets'), { recursive: true });

  const render = async (name, size, forSplash, background = undefined) => {
    await page.setViewportSize({ width: size, height: size });
    await page.goto(`data:text/html;base64,${Buffer.from(html(size, forSplash)).toString('base64')}`);
    await page.waitForTimeout(150);
    await page.screenshot({
      path: join(root, 'assets', name),
      omitBackground: background === 'transparent',
      clip: { x: 0, y: 0, width: size, height: size },
    });
    console.log(`wrote assets/${name} (${size}x${size})`);
  };

  // The launcher icon must be opaque: a transparent background confuses the adaptive-icon
  // background layer and @capacitor/assets emits a broken resource for it.
  await render('icon-only.png', 1024, false, '#1c1917');
  await render('icon-foreground.png', 1024, false, 'transparent');
  await render('splash.png', 2732, true);
} finally {
  await browser.close();
}
