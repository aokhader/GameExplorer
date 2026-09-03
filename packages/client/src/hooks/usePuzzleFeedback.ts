import { useEffect, useRef } from 'react';
import type { PuzzlePhase } from '@finesse/shared';

export interface UsePuzzleFeedbackOptions {
  phase: PuzzlePhase | null;
  attempts: number;
  puzzleId: string | null;
  /** A wrong move was just made. Fires once per attempt. */
  onWrong: () => void;
  /** The puzzle was just solved. Fires once per puzzle. */
  onSolved: () => void;
}

/**
 * When a puzzle should give its verdict back — right or wrong.
 *
 * The boards already announce the *moves*; this is the puzzle's own answer,
 * which is a different thing: whether the move was the one the position wanted.
 * What that answer sounds and looks like is per-platform (web plays a synth cue
 * and fires canvas-confetti; native plays a sample and runs a Reanimated
 * burst), so the callbacks belong to the caller — but *when* to fire, and the
 * two guards that stop it double-firing, are identical and live here.
 *
 * Solving does NOT advance on its own (owner's call, 2026-08-06). The board
 * stays on the solved position with its explanation until Next is pressed.
 */
export function usePuzzleFeedback({
  phase,
  attempts,
  puzzleId,
  onWrong,
  onSolved,
}: UsePuzzleFeedbackOptions): void {
  // Read the callbacks through refs so an inline arrow at the call site — the
  // natural way to write one — cannot re-run the effects and re-fire the cue.
  const onWrongRef = useRef(onWrong);
  onWrongRef.current = onWrong;
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;

  // Keyed on `attempts`, not on the phase: the phase stays 'wrong' while the
  // refutation search runs and then lands, so a phase-keyed effect would fire
  // the cue twice for one mistake.
  const seenAttempts = useRef(attempts);
  useEffect(() => {
    if (attempts > seenAttempts.current) onWrongRef.current();
    seenAttempts.current = attempts;
  }, [attempts]);

  // Once per puzzle, not once per render: 'solved' persists until Next is
  // pressed, so anything that re-renders the screen in between would otherwise
  // celebrate again.
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (phase !== 'solved' || !puzzleId) return;
    if (celebrated.current === puzzleId) return;
    celebrated.current = puzzleId;
    onSolvedRef.current();
  }, [phase, puzzleId]);
}
