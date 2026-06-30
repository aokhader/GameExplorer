'use client';

import { useCallback } from 'react';
import { useSettings } from '@/components/providers/SettingsProvider';
import { playSfx, type SfxEvent } from '@/lib/sound/synth';

/** Default haptic pattern (ms) per event. Only fires when haptics are enabled. */
const HAPTICS: Partial<Record<SfxEvent, number | number[]>> = {
  move: 8,
  select: 0,
  capture: [12, 20, 18],
  jump: [10, 16, 14],
  flip: 8,
  castle: [10, 10, 10],
  promote: [12, 24, 30],
  check: [24, 40, 24],
  illegal: [30, 30, 30],
  lowTime: 14,
  win: [16, 40, 16, 40, 60],
  loss: [40, 60],
  draw: [20, 20],
};

/**
 * Game feedback hook — fires a sound + matching haptic for an event, gated by
 * the user's Settings (both default OFF). Safe no-op when disabled or
 * unsupported. Returns a stable `play` plus a raw `vibrate` escape hatch.
 *
 * Usage:
 *   const sfx = useGameSfx();
 *   sfx.play('capture');
 */
export function useGameSfx() {
  const { settings } = useSettings();
  const { sound, haptics } = settings;

  const vibrate = useCallback(
    (pattern: number | number[]) => {
      if (!haptics) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* unsupported — ignore */
      }
    },
    [haptics],
  );

  const play = useCallback(
    (event: SfxEvent) => {
      if (sound) void playSfx(event);
      if (haptics) {
        const pattern = HAPTICS[event];
        if (pattern != null && pattern !== 0) {
          try {
            navigator.vibrate?.(pattern);
          } catch {
            /* unsupported — ignore */
          }
        }
      }
    },
    [sound, haptics],
  );

  return { play, vibrate };
}

export type { SfxEvent };
