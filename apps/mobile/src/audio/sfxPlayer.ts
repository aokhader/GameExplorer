import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { SfxEvent } from '@gameexplorer/shared';

/**
 * Native SFX playback.
 *
 * Web synthesises these live with WebAudio; React Native has none, so the app
 * ships the same recipes pre-rendered to WAV (see `scripts/render-sfx.mjs`).
 * The `require` map below has to be static — Metro resolves asset requires at
 * bundle time, so `require(\`../../assets/sfx/${event}.wav\`)` would fail.
 */
const SOURCES: Record<SfxEvent, number> = {
  move: require('../../assets/sfx/move.wav'),
  capture: require('../../assets/sfx/capture.wav'),
  check: require('../../assets/sfx/check.wav'),
  castle: require('../../assets/sfx/castle.wav'),
  promote: require('../../assets/sfx/promote.wav'),
  flip: require('../../assets/sfx/flip.wav'),
  jump: require('../../assets/sfx/jump.wav'),
  select: require('../../assets/sfx/select.wav'),
  illegal: require('../../assets/sfx/illegal.wav'),
  lowTime: require('../../assets/sfx/lowTime.wav'),
  win: require('../../assets/sfx/win.wav'),
  loss: require('../../assets/sfx/loss.wav'),
  draw: require('../../assets/sfx/draw.wav'),
};

/**
 * Players are created on first use and kept, not created per play: allocating a
 * native player for every move would churn hard during fast play, and the first
 * one always has load latency the reused one does not.
 */
const players = new Map<SfxEvent, AudioPlayer>();

let audioModeReady = false;

/**
 * Game sound must not stop the user's music or go silent on a locked iPhone
 * ringer switch — these are short, incidental blips, not media playback.
 */
function ensureAudioMode() {
  if (audioModeReady) return;
  audioModeReady = true;
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
  }).catch(() => {});
}

/**
 * Play one effect. Fire-and-forget and error-swallowing by design — audio is a
 * nicety, and a game must never stall or throw because a sound failed.
 */
export function playSfx(event: SfxEvent): void {
  try {
    ensureAudioMode();
    let player = players.get(event);
    if (!player) {
      player = createAudioPlayer(SOURCES[event]);
      players.set(event, player);
    }
    // Rewind first: a player that already reached the end stays there, so
    // `play()` alone would be silent for every repeat of the same sound.
    if (player.currentTime > 0) void player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    /* audio unavailable — ignore */
  }
}

/**
 * Release the native players and forget the audio-session setup. Exposed for
 * tests; the app holds its players for life. The `audioModeReady` latch is
 * cleared too — otherwise this is a partial reset that leaves the next caller
 * with no audio session configured.
 */
export function releaseSfx(): void {
  for (const player of players.values()) {
    try {
      player.remove();
    } catch {
      /* already gone */
    }
  }
  players.clear();
  audioModeReady = false;
}
