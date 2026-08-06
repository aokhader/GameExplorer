import { useEffect, useRef } from 'react';
import type { PuzzlePhase } from '@gameexplorer/shared';
import { useGameSfx } from '@/audio/useGameSfx.native';

/**
 * The verdict a puzzle gives back: right or wrong.
 *
 * The web twin of this fires sound and confetti. Here it is **haptics only**,
 * and deliberately so: `useGameSfx.native` honours the sound setting but its
 * playback is a documented no-op, because the web synth has no audio files and
 * the recipes have to be pre-rendered to samples before native can play them.
 * Confetti likewise has no RN drop-in yet. Both are real gaps, not oversights —
 * the haptic is the whole cue on this platform today.
 *
 * Solving does NOT advance on its own (owner's call, 2026-08-06). The board
 * stays on the solved position with its explanation until Next is pressed.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, puzzleId]);
}
