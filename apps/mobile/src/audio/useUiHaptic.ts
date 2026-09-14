import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';

/**
 * Interface haptics — the events `project-docs/design/motion-spec.md` §7 adds
 * beside the game-event map in `useGameSfx`, gated by the same Settings switch,
 * which defaults off.
 *
 * - `impact` — a light impact: the screen's primary CTA, the tab bar's Play button.
 * - `selection` — a toggle flipped, a tab changed.
 * - `warning` — the final confirmation of something irreversible.
 */
export type UiHaptic = 'impact' | 'selection' | 'warning';

const FIRE: Record<UiHaptic, () => Promise<void>> = {
  impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  selection: () => Haptics.selectionAsync(),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
};

/** Returns a function that fires an interface haptic, or does nothing when haptics are off. */
export function useUiHaptic(): (kind: UiHaptic) => void {
  const { haptics } = useFeedbackPrefs();

  return useCallback(
    (kind: UiHaptic) => {
      // Fire-and-forget, like the game events: a device without a vibrator rejects.
      if (haptics) void FIRE[kind]().catch(() => {});
    },
    [haptics],
  );
}
