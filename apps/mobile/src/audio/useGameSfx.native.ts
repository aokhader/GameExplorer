import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import type { SfxEvent } from '@gameexplorer/shared';
import { useSettings } from '@/providers/SettingsProvider';
import { playSfx } from './sfxPlayer';

/**
 * Game feedback events. The union now comes from `@gameexplorer/shared` along
 * with the sound recipes themselves, so web and native cannot drift on which
 * events exist.
 */
export type { SfxEvent };

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
 * Game feedback hook — native counterpart of web's `useGameSfx`. Fires a sound
 * and a haptic for an event, each gated by the user's Settings (both default
 * OFF). Same `{ play }` contract the shared board/result components call, so
 * board code is identical to web at the call site.
 *
 * Sound plays pre-rendered WAV assets rather than synthesising live: React
 * Native has no WebAudio, so `scripts/render-sfx.mjs` renders the shared recipes
 * offline and `sfxPlayer` plays the results.
 */
export function useGameSfx() {
  const { settings } = useSettings();
  const { sound, haptics } = settings;

  const play = useCallback(
    (event: SfxEvent) => {
      if (sound) playSfx(event);

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
