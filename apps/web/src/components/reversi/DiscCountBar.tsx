import React from 'react';
import { ReversiDisc } from '@finesse/ui';

export interface DiscCountBarProps {
  black: number;
  white: number;
}

/**
 * The live disc-count bar above the reversi board: white's count with a glowing
 * light disc on the left, a share meter in the middle, black's count with a dark
 * disc on the right.
 *
 * The discs are the real `ReversiDisc` art rather than hand-rolled gradients, so
 * they match the board and follow the theme — this component used to be entirely
 * Arcade-dark hex and stayed that way on Cozy Tabletop's parchment.
 */
export function DiscCountBar({ black, white }: DiscCountBarProps) {
  const total = black + white;
  const whiteShare = total > 0 ? (white / total) * 100 : 50;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[15px] font-bold text-[var(--c-game-reversi-light)]">
        <span
          className="inline-flex rounded-full"
          style={{ boxShadow: '0 0 8px var(--c-game-reversi-glow)' }}
          aria-hidden="true"
        >
          <ReversiDisc color="white" size={16} />
        </span>
        {white}
        <span className="sr-only">white discs</span>
      </span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[var(--c-surface)]">
        <div
          className="transition-all duration-300"
          style={{ width: `${whiteShare}%`, background: 'linear-gradient(90deg, var(--c-game-reversi-light), var(--c-game-reversi))' }}
        />
        <div className="flex-1 bg-[var(--gx-board-dark,#2a3550)]" />
      </div>
      <span className="flex items-center gap-1.5 text-[15px] font-bold text-fg-muted">
        {black}
        <span className="sr-only">black discs</span>
        <span className="inline-flex" aria-hidden="true">
          <ReversiDisc color="black" size={16} />
        </span>
      </span>
    </div>
  );
}
