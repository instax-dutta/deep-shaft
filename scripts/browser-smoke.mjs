/**
 * Browser smoke check.
 *
 * Vitest cannot boot Phaser: it needs a real canvas. This script builds the production bundle,
 * serves it, drives it in headless Chromium, and plays the actual core loop — mine, sell, buy a
 * drill, dig deeper, hire a worker — so "the game boots and plays" is verified rather than assumed.
 *
 * Run: npm run test:browser:smoke
 */

const {
  boot,
  createReporter,
  failProcessIfNeeded,
  hidePage,
  launch,
  openPage,
  parseDisplayed,
  SAVE_KEY,
  serve,
  text,
} = await import('./browser-harness.mjs');

const { config } = await import('../src/data/config.js');
const { depthTierCost } = await import('../src/data/depthTiers.js');

const PORT = 4319;
const HOUR_MS = 3_600_000;

const reporter = createReporter('smoke');

/**
 * Currency that clears the whole depth ladder, read from `src/data/` rather than hardcoded: a
 * retune must not be able to silently strand the scripted run short of the deepest tier.
 */
const ladderCurrency = Array.from(
  { length: config.depth.tierCount - 1 },
  (_, index) => depthTierCost(index + 2),
).reduce((total, cost) => total + cost, 0);

const richSave = {
  schemaVersion: 1,
  currency: ladderCurrency * 2,
  depthTier: 1,
  resources: { 'tier1-ore': 100, 'tier1-gems': 50 },
  drills: { 'drill-1': 10 },
  workers: [],
  prestige: { count: 0, multiplier: 1, lifetimeEarned: 0 },
  // Past the worker milestone, so the crew layer is reachable in the smoke run.
  stats: { totalEarned: 5_000_000, manualExtractions: 0 },
  lastSavedAt: 0,
};

const server = await serve({ port: PORT });
const session = await launch();

try {
  // --- Clean run: boot, mine, sell, buy --------------------------------------
  // One context per scenario: pages sharing a context also share localStorage, and each page's
  // autosave loop would otherwise overwrite the other scenario's save mid-run.
  const cleanContext = await session.newContext();
  const page = await openPage(cleanContext);

  // Watch for the art pack on the wire: the shaft is drawn from these textures, and a texture that
  // never arrives leaves a blank band that no DOM assertion would notice.
  const artResponses = new Map();
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/art/') && path.endsWith('.png')) {
      artResponses.set(path, response.status());
    }
  });

  await boot(page, server.url);

  reporter.check('Phaser canvas mounts in the shaft', (await page.locator('#shaft canvas').count()) === 1);

  const failedArt = [...artResponses].filter(([, status]) => status !== 200).map(([path]) => path);
  reporter.check(
    'the boot scene loads every art pack texture the shaft draws',
    artResponses.size >= 10 && failedArt.length === 0,
    `${artResponses.size} textures, failed ${JSON.stringify(failedArt)}`,
  );
  reporter.check('HUD renders at startup', (await page.locator('.hud').count()) === 1);
  reporter.check(
    'every composition panel is mounted',
    (await page.evaluate(() => ({
      depth: document.querySelectorAll('section.depth').length,
      shop: document.querySelectorAll('section.shop').length,
      workers: document.querySelectorAll('section.workers').length,
      prestige: document.querySelectorAll('section.prestige').length,
      upgrades: document.querySelectorAll('section.upgrades').length,
      achievements: document.querySelectorAll('section.achievements').length,
      settings: document.querySelectorAll('section.settings').length,
      tutorial: document.querySelectorAll('section.tutorial').length,
    }))) !== undefined &&
      (await page.evaluate(() => {
        const required = ['section.depth', 'section.shop', 'section.workers', 'section.prestige', 'section.upgrades', 'section.achievements', 'section.settings', 'section.tutorial'];
        return required.every((selector) => document.querySelector(selector) !== null);
      })),
  );
  reporter.check('the settings panel offers export, import, and reset',
    (await page.locator('[data-action="export-save"]').count()) === 1 &&
      (await page.locator('[data-action="import-save"]').count()) === 1 &&
      (await page.locator('[data-action="reset-game"]').count()) === 1);
  reporter.check(
    'shop, depth, worker, and prestige panels render',
    (await page.locator('.shop').count()) === 1
      && (await page.locator('.depth').count()) === 1
      && (await page.locator('.workers').count()) === 1
      && (await page.locator('.prestige').count()) === 1,
  );
  reporter.check('mining starts at depth 1', (await text(page, 'depth')).includes('1'));
  reporter.check('currency starts at zero', (await text(page, 'currency')) === '0');
  reporter.check('active resource is the tier 1 ore', (await text(page, 'ore-name')).length > 0,
    await text(page, 'ore-name'));
  reporter.check(
    'gems and rare counters render',
    (await text(page, 'gem-name')).length > 0 && (await text(page, 'rare-name')).length > 0,
    `${await text(page, 'gem-name')} / ${await text(page, 'rare-name')}`,
  );

  // The pacing override used by the event harness is build-time only. With the shipped 45–180s
  // interval, nothing can fire this early, so an empty banner proves production kept real pacing.
  await page.waitForTimeout(5_000);
  reporter.check('the production build keeps the shipped event pacing (nothing fires early)',
    (await text(page, 'status')) === '', await text(page, 'status'));

  reporter.check('a fresh player is coached into the first action',
    (await text(page, 'tutorial')).includes('Tap the shaft'),
    await text(page, 'tutorial'));

  const canvas = page.locator('#shaft canvas');
  for (let tap = 0; tap < 20; tap += 1) {
    await canvas.click({ position: { x: 120, y: 240 } });
  }
  const minedOre = Number(await text(page, 'ore-amount'));
  reporter.check('tapping the shaft mines ore', minedOre >= 20, `${minedOre} mined`);

  await page.locator('[data-action="sell-all"]').click();
  const afterSell = await text(page, 'currency');
  reporter.check('selling ore earns currency', Number(afterSell) > 0, `currency ${afterSell}`);
  reporter.check('selling is announced in a toast', await page.locator('.toast').isVisible());

  const drillRow = page.locator('[data-drill="drill-1"]');
  await drillRow.locator('[data-mode="x1"]').click();
  reporter.check('buying a drill records ownership',
    (await drillRow.locator('[data-field="owned"]').innerText()).trim() === '1');
  reporter.check('a purchase confirms the amount spent',
    (await page.locator('.toast').innerText()).includes('Bought 1 Hand Drill for'),
    await page.locator('.toast').innerText());

  reporter.check('the tutorial advances past mining, selling, and buying',
    (await text(page, 'tutorial')).includes('Dig deeper'),
    await text(page, 'tutorial'));
  await page.locator('[data-action="dismiss-tutorial"]').click();
  reporter.check('skipping the tutorial hides it', await page.locator('.tutorial').isHidden());
  reporter.check('the HUD reports a production rate', (await text(page, 'rate')).includes('/s'),
    await text(page, 'rate'));

  const beforeIdle = Number(await text(page, 'ore-amount'));
  await page.waitForTimeout(1500);
  const afterIdle = Number(await text(page, 'ore-amount'));
  reporter.check('drills produce without input', afterIdle > beforeIdle, `${beforeIdle} -> ${afterIdle}`);

  reporter.check('an unaffordable purchase is disabled, not hidden',
    await drillRow.locator('[data-mode="x1"]').isDisabled());

  const lockedRow = page.locator('[data-drill="drill-3"]');
  reporter.check('a drill above the current depth is shown but marked locked',
    (await lockedRow.getAttribute('data-locked')) === 'true');
  reporter.check('the locked drill cannot be bought',
    await lockedRow.locator('[data-mode="x1"]').isDisabled());
  reporter.check('the locked drill says which depth it needs',
    (await lockedRow.innerText()).includes('Depth 3'),
    (await lockedRow.innerText()).replace(/\s+/g, ' ').trim().slice(0, 60));

  // --- Save on hide, reload, offline ----------------------------------------
  await hidePage(page);
  await page.waitForTimeout(200);
  const persisted = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  reporter.check('hiding the tab writes a save', typeof persisted === 'string' && persisted.length > 0);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  reporter.check('progress survives a reload', Number(await text(page, 'currency')) > 0,
    `currency ${await text(page, 'currency')}`);
  reporter.check('a skipped tutorial stays skipped after a reload',
    await page.locator('.tutorial').isHidden());

  // Backdating must happen in an init script: the unload handler writes a fresh save during the
  // reload, so an edit made before reloading would be clobbered and credit no time at all.
  await page.addInitScript((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return;
    }
    const save = JSON.parse(raw);
    save.lastSavedAt = Date.now() - 3_600_000;
    window.localStorage.setItem(key, JSON.stringify(save));
  }, SAVE_KEY);

  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  const offlineToast = (await page.locator('.toast').innerText()).trim();
  reporter.check('a returning player is told about offline gains',
    offlineToast.includes('Welcome back'), offlineToast.slice(0, 70));
  reporter.check('the offline report names the real absence of about an hour',
    offlineToast.includes('1h'), offlineToast.slice(0, 70));
  const bankedOre = parseDisplayed(await text(page, 'ore-amount'));
  reporter.check('an hour of absence is banked into the inventory', bankedOre > 100,
    `${await text(page, 'ore-amount')} ore`);

  // --- Seeded run: digging, workers -----------------------------------------
  const seededContext = await session.newContext();
  const seeded = await openPage(seededContext);
  await boot(seeded, server.url, { save: JSON.stringify(richSave) });

  reporter.check('a seeded rich save loads its currency', (await text(seeded, 'currency')) !== '0',
    await text(seeded, 'currency'));

  // --- Per-category selling -------------------------------------------------
  // Ore is produced fast by the 10 drills, so selling gems is the unambiguous read: gems do not
  // come back within the snapshot gap, while ore would drift.
  const gemsBeforeSell = Number(await text(seeded, 'gem-amount'));
  const oreBeforeSell = await text(seeded, 'ore-amount');
  await seeded.locator('[data-action="sell-gems"]').click();
  await seeded.waitForTimeout(200);
  const gemsAfterSell = Number(await text(seeded, 'gem-amount'));
  reporter.check('selling one category clears only that category',
    gemsAfterSell < gemsBeforeSell / 2, `${gemsBeforeSell} -> ${gemsAfterSell}`);
  reporter.check('selling one category leaves the rest banked',
    Number(await text(seeded, 'ore-amount')) >= Number(oreBeforeSell),
    `ore ${oreBeforeSell} -> ${await text(seeded, 'ore-amount')}`);
  reporter.check('selling one category is announced with the resource name',
    (await seeded.locator('.toast').innerText()).includes('Quartz'),
    await seeded.locator('.toast').innerText());

  const digButton = seeded.locator('[data-action="dig-deeper"]');
  reporter.check('digging is affordable and enabled', (await digButton.isDisabled()) === false);

  await digButton.click();
  await seeded.waitForTimeout(300);
  reporter.check('digging deeper advances the depth', (await text(seeded, 'depth')).includes('2'),
    await text(seeded, 'depth'));
  reporter.check('the new tier has a different ore', (await text(seeded, 'ore-name')) === 'Copper',
    await text(seeded, 'ore-name'));
  reporter.check('the new tier has different gems and rare minerals',
    (await text(seeded, 'gem-name')) === 'Amethyst' && (await text(seeded, 'rare-name')) === 'Silver',
    `${await text(seeded, 'gem-name')} / ${await text(seeded, 'rare-name')}`);
  reporter.check('digging is announced in a toast',
    (await seeded.locator('.toast').innerText()).includes('Dug deeper'));

  await digButton.click();
  await seeded.waitForTimeout(300);
  const deepRow = seeded.locator('[data-drill="drill-3"]');
  reporter.check('digging unlocks the matching drill tier',
    (await deepRow.getAttribute('data-locked')) === 'false');

  await deepRow.locator('[data-mode="x1"]').click();
  reporter.check('the newly unlocked drill can be bought',
    (await deepRow.locator('[data-field="owned"]').innerText()).trim() === '1');

  const rateBeforeWorkers = await text(seeded, 'rate');
  const hireButton = seeded.locator('[data-action="hire-worker"]');
  reporter.check('the worker panel offers hiring past the milestone',
    (await hireButton.isDisabled()) === false);

  await hireButton.click();
  await seeded.waitForTimeout(200);
  const workerRows = seeded.locator('[data-worker]');
  reporter.check('hiring adds a worker to the crew', (await workerRows.count()) === 1);

  const firstWorker = workerRows.first();
  const workerSummary = (await firstWorker.innerText()).replace(/\s+/g, ' ').trim();
  reporter.check('the new worker is named and starts at level 1',
    workerSummary.includes('Lv 1') && /^[A-Z][a-z]+ [A-Z][a-z]+/.test(workerSummary),
    workerSummary.slice(0, 60));

  const assignment = firstWorker.locator('[data-field="worker-assignment"]');
  await assignment.selectOption('category:ore');
  await seeded.waitForTimeout(200);
  reporter.check('a worker can be put on a resource category',
    (await assignment.inputValue()) === 'category:ore');

  const rateWithWorker = await text(seeded, 'rate');
  reporter.check('putting a worker on ore raises ore output',
    parseDisplayed(rateWithWorker) > parseDisplayed(rateBeforeWorkers),
    `${rateBeforeWorkers} -> ${rateWithWorker}`);

  const trainButton = firstWorker.locator('[data-action="train-worker"]');
  await trainButton.click();
  await seeded.waitForTimeout(200);
  reporter.check('training raises the worker level',
    (await firstWorker.innerText()).includes('Lv 2'),
    (await firstWorker.innerText()).replace(/\s+/g, ' ').slice(0, 50));

  // --- Rename and dismiss ---------------------------------------------------
  await firstWorker.locator('[data-field="worker-rename"]').fill('Peta Quarry');
  await firstWorker.locator('[data-action="rename-worker"]').click();
  await seeded.waitForTimeout(200);
  reporter.check('a worker can be renamed',
    (await firstWorker.innerText()).includes('Peta Quarry'),
    (await firstWorker.innerText()).replace(/\s+/g, ' ').slice(0, 50));

  const dismissDialog = seeded.locator('[data-dialog="dismiss-worker"]');
  await firstWorker.locator('[data-action="dismiss-worker"]').click();
  reporter.check('dismissing a worker asks for confirmation first',
    (await dismissDialog.isVisible()) && (await workerRows.count()) === 1,
    `dialog ${await dismissDialog.isVisible()}, crew ${await workerRows.count()}`);
  await dismissDialog.locator('[data-action="cancel"]').click();
  reporter.check('cancelling a dismissal keeps the crew', (await workerRows.count()) === 1);

  await firstWorker.locator('[data-action="dismiss-worker"]').click();
  await dismissDialog.locator('[data-action="confirm"]').click();
  await seeded.waitForTimeout(200);
  reporter.check('confirming a dismissal removes the worker', (await workerRows.count()) === 0,
    `crew ${await workerRows.count()}`);

  // --- Touch targets --------------------------------------------------------
  const tooSmall = await seeded.evaluate(() => {
    return [...document.querySelectorAll('button')]
      .map((button) => ({
        label: button.textContent.trim(),
        height: button.getBoundingClientRect().height,
      }))
      .filter((entry) => entry.height > 0 && entry.height < 44);
  });
  reporter.check('every touch target is at least 44px tall', tooSmall.length === 0,
    tooSmall.map((entry) => `${entry.label}=${Math.round(entry.height)}px`).join(', '));

  // --- Visual review artifact -----------------------------------------------
  // Canvas rendering cannot be asserted pixel-by-pixel without an image decoder, so a
  // screenshot is captured for a human to look at.
  const screenshotPath = 'screenshots/shaft.png';
  await seeded.screenshot({ path: screenshotPath });
  console.log(`\nScreenshot written to ${screenshotPath} for visual review\n`);

  // --- Max depth ------------------------------------------------------------
  for (let step = 0; step < 3; step += 1) {
    if (await digButton.isDisabled()) {
      break;
    }
    await digButton.click();
    await seeded.waitForTimeout(200);
  }
  reporter.check('the shaft reaches its deepest tier',
    (await text(seeded, 'tier-name')) === 'Abyssal Core', await text(seeded, 'tier-name'));
  reporter.check('the deepest shaft disables digging', await digButton.isDisabled());
  reporter.check('the deepest shaft says so', (await text(seeded, 'depth-note')).length > 0,
    await text(seeded, 'depth-note'));

  // --- Prestige: retire the run for a permanent multiplier ------------------
  // The 1M threshold is out of reach for a scripted session, so this page starts from a save
  // whose run already earned well past it. 20M earned credits a x6 multiplier (1 + 20/1 * 0.25).
  const retirementSave = {
    ...richSave,
    currency: ladderCurrency,
    depthTier: 4,
    drills: { 'drill-1': 5, 'drill-2': 2 },
    workers: [
      { id: 'worker-1', name: 'Gus Stone', level: 4, speed: 0.2, luck: 0.05, assignment: null },
    ],
    stats: { totalEarned: 20_000_000, manualExtractions: 0 },
  };

  const retirementContext = await session.newContext();
  const retirement = await openPage(retirementContext);
  await boot(retirement, server.url, { save: JSON.stringify(retirementSave) });

  const prestigeTrigger = retirement.locator('[data-action="open-prestige"]');
  const prestigeDialog = retirement.locator('[data-dialog="prestige"]');

  reporter.check('a run that has earned enough can be retired',
    (await prestigeTrigger.isDisabled()) === false);
  reporter.check('the confirmation stays closed until asked for',
    (await prestigeDialog.isVisible()) === false);
  reporter.check('the reward is promised before it is taken',
    (await text(retirement, 'prestige-gain')) === '+5' &&
      (await text(retirement, 'prestige-next')) === 'x6',
    `${await text(retirement, 'prestige-gain')} -> ${await text(retirement, 'prestige-next')}`);

  await prestigeTrigger.click();
  const penalty = (await text(retirement, 'prestige-summary')).replace(/\s+/g, ' ').trim();
  reporter.check('the confirmation is shown', await prestigeDialog.isVisible());
  reporter.check('the confirmation names the full penalty, not just the reward',
    penalty.includes('7') && penalty.includes('worker') && /depth 4/i.test(penalty),
    penalty.slice(0, 80));

  await retirement.locator('[data-action="cancel-prestige"]').click();
  reporter.check('backing out destroys nothing',
    (await prestigeDialog.isVisible()) === false &&
      (await text(retirement, 'depth')).includes('4') &&
      (await text(retirement, 'currency')) !== '0',
    `${await text(retirement, 'depth')}, currency ${await text(retirement, 'currency')}`);

  await prestigeTrigger.click();
  await retirement.locator('[data-action="confirm-prestige"]').click();
  await retirement.waitForTimeout(300);

  reporter.check('the run is retired back to the surface',
    (await text(retirement, 'depth')).includes('1'), await text(retirement, 'depth'));
  reporter.check('the retired run gives up its currency',
    (await text(retirement, 'currency')) === '0', await text(retirement, 'currency'));
  reporter.check('the retired run gives up its drills',
    (await retirement.locator('[data-field="owned"]').first().innerText()).trim() === '0');
  reporter.check('the retired run gives up its crew',
    (await retirement.locator('[data-worker]').count()) === 0);
  reporter.check('the permanent multiplier is granted and shown',
    (await text(retirement, 'multiplier')) === 'x6', await text(retirement, 'multiplier'));
  reporter.check('the reset is announced, not silent',
    (await retirement.locator('.toast').innerText()).includes('permanent multiplier'),
    (await retirement.locator('.toast').innerText()).replace(/\s+/g, ' ').slice(0, 70));
  reporter.check('the fresh run has to earn its way back to prestige',
    (await prestigeTrigger.isDisabled()) === true &&
      (await text(retirement, 'prestige-gain')) === '');

  // Read the persisted result from a plain new page rather than reloading this one. The seeding
  // init script registered by `boot` re-runs on every navigation, so a reload here would re-seed
  // the pre-prestige save over the real one and the check would silently prove nothing.
  const returned = await openPage(retirementContext);
  await boot(returned, server.url);

  reporter.check('the permanent multiplier survives the reset and a reload',
    (await text(returned, 'multiplier')) === 'x6', await text(returned, 'multiplier'));
  reporter.check('the retired run stayed retired in storage',
    (await text(returned, 'depth')).includes('1') &&
      (await returned.locator('[data-worker]').count()) === 0);
  const storedPrestige = await returned.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const save = JSON.parse(raw);
    return {
      count: save.prestige.count,
      multiplier: save.prestige.multiplier,
      currency: save.currency,
      drills: Object.keys(save.drills).length,
    };
  }, SAVE_KEY);
  reporter.check('the reset and the prestige count reached storage, not just memory',
    storedPrestige?.count === 1 &&
      storedPrestige?.multiplier === 6 &&
      storedPrestige?.currency === 0 &&
      storedPrestige?.drills === 0,
    JSON.stringify(storedPrestige));
} catch (error) {
  reporter.check('smoke run completed without throwing', false, String(error).split('\n')[0]);
}

// --- Two tabs, one mine -----------------------------------------------------
// Deliberately one context: shared localStorage is the exact condition the tab guard exists for.
// A drill produces in tab A; tab B must refuse to race it, then take over when A closes.
try {
  const twoTabContext = await session.newContext();
  const owner = await openPage(twoTabContext);
  await boot(owner, server.url, { save: JSON.stringify({ ...richSave, tutorial: { step: 5, completed: true } }) });

  const second = await openPage(twoTabContext);
  await boot(second, server.url);

  reporter.check('a second tab is told the mine is open elsewhere',
    (await second.locator('.toast').innerText()).includes('already open in another tab'),
    JSON.stringify(await second.locator('.toast').innerText()));

  const ownerOre = Number(await text(owner, 'ore-amount'));
  await owner.waitForTimeout(2500);
  const secondOre = Number(await text(second, 'ore-amount'));
  reporter.check('the second tab does not double-produce',
    Number(await text(owner, 'ore-amount')) > ownerOre && secondOre === Number(await text(second, 'ore-amount')),
    `owner ${ownerOre} -> ${await text(owner, 'ore-amount')}, second ${secondOre} -> ${await text(second, 'ore-amount')}`);

  await owner.close();
  // Headless page.close() does not run beforeunload handlers, so takeover must wait out the
  // full stale window (15s) plus one heartbeat cycle before the second tab may promote.
  await second.waitForTimeout(17_000);
  const before = Number(await text(second, 'ore-amount'));
  await second.waitForTimeout(2500);
  reporter.check('closing the owner hands the mine to the second tab',
    Number(await text(second, 'ore-amount')) > before,
    `${before} -> ${await text(second, 'ore-amount')}`);
  await twoTabContext.close();
} catch (error) {
  reporter.check('the two-tab scenario completed without throwing', false, String(error).split('\n')[0]);
}

await session.close();
await server.close();

const fatal = session.errors.filter((entry) => !/favicon|net::ERR_/i.test(entry));
reporter.check('no JavaScript errors were reported', fatal.length === 0, fatal.slice(0, 3).join(' | '));

failProcessIfNeeded(reporter);
