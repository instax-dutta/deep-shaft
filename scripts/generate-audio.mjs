/**
 * Generates the audio pack into `public/audio/` as small, license-clean WAV files.
 *
 * Same philosophy as the art pack: the game ships no third-party assets, so every sound is a
 * short synthesized blip written out here. Run: node scripts/generate-audio.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'audio');

const SAMPLE_RATE = 22_050;

/**
 * One tiny 16-bit mono PCM WAV. `tone` shapes the pitch over time so each event reads as its
 * own blip rather than a single repeated beep.
 */
function blip({ durationMs = 90, from = 660, to = 660, gain = 0.5 }) {
  const durationSeconds = durationMs / 1000;
  const sampleCount = Math.floor(durationSeconds * SAMPLE_RATE);
  const samples = new Int16Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const frequency = from + (to - from) * progress;
    const envelope = Math.sin(Math.PI * progress) * gain;
    const sample = Math.sin(2 * Math.PI * frequency * progress * durationSeconds) * envelope;
    samples[index] = Math.max(-1, Math.min(1, sample)) * 32_767;
  }

  const dataSize = sampleCount * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataSize, true);
  new Int16Array(buffer, 44).set(samples);

  return Buffer.from(buffer);
}

const SOUNDS = {
  'mine.wav': blip({ durationMs: 60, from: 520, to: 700, gain: 0.35 }),
  'sell.wav': blip({ durationMs: 140, from: 440, to: 880, gain: 0.45 }),
  'buy.wav': blip({ durationMs: 120, from: 880, to: 520, gain: 0.4 }),
  'event-good.wav': blip({ durationMs: 220, from: 523, to: 1046, gain: 0.45 }),
  'event-bad.wav': blip({ durationMs: 220, from: 392, to: 196, gain: 0.5 }),
  'prestige.wav': blip({ durationMs: 320, from: 261, to: 784, gain: 0.5 }),
};

mkdirSync(outDir, { recursive: true });
for (const [name, buffer] of Object.entries(SOUNDS)) {
  const outPath = join(outDir, name);
  writeFileSync(outPath, buffer);
  console.log(`wrote ${outPath} (${buffer.length} bytes)`);
}
