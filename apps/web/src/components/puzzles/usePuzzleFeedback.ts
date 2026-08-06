'use client';

import { useEffect, useRef } from 'react';
import type { PuzzlePhase } from '@gameexplorer/shared';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * The verdict a puzzle gives back: right or wrong.
 *
 * The boards already announce the *moves* — they fire `move` / `capture` on
 * every position change, and have since the game screens shipped. What was
 * missing is the puzzle's own answer, which is a different thing: whether the
 * move was the one the position wanted.
 *
 * Solving does NOT advance on its own (owner's call, 2026-08-06). The board
 * stays on the solved position with its explanation until Next is pressed —
 * which is instant now that the hook no longer tears the screen down for it.
 */
export function usePuzzleFeedback({
  phase,
  attempts,
  puzzleId,
}: {
  phase: PuzzlePhase | null;
  attempts: number;
  puzzleId: string | null;
}): void {
  const sfx = useGameSfx();
  const { reducedMotion } = useSettings();

  // Keyed on `attempts`, not on the phase: the phase stays 'wrong' while the
  // refutation search runs and then lands, so a phase-keyed effect would fire
  // the cue twice for one mistake.
  const seenAttempts = useRef(attempts);
  useEffect(() => {
    if (attempts > seenAttempts.current) sfx.play('illegal');
    seenAttempts.current = attempts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempts]);

  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'solved' || !puzzleId) return;
    if (celebrated.current === puzzleId) return;
    celebrated.current = puzzleId;

    sfx.play('win');
    if (reducedMotion) return;

    // Dynamic so canvas-confetti stays off this route's initial chunk — it is
    // only ever needed after a solve, and the same trick is what keeps it out
    // of the game pages.
    void import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 60,
        spread: 65,
        startVelocity: 40,
        origin: { x: 0.5, y: 0.4 },
        disableForReducedMotion: true,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, puzzleId, reducedMotion]);
}
