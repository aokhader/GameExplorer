/**
 * Render the shared SFX recipes to WAV files for the native app.
 *
 * Web synthesises its sounds live with WebAudio; React Native has no WebAudio,
 * so the mobile app needs real files. Rather than author a second set of sounds
 * by ear (which would drift), this renders the SAME specs from
 * `packages/shared/src/audio/recipes.ts` offline.
 *
 * Run after changing a recipe:
 *   node scripts/render-sfx.mjs
 *
 * Output: apps/mobile/assets/sfx/<event>.wav (mono, 44.1 kHz, 16-bit PCM).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SFX_EVENTS, SFX_RECIPES, SFX_ATTACK_S, sfxDurationS } from '../packages/shared/src/audio/recipes.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'apps', 'mobile', 'assets', 'sfx');

const SAMPLE_RATE = 44100;

/**
 * WebAudio's `exponentialRampToValueAtTime` interpolates geometrically between
 * the two endpoints — matching it here is what makes the rendered file sound
 * like the browser rather than merely similar. Neither endpoint may be zero,
 * which is why the envelope floors at 0.0001 exactly as the web synth does.
 */
function expRamp(from, to, progress) {
  return from * Math.pow(to / from, Math.min(1, Math.max(0, progress)));
}

/** Naive (not band-limited) oscillator. Fine for sub-second UI blips. */
function wave(type, phase) {
  const x = phase % 1;
  switch (type) {
    case 'sine':     return Math.sin(2 * Math.PI * x);
    case 'square':   return x < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * x - 1;
    case 'triangle': return 4 * Math.abs(x - 0.5) - 1;
    default:         return 0;
  }
}

const FLOOR = 0.0001;

/** Gain envelope: fast attack to `gain`, then exponential release to silence. */
function envelope(t, duration, gain) {
  if (t < 0 || t > duration) return 0;
  if (t < SFX_ATTACK_S) return expRamp(FLOOR, gain, t / SFX_ATTACK_S);
  const release = duration - SFX_ATTACK_S;
  if (release <= 0) return gain;
  return expRamp(gain, FLOOR, (t - SFX_ATTACK_S) / release);
}

function renderEvent(event) {
  const totalS = sfxDurationS(event);
  const frames = Math.ceil(totalS * SAMPLE_RATE);
  const out = new Float64Array(frames);

  for (const spec of SFX_RECIPES[event]) {
    const { freq, start, duration, gain, type, glideTo } = spec;
    const first = Math.floor(start * SAMPLE_RATE);
    const last = Math.min(frames, Math.ceil((start + duration) * SAMPLE_RATE));
    // Phase is integrated rather than computed from a fixed frequency: a glide
    // changes the frequency every sample, and `sin(2π·f(t)·t)` would sweep the
    // pitch far past `glideTo`.
    let phase = 0;
    for (let i = first; i < last; i++) {
      const t = i / SAMPLE_RATE - start;
      const f = glideTo ? expRamp(freq, glideTo, t / duration) : freq;
      out[i] += wave(type, phase) * envelope(t, duration, gain);
      phase += f / SAMPLE_RATE;
    }
  }

  return out;
}

/** Mono 16-bit PCM WAV. */
function toWav(samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);          // PCM chunk size
  buf.writeUInt16LE(1, 20);           // format: PCM
  buf.writeUInt16LE(1, 22);           // channels: mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);           // block align
  buf.writeUInt16LE(16, 34);          // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    // Clamp rather than normalise: the recipes are mixed to sit well below full
    // scale, and per-file normalisation would make quiet sounds (select) as loud
    // as loud ones (win), destroying the relative levels web plays them at.
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const event of SFX_EVENTS) {
  const wav = toWav(renderEvent(event));
  writeFileSync(join(OUT_DIR, `${event}.wav`), wav);
  total += wav.length;
  console.log(`${event.padEnd(9)} ${(sfxDurationS(event) * 1000).toFixed(0).padStart(4)}ms  ${(wav.length / 1024).toFixed(1).padStart(6)} KB`);
}
console.log(`\n${SFX_EVENTS.length} files, ${(total / 1024).toFixed(1)} KB total → ${OUT_DIR}`);
