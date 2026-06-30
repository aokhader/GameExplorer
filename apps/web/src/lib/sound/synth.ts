/**
 * Framework-agnostic SFX synth for GameExplorer.
 *
 * Generates short, friendly UI/game sounds with the WebAudio API — no audio
 * asset files to bundle or fetch. A single lazily-created AudioContext is shared
 * across the app; it is only constructed on the first `play()` (which must
 * follow a user gesture, per browser autoplay policy).
 *
 * The caller (useGameSfx) decides whether sound is enabled; this module just
 * plays when asked. All errors are swallowed — audio is a nicety, never a
 * failure path.
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

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

type Wave = OscillatorType;

/** Play a single enveloped tone. Times are seconds relative to ctx.currentTime. */
function tone(
  c: AudioContext,
  freq: number,
  start: number,
  duration: number,
  opts: { gain?: number; type?: Wave; glideTo?: number } = {},
) {
  const { gain = 0.2, type = 'sine', glideTo } = opts;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.connect(vol);
  vol.connect(c.destination);
  osc.type = type;
  const t = c.currentTime + start;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + duration);
  // Tiny attack avoids clicks; exponential release feels natural.
  vol.gain.setValueAtTime(0.0001, t);
  vol.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Event → tone recipe. Kept short (<1s) and warm. */
function render(c: AudioContext, event: SfxEvent) {
  switch (event) {
    case 'move':
      tone(c, 320, 0, 0.07, { gain: 0.14, type: 'triangle' });
      break;
    case 'select':
      tone(c, 480, 0, 0.05, { gain: 0.08, type: 'sine' });
      break;
    case 'capture':
      tone(c, 220, 0, 0.1, { gain: 0.2, type: 'sawtooth', glideTo: 140 });
      tone(c, 90, 0.02, 0.12, { gain: 0.16, type: 'square' });
      break;
    case 'jump':
      // light arc: up then down
      tone(c, 360, 0, 0.08, { gain: 0.14, type: 'triangle', glideTo: 560 });
      tone(c, 200, 0.08, 0.1, { gain: 0.16, type: 'sawtooth', glideTo: 150 });
      break;
    case 'flip':
      tone(c, 520, 0, 0.06, { gain: 0.1, type: 'sine', glideTo: 700 });
      break;
    case 'castle':
      tone(c, 300, 0, 0.07, { gain: 0.14, type: 'triangle' });
      tone(c, 300, 0.09, 0.07, { gain: 0.14, type: 'triangle' });
      break;
    case 'promote':
      tone(c, 523, 0, 0.1, { gain: 0.16, type: 'sine' });
      tone(c, 659, 0.09, 0.1, { gain: 0.16, type: 'sine' });
      tone(c, 784, 0.18, 0.16, { gain: 0.18, type: 'sine' });
      break;
    case 'check':
      tone(c, 880, 0, 0.12, { gain: 0.18, type: 'sine' });
      tone(c, 1180, 0.1, 0.16, { gain: 0.2, type: 'sine' });
      break;
    case 'illegal':
      tone(c, 160, 0, 0.12, { gain: 0.16, type: 'square', glideTo: 110 });
      break;
    case 'lowTime':
      tone(c, 1000, 0, 0.06, { gain: 0.12, type: 'sine' });
      break;
    case 'win':
      // rising major arpeggio + sparkle
      tone(c, 523, 0, 0.14, { gain: 0.22, type: 'triangle' });
      tone(c, 659, 0.12, 0.14, { gain: 0.22, type: 'triangle' });
      tone(c, 784, 0.24, 0.16, { gain: 0.24, type: 'triangle' });
      tone(c, 1047, 0.38, 0.4, { gain: 0.26, type: 'sine' });
      break;
    case 'loss':
      tone(c, 440, 0, 0.2, { gain: 0.2, type: 'sine', glideTo: 330 });
      tone(c, 294, 0.2, 0.4, { gain: 0.2, type: 'sine', glideTo: 220 });
      break;
    case 'draw':
      tone(c, 440, 0, 0.16, { gain: 0.18, type: 'triangle' });
      tone(c, 440, 0.16, 0.22, { gain: 0.16, type: 'triangle' });
      break;
  }
}

/** Play an event's sound. No-ops (silently) if audio is unavailable. */
export async function playSfx(event: SfxEvent): Promise<void> {
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') await c.resume();
    render(c, event);
  } catch {
    /* audio unavailable — ignore */
  }
}
