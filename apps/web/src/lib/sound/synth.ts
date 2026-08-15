/**
 * Framework-agnostic SFX synth for GameExplorer.
 *
 * Generates short, friendly UI/game sounds with the WebAudio API — no audio
 * asset files to bundle or fetch. A single lazily-created AudioContext is shared
 * across the app; it is only constructed on the first `play()` (which must
 * follow a user gesture, per browser autoplay policy).
 *
 * The recipes themselves live in `@gameexplorer/shared` so the native app can
 * pre-render the identical sounds to WAV assets (React Native has no WebAudio).
 * This module is now just the browser renderer for them.
 *
 * The caller (useGameSfx) decides whether sound is enabled; this module just
 * plays when asked. All errors are swallowed — audio is a nicety, never a
 * failure path.
 */

import { SFX_RECIPES, SFX_ATTACK_S, type SfxTone } from '@gameexplorer/shared';

export type { SfxEvent } from '@gameexplorer/shared';
import type { SfxEvent } from '@gameexplorer/shared';

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

/** Play a single enveloped tone. Times are seconds relative to ctx.currentTime. */
function tone(c: AudioContext, spec: SfxTone) {
  const { freq, start, duration, gain, type, glideTo } = spec;
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
  vol.gain.exponentialRampToValueAtTime(gain, t + SFX_ATTACK_S);
  vol.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

function render(c: AudioContext, event: SfxEvent) {
  for (const spec of SFX_RECIPES[event]) tone(c, spec);
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
