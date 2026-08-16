'use client';

import { useCallback } from 'react';
import type { PuzzlePhase } from '@gameexplorer/shared';
import { usePuzzleFeedback as usePuzzleFeedbackCore } from '@gameexplorer/client/hooks/usePuzzleFeedback';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Web's puzzle verdict: a sound cue on a wrong move, and a cue plus confetti on
 * a solve.
 *
 * The *timing* — once per attempt, once per puzzle — lives in
 * `@gameexplorer/client`, shared with native, because that is where both of the
 * bugs this hook has had actually were. What stays here is what web's
 * celebration is made of.
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

  const onSolved = useCallback(() => {
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
  }, [sfx, reducedMotion]);

  usePuzzleFeedbackCore({
    phase,
    attempts,
    puzzleId,
    onWrong: useCallback(() => sfx.play('illegal'), [sfx]),
    onSolved,
  });
}
