import { useCallback } from 'react';
import type { PuzzlePhase } from '@gameexplorer/shared';
import { usePuzzleFeedback as usePuzzleFeedbackCore } from '@gameexplorer/client/hooks/usePuzzleFeedback';
import { useGameSfx } from '@/audio/useGameSfx.native';

/**
 * Native's puzzle verdict: the same two cues web plays, through the native SFX
 * player and its haptics.
 *
 * The *timing* — once per attempt, once per puzzle — lives in
 * `@gameexplorer/client`, shared with web, because both of the bugs this hook
 * has had were about when it fired rather than what it played.
 *
 * This used to be haptics-only, with a comment explaining that native had no
 * audio files and no confetti. Both of those shipped in parity Phase 1 (rendered
 * WAVs behind `useGameSfx.native`, and a Reanimated `Confetti`), so the comment
 * outlived the gap it described and quietly kept a solved puzzle silent. The
 * burst itself is rendered by the screen from `phase`, matching how the
 * game-result screen drives it.
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

  usePuzzleFeedbackCore({
    phase,
    attempts,
    puzzleId,
    onWrong: useCallback(() => sfx.play('illegal'), [sfx]),
    onSolved: useCallback(() => sfx.play('win'), [sfx]),
  });
}
