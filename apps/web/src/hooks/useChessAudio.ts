'use client';

import { useGameSfx } from '@/hooks/useGameSfx';

/**
 * Back-compat shim. Audio now flows through the shared, settings-gated SFX
 * system (`useGameSfx` → `lib/sound/synth`). This keeps the original
 * `{ playCheck, playCheckmate }` API for existing chess call sites while
 * respecting the user's Sound/Haptics preferences.
 *
 * Prefer `useGameSfx()` directly in new code.
 */
export function useChessAudio() {
  const sfx = useGameSfx();
  return {
    playCheck: () => sfx.play('check'),
    playCheckmate: () => sfx.play('win'),
  };
}
