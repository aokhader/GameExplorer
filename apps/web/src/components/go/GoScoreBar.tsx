import React from 'react';
import type { GoScore } from '@gameexplorer/shared';
import { GoStone } from '@gameexplorer/ui';

export interface GoScoreBarProps {
  score: GoScore;
  /** Stones each side has captured, for the running tally beside the areas. */
  captured: { black: number; white: number };
}

/**
 * The live area readout above the Go board — reversi's `DiscCountBar` for a
 * game where the numbers mean something different.
 *
 * Disc counts in reversi ARE the score. In Go the area is a running estimate of
 * a score that only settles when the game ends, and it counts territory the
 * player has to be able to see: the bar therefore shows both sides' area with
 * komi already applied to white (so the number shown is the number that decides
 * the game) and names captures separately, because captures are the thing
 * players actually track during play and are not the same as points.
 */
export function GoScoreBar({ score, captured }: GoScoreBarProps) {
  const total = score.black + score.white;
  const blackShare = total > 0 ? (score.black / total) * 100 : 50;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[15px] font-bold text-fg">
        <span className="inline-flex" aria-hidden="true">
          <GoStone color="black" size={16} />
        </span>
        {score.black}
        <span className="sr-only">points for black</span>
        {captured.black > 0 && (
          <span className="text-xs font-medium text-fg-subtle">+{captured.black} taken</span>
        )}
      </span>

      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[var(--gx-go-board-border,#0b1220)]">
        <div
          className="transition-all duration-300"
          style={{ width: `${blackShare}%`, background: 'linear-gradient(90deg, var(--gx-go-stone-black-2,#2b3448), var(--gx-go-stone-black-1,#5c6a85))' }}
        />
        <div className="flex-1 bg-[var(--gx-go-stone-white-2,#e8e2d6)]" />
      </div>

      <span className="flex items-center gap-1.5 text-[15px] font-bold text-fg">
        {captured.white > 0 && (
          <span className="text-xs font-medium text-fg-subtle">+{captured.white} taken</span>
        )}
        {score.white}
        <span className="sr-only">points for white, komi included</span>
        <span
          className="inline-flex rounded-full"
          style={{ boxShadow: '0 0 8px var(--c-game-go-glow)' }}
          aria-hidden="true"
        >
          <GoStone color="white" size={16} />
        </span>
      </span>
    </div>
  );
}
