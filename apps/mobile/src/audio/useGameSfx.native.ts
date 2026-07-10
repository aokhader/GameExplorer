import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useSettings } from '@/providers/SettingsProvider';

/**
 * Game feedback events — the native mirror of web's `SfxEvent`
 * (apps/web/src/lib/sound/synth.ts). Kept as a local union so the mobile app
 * has no dependency on the web-only WebAudio synth module.
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

/**
 * Per-event haptic mapping. Where web fires a `navigator.vibrate` pattern, native
 * fires the closest expo-haptics primitive (iOS Taptic Engine / Android vibrator),
 * chosen to carry the same intent as the web HAPTICS patterns in `useGameSfx.ts`:
 *   - a light tick for plain moves / selection,
 *   - a firmer impact for captures/jumps (the "thunk" of taking a piece),
 *   - a heavy impact + success/error/warning notifications for salient events.
 */
type HapticFn = () => Promise<void>;

const impact = (style: Haptics.ImpactFeedbackStyle): HapticFn => () =>
  Haptics.impactAsync(style);
const notify = (type: Haptics.NotificationFeedbackType): HapticFn => () =>
  Haptics.notificationAsync(type);
const selection: HapticFn = () => Haptics.selectionAsync();

const HAPTICS: Partial<Record<SfxEvent, HapticFn>> = {
  move: impact(Haptics.ImpactFeedbackStyle.Light),
  select: selection,
  capture: impact(Haptics.ImpactFeedbackStyle.Medium),
  jump: impact(Haptics.ImpactFeedbackStyle.Medium),
  flip: impact(Haptics.ImpactFeedbackStyle.Light),
  castle: impact(Haptics.ImpactFeedbackStyle.Medium),
  promote: impact(Haptics.ImpactFeedbackStyle.Heavy),
  check: notify(Haptics.NotificationFeedbackType.Warning),
  illegal: notify(Haptics.NotificationFeedbackType.Error),
  lowTime: impact(Haptics.ImpactFeedbackStyle.Light),
  win: notify(Haptics.NotificationFeedbackType.Success),
  loss: impact(Haptics.ImpactFeedbackStyle.Heavy),
  draw: selection,
};

/**
 * Game feedback hook — native counterpart of web's `useGameSfx`. Fires a haptic
 * for an event, gated by the user's Settings (`haptics`, default OFF). Same
 * `{ play }` contract the shared board/result components call, so board code is
 * identical to web at the call site.
 *
 * Sound: the web synth (`synth.ts`) has no audio files — its recipes must be
 * pre-rendered to samples and shipped as assets before native playback can work
 * (see the mobile plan's "Audio parity" risk). Until those assets land, `sound`
 * gating is honored but playback is a no-op; haptics carry the feedback. Sound
 * defaults OFF, so nothing is missing for the default experience.
 */
export function useGameSfx() {
  const { settings } = useSettings();
  const { sound, haptics } = settings;

  const play = useCallback(
    (event: SfxEvent) => {
      // Sound: reserved for pre-rendered samples (see doc comment). No-op today.
      void sound;

      if (haptics) {
        const fn = HAPTICS[event];
        // Fire-and-forget; a device without a vibrator simply rejects, which we
        // swallow so game logic never awaits or throws on feedback.
        if (fn) void fn().catch(() => {});
      }
    },
    [sound, haptics],
  );

  return { play };
}
