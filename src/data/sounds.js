/**
 * Sound content definitions.
 *
 * Event id -> asset path. Assets are generated in-house by `scripts/generate-audio.mjs` and
 * served from `/audio/`, so nothing is fetched from outside and nothing is licensed. The map is
 * the only place an event id is bound to a file; the adapter stays unaware of the pack.
 */

export const SOUND_IDS = Object.freeze({
  MINE: 'mine',
  SELL: 'sell',
  BUY: 'buy',
  EVENT_GOOD: 'eventGood',
  EVENT_BAD: 'eventBad',
  PRESTIGE: 'prestige',
});

export const sounds = Object.freeze({
  [SOUND_IDS.MINE]: 'audio/mine.wav',
  [SOUND_IDS.SELL]: 'audio/sell.wav',
  [SOUND_IDS.BUY]: 'audio/buy.wav',
  [SOUND_IDS.EVENT_GOOD]: 'audio/event-good.wav',
  [SOUND_IDS.EVENT_BAD]: 'audio/event-bad.wav',
  [SOUND_IDS.PRESTIGE]: 'audio/prestige.wav',
});

export function getSound(id) {
  return Object.prototype.hasOwnProperty.call(sounds, id) ? sounds[id] : null;
}
