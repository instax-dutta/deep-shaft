import Phaser from 'phaser';

import { evaluateAchievements } from './core/achievements.js';
import { runAutomation, setAutomation } from './core/automation.js';
import { digDeeper } from './core/depth.js';
import { buyDrill } from './core/drills.js';
import { activeModifiers, advanceEvents } from './core/events.js';
import { M } from './core/numbers/magnitude.js';
import { formatNumber } from './core/numberFormat.js';
import { applyOfflineProgress } from './core/offline.js';
import { performPrestige } from './core/prestige.js';
import { buyUpgrade } from './core/prestigeUpgrades.js';
import { advanceProduction } from './core/production.js';
import { mineManually, sellAll, sellCategory } from './core/resources.js';
import { setSetting } from './core/settings.js';
import { createInitialState } from './core/state.js';
import { TUTORIAL_EVENTS, advanceTutorial, tutorialState } from './core/tutorial.js';
import {
  assignWorker,
  dismissWorker,
  hireWorker,
  renameWorker,
  trainWorker,
} from './core/workers.js';
import { config } from './data/config.js';
import { getDepthTier } from './data/depthTiers.js';
import { getDrill } from './data/drills.js';
import { getPrestigeUpgrade } from './data/prestigeUpgrades.js';
import { getResource } from './data/resources.js';
import { SOUND_IDS, getSound } from './data/sounds.js';
import { createClock } from './platform/clock.js';
import { createAudio, createWebAudioBackend } from './platform/audio.js';
import { createLifecycle } from './platform/lifecycle.js';
import { createLocalStorageBackend, createStorage } from './platform/storage.js';
import { registerServiceWorker } from './platform/serviceWorker.js';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { createAchievementsPanel } from './ui/achievementsPanel.js';
import { createDepthPanel } from './ui/depthPanel.js';
import { createElement } from './ui/dom.js';
import { createHud } from './ui/hud.js';
import { createAnnouncer, createLiveRegion } from './ui/liveRegion.js';
import { createPrestigeModal } from './ui/prestigeModal.js';
import { createPrestigePanel } from './ui/prestigePanel.js';
import { createSettingsPanel, settingsRootClasses } from './ui/settingsPanel.js';
import { createShopPanel } from './ui/shopPanel.js';
import { createToast } from './ui/toast.js';
import { createTutorialPanel } from './ui/tutorialPanel.js';
import { createWorkerPanel } from './ui/workerPanel.js';

/** Player-facing copy for refused commands — refusals are explained, never silent. */
const REFUSAL_COPY = Object.freeze({
  insufficient_currency: 'Not enough currency yet.',
  drill_locked: 'Dig deeper to unlock that drill.',
  unknown_drill: 'That drill does not exist.',
  invalid_mode: 'Unsupported purchase mode.',
  unknown_resource: 'That resource does not exist.',
  unknown_category: 'That resource category does not exist.',
  invalid_name: 'A worker needs a name.',
  insufficient_resource: 'Nothing to sell yet.',
  invalid_amount: 'That is not a valid amount.',
  max_depth: 'The shaft is already at its deepest.',
  workers_locked: 'Workers unlock once the mine has earned enough.',
  roster_full: 'The crew is full.',
  unknown_worker: 'That worker is not on the crew.',
  max_level: 'That worker is already fully trained.',
  invalid_target: 'That is not somewhere a worker can be put.',
  below_threshold: 'Prestige unlocks once this run has earned enough.',
  unknown_upgrade: 'That upgrade does not exist.',
  insufficient_points: 'Not enough prestige points yet.',
  max_level: 'That upgrade is already maxed out.',
  unknown_automation: 'That automation does not exist.',
  unknown_setting: 'That setting does not exist.',
  invalid_value: 'That is not a valid value for this setting.',
});

/**
 * Verification-only event pacing.
 *
 * The shipped interval is 45–180s, which is right for a player and useless for a browser check.
 * Both values are swapped in at build time, so in a production build they evaluate to
 * `undefined`, the branch is dead, and no trace of it reaches the bundle. See
 * `scripts/browser-events.mjs`.
 */
function createEventAdvanceOptions() {
  const intervalSeconds = Number(import.meta.env.VITE_EVENT_INTERVAL_SECONDS);
  const durationScale = Number(import.meta.env.VITE_EVENT_DURATION_SCALE);

  const options = {};
  if (Number.isFinite(intervalSeconds) && intervalSeconds > 0) {
    options.intervalRange = { minSeconds: intervalSeconds, maxSeconds: intervalSeconds };
  }
  if (Number.isFinite(durationScale) && durationScale > 0) {
    options.durationScale = durationScale;
  }
  return options;
}

const eventAdvanceOptions = createEventAdvanceOptions();

function describeDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function boot() {
  const root = document.getElementById('app-root');
  if (!root) {
    throw new Error('Missing #app-root host element in index.html');
  }

  const shaftHost = createElement('div', { className: 'shaft', attrs: { id: 'shaft' } });
  const panelHost = createElement('div', { className: 'panels' });
  root.replaceChildren(shaftHost, panelHost);

  const clock = createClock();
  const storage = createStorage(createLocalStorageBackend());
  const toast = createToast({ root: panelHost });

  // Loading is an outcome, not a boolean. "No save yet" is a fresh player and should be
  // silent; "the save could not be read" is a recovery the player must be told about rather
  // than silently losing their mine.
  const loaded = storage.loadResult();
  const state = loaded.ok ? loaded.state : createInitialState();

  if (loaded.ok && loaded.source === 'backup') {
    toast.show('Your last save could not be read — restored the previous backup.', {
      tone: 'warn',
    });
  } else if (!loaded.ok && loaded.reason !== 'absent') {
    toast.show('Save could not be read — started a new mine (your old save was kept as a backup).', {
      tone: 'warn',
    });
  }

  const offline = applyOfflineProgress(state, { nowMs: clock.now() });
  if (offline.seconds > 0) {
    const produced = Object.values(offline.gains).reduce(
      (total, value) => M.add(total, value),
      0,
    );
    toast.show(
      produced > 0
        ? `Welcome back — ${describeDuration(offline.seconds)} of mining produced ${formatNumber(produced)}.`
        : `Welcome back — the drills were idle for ${describeDuration(offline.seconds)}.`,
      { tone: produced > 0 ? 'good' : 'neutral' },
    );
  }

  const hud = createHud({ root: panelHost, dispatch: (command) => dispatch(command) });
  const depthPanel = createDepthPanel({ root: panelHost, dispatch: (command) => dispatch(command) });
  const shop = createShopPanel({ root: panelHost, dispatch: (command) => dispatch(command) });
  const workerPanel = createWorkerPanel({ root: panelHost, dispatch: (command) => dispatch(command) });
  const prestigeModal = createPrestigeModal({ root: panelHost, dispatch: (command) => dispatch(command) });
  const prestigePanel = createPrestigePanel({ root: panelHost, dispatch: (command) => dispatch(command) });
  const achievementsPanel = createAchievementsPanel({
    root: panelHost,
    announce: (message, options) => toast.show(message, options),
  });
  const settingsPanel = createSettingsPanel({ root: panelHost, dispatch: (command) => dispatch(command) });
  const tutorialPanel = createTutorialPanel({ root: panelHost, dispatch: (command) => dispatch(command) });

  // Screen readers hear milestone crossings once, not a value churning every tick.
  const liveRegion = createLiveRegion({ root: panelHost });
  const announcer = createAnnouncer({ region: liveRegion });

  // Sound is optional and player-controlled: the setting mutes it, the volume sets its level,
  // and every failure inside the adapter is swallowed there rather than reaching this loop.
  const audio = createAudio({
    backend: createWebAudioBackend({ resolve: (id) => getSound(id) }),
  });

  function playSound(id) {
    if (!state.settings?.sound) {
      return;
    }
    // Settings are normalized on load, so volume is always a complete 0..1 number.
    audio.setVolume(state.settings.volume);
    audio.play(id);
  }

  /** Reflects settings that need a class on the app root (reduced motion). */
  function applySettings() {
    const classes = new Set(settingsRootClasses(state.settings));
    document.documentElement.classList.toggle('reduced-motion', classes.has('reduced-motion'));
  }

  function render() {
    hud.render(state);
    depthPanel.render(state);
    shop.render(state);
    workerPanel.render(state);
    prestigeModal.render(state);
    prestigePanel.render(state);
    achievementsPanel.render(state);
    settingsPanel.render(state);
    tutorialPanel.render(state);
    announcer.update(state);
  }

  /** Walks the tutorial forward after a successful command; a completed or skipped one ignores it. */
  function tutor(event) {
    advanceTutorial(state, event);
  }

  // A player-initiated message holds the toast for a moment, so a lower-priority notice (an
  // achievement, say) cannot replace a reset or a penalty before the player has read it.
  let importantUntil = 0;
  let pendingAchievements = [];

  function notify(message, options) {
    importantUntil = clock.now() + config.ui.toastHoldMs;
    toast.show(message, options);
  }

  function refuse(reason) {
    notify(REFUSAL_COPY[reason] ?? 'That action is not available.', { tone: 'warn' });
  }

  function dispatch(command) {
    switch (command?.type) {
      case 'mine': {
        // The result is returned so the shaft can show what a tap produced.
        const result = mineManually(state);
        if (result.ok) {
          playSound(SOUND_IDS.MINE);
        }
        tutor(TUTORIAL_EVENTS.MINED);
        render();
        return result;
      }

      case 'sellAll': {
        const result = sellAll(state);
        if (!result.ok) {
          refuse(result.reason);
        } else if (result.value > 0) {
          notify(`Sold for ${formatNumber(result.value)}.`, { tone: 'good' });
          playSound(SOUND_IDS.SELL);
        } else {
          notify('Nothing to sell yet.');
        }
        tutor(TUTORIAL_EVENTS.SOLD);
        break;
      }

      case 'sellCategory': {
        const result = sellCategory(state, command.category);
        if (!result.ok) {
          refuse(result.reason);
        } else if (result.value > 0) {
          const name = getResource(result.resourceId)?.name ?? 'resources';
          notify(`Sold ${formatNumber(result.amount)} ${name} for ${formatNumber(result.value)}.`, {
            tone: 'good',
          });
          playSound(SOUND_IDS.SELL);
        } else {
          notify('Nothing to sell yet.');
        }
        tutor(TUTORIAL_EVENTS.SOLD);
        break;
      }

      case 'buyDrill': {
        const result = buyDrill(state, command.drillId, command.mode);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          // A spend worth making is worth confirming with the real number, so the player sees
          // what a bulk buy actually cost.
          notify(
            `Bought ${result.quantity} ${getDrill(command.drillId)?.name ?? 'drill'} for ${formatNumber(result.cost)}.`,
            { tone: 'good' },
          );
          playSound(SOUND_IDS.BUY);
          tutor(TUTORIAL_EVENTS.BOUGHT_DRILL);
        }
        break;
      }

      case 'hireWorker': {
        const result = hireWorker(state);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          notify(`Hired ${result.worker.name} for ${formatNumber(result.cost)}.`, {
            tone: 'good',
          });
        }
        break;
      }

      case 'trainWorker': {
        const result = trainWorker(state, command.workerId);
        if (!result.ok) {
          refuse(result.reason);
        }
        break;
      }

      case 'assignWorker': {
        const result = assignWorker(state, command.workerId, command.assignment);
        if (!result.ok) {
          refuse(result.reason);
        }
        break;
      }

      case 'renameWorker': {
        const result = renameWorker(state, command.workerId, command.name);
        if (!result.ok) {
          refuse(result.reason);
        }
        break;
      }

      case 'dismissWorker': {
        const result = dismissWorker(state, command.workerId);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          notify(`${result.worker?.name ?? 'Worker'} left the crew.`, { tone: 'warn' });
        }
        break;
      }

      case 'prestige': {
        const result = performPrestige(state);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          // A reset is destructive, so persist the permanent reward immediately rather than
          // waiting for the next autosave.
          save();
          notify(
            `Run retired — permanent multiplier is now x${formatNumber(result.multiplier)}, ` +
              `and ${result.points} prestige point${result.points === 1 ? '' : 's'} were banked.`,
            { tone: 'good' },
          );
          playSound(SOUND_IDS.PRESTIGE);
        }
        break;
      }

      case 'buyUpgrade': {
        const result = buyUpgrade(state, command.upgradeId);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          // A permanent purchase is worth persisting immediately rather than at the next autosave.
          save();
          const definition = getPrestigeUpgrade(command.upgradeId);
          notify(`${definition?.name ?? 'Upgrade'} is now level ${result.level}.`, {
            tone: 'good',
          });
        }
        break;
      }

      case 'setSetting': {
        const result = setSetting(state, command.key, command.value);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          applySettings();
          if (command.key === 'sound') {
            if (command.value) {
              audio.unmute();
            } else {
              audio.mute();
            }
          }
          if (command.key === 'volume') {
            audio.setVolume(command.value);
          }
        }
        break;
      }

      case 'resetGame': {
        // A reset is a deliberate, irreversible act: clear the persisted save, then replace the
        // in-memory state field by field so every panel reads the fresh mine on the next render.
        storage.clear();
        Object.assign(state, createInitialState());
        applySettings();
        save();
        notify('Mine reset — starting fresh.', { tone: 'warn' });
        break;
      }

      case 'importSave': {
        // The panel already validated this state with the same core function.
        Object.assign(state, command.state);
        applySettings();
        save();
        notify('Save imported.', { tone: 'good' });
        break;
      }

      case 'advanceTutorial': {
        const result = advanceTutorial(state, command.event);
        if (!result.ok && command.event === TUTORIAL_EVENTS.DISMISSED) {
          // Skipping is always allowed: mark the tutorial done so it never reappears.
          state.tutorial.completed = true;
          state.tutorial.step = tutorialState(state).total;
        } else if (!result.ok) {
          refuse(result.reason);
        }
        break;
      }

      case 'setAutomation': {
        const result = setAutomation(state, command.kind, command.enabled);
        if (!result.ok) {
          refuse(result.reason);
        }
        break;
      }

      case 'digDeeper': {
        const result = digDeeper(state);
        if (!result.ok) {
          refuse(result.reason);
        } else {
          const tier = getDepthTier(result.tier);
          notify(`Dug deeper — now working ${tier ? tier.name : `tier ${result.tier}`}.`, {
            tone: 'good',
          });
          playSound(SOUND_IDS.BUY);
          tutor(TUTORIAL_EVENTS.DUG);
        }
        break;
      }

      default:
        break;
    }

    render();
  }

  function save() {
    state.lastSavedAt = clock.now();
    const result = storage.save(state);
    if (!result.ok) {
      toast.show('Progress could not be saved in this browser.', { tone: 'warn' });
    }
  }

  const context = {
    dispatch,
    getState: () => state,
    // The shaft dims and glows from the same modifier snapshot production consumes.
    getModifiers: () => activeModifiers(state),
  };

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: shaftHost,
    backgroundColor: '#12100e',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: '100%',
      height: '100%',
    },
    scene: [new BootScene(context), new GameScene(context)],
  });

  let lastTick = clock.now();
  window.setInterval(() => {
    const now = clock.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;

    // Production runs first so a cave-in that starts this tick only affects the next one.
    advanceProduction(state, elapsed);
    // Automation acts on the resources production just banked, using the same commands a tap
    // would issue. Its actions are silent: the resulting state is visible in the HUD.
    runAutomation(state, elapsed);

    // Achievements are evaluated once per tick rather than at every stat change: one call site,
    // and a newly earned goal is announced exactly once because evaluation is idempotent.
    const earned = evaluateAchievements(state, { nowMs: now });
    if (earned.newlyEarned.length > 0) {
      pendingAchievements.push(...earned.newlyEarned);
    }
    if (pendingAchievements.length > 0 && now >= importantUntil) {
      achievementsPanel.announce(pendingAchievements);
      pendingAchievements = [];
    }

    const events = advanceEvents(state, elapsed, eventAdvanceOptions);
    if (events.triggered) {
      toast.show(events.triggered.announcement, { tone: events.triggered.tone });
      playSound(
        events.triggered.tone === 'good' ? SOUND_IDS.EVENT_GOOD : SOUND_IDS.EVENT_BAD,
      );
    }
    for (const ended of events.expired) {
      toast.show(`${ended.name} is over.`);
    }

    render();
  }, config.loop.tickMs);

  window.setInterval(save, config.persistence.autosaveIntervalMs);

  const lifecycle = createLifecycle();
  lifecycle.start({ onHidden: save, onUnload: save });

  // Installability is a bonus rather than a requirement: the adapter reports an unsupported
  // browser or a failed registration structurally, and the game plays on from the page it already
  // has. Nothing here is allowed to interrupt boot.
  void registerServiceWorker();

  applySettings();
  render();
}

boot();
