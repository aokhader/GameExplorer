/**
 * SFX recipes — the sounds the app makes, as pure data.
 *
 * These used to live inside web's WebAudio synth as a `switch` of imperative
 * calls, which meant mobile had no way to reach them: React Native has no
 * WebAudio, so native playback needs real audio files. Expressing each sound as
 * a list of tone specs lets both platforms come from one source — web renders
 * them live through WebAudio, and `scripts/render-sfx.mjs` renders the exact
 * same specs to the WAV assets the native app ships.
 *
 * If a recipe changes here, re-run the render script or the two platforms drift.
 */

export type SfxEvent =
  | 'move'
  | 'capture'
  | 'check'
  | 'castle'
  | 'promote'
  | 'flip'
  | 'jump'
  | 'select'
  | 'illegal'
  | 'lowTime'
  | 'win'
  | 'loss'
  | 'draw';

/** Every event, for iterating (a union alone can't be enumerated at runtime). */
export const SFX_EVENTS: readonly SfxEvent[] = [
  'move', 'capture', 'check', 'castle', 'promote', 'flip', 'jump',
  'select', 'illegal', 'lowTime', 'win', 'loss', 'draw',
];

export type SfxWave = 'sine' | 'triangle' | 'sawtooth' | 'square';

/**
 * One enveloped tone. `start` and `duration` are seconds relative to the start
 * of the sound; the envelope is a short attack to `gain` then an exponential
 * release back to silence, which is what keeps these free of clicks.
 */
export interface SfxTone {
  freq: number;
  start: number;
  duration: number;
  gain: number;
  type: SfxWave;
  /** Exponential pitch glide, reached at `start + duration`. */
  glideTo?: number;
}

/** Attack time in seconds — the ramp from silence up to a tone's full gain. */
export const SFX_ATTACK_S = 0.008;

/** Event → tones. Kept short (<1s) and warm. */
export const SFX_RECIPES: Record<SfxEvent, readonly SfxTone[]> = {
  move: [
    { freq: 320, start: 0, duration: 0.07, gain: 0.14, type: 'triangle' },
  ],
  select: [
    { freq: 480, start: 0, duration: 0.05, gain: 0.08, type: 'sine' },
  ],
  capture: [
    { freq: 220, start: 0, duration: 0.1, gain: 0.2, type: 'sawtooth', glideTo: 140 },
    { freq: 90, start: 0.02, duration: 0.12, gain: 0.16, type: 'square' },
  ],
  // Light arc: up, then down.
  jump: [
    { freq: 360, start: 0, duration: 0.08, gain: 0.14, type: 'triangle', glideTo: 560 },
    { freq: 200, start: 0.08, duration: 0.1, gain: 0.16, type: 'sawtooth', glideTo: 150 },
  ],
  flip: [
    { freq: 520, start: 0, duration: 0.06, gain: 0.1, type: 'sine', glideTo: 700 },
  ],
  castle: [
    { freq: 300, start: 0, duration: 0.07, gain: 0.14, type: 'triangle' },
    { freq: 300, start: 0.09, duration: 0.07, gain: 0.14, type: 'triangle' },
  ],
  promote: [
    { freq: 523, start: 0, duration: 0.1, gain: 0.16, type: 'sine' },
    { freq: 659, start: 0.09, duration: 0.1, gain: 0.16, type: 'sine' },
    { freq: 784, start: 0.18, duration: 0.16, gain: 0.18, type: 'sine' },
  ],
  check: [
    { freq: 880, start: 0, duration: 0.12, gain: 0.18, type: 'sine' },
    { freq: 1180, start: 0.1, duration: 0.16, gain: 0.2, type: 'sine' },
  ],
  illegal: [
    { freq: 160, start: 0, duration: 0.12, gain: 0.16, type: 'square', glideTo: 110 },
  ],
  lowTime: [
    { freq: 1000, start: 0, duration: 0.06, gain: 0.12, type: 'sine' },
  ],
  // Rising major arpeggio + sparkle.
  win: [
    { freq: 523, start: 0, duration: 0.14, gain: 0.22, type: 'triangle' },
    { freq: 659, start: 0.12, duration: 0.14, gain: 0.22, type: 'triangle' },
    { freq: 784, start: 0.24, duration: 0.16, gain: 0.24, type: 'triangle' },
    { freq: 1047, start: 0.38, duration: 0.4, gain: 0.26, type: 'sine' },
  ],
  loss: [
    { freq: 440, start: 0, duration: 0.2, gain: 0.2, type: 'sine', glideTo: 330 },
    { freq: 294, start: 0.2, duration: 0.4, gain: 0.2, type: 'sine', glideTo: 220 },
  ],
  draw: [
    { freq: 440, start: 0, duration: 0.16, gain: 0.18, type: 'triangle' },
    { freq: 440, start: 0.16, duration: 0.22, gain: 0.16, type: 'triangle' },
  ],
};

/** Total length of a rendered sound, including the tail after the last tone. */
export function sfxDurationS(event: SfxEvent): number {
  const tones = SFX_RECIPES[event];
  return Math.max(...tones.map((t) => t.start + t.duration)) + 0.02;
}
