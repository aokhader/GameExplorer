import React from 'react';

export interface DiscCountBarProps {
  black: number;
  white: number;
}

/**
 * The live disc-count bar above the reversi board (Arcade Glow design):
 * white's count with a glowing light disc on the left, a lime share meter in
 * the middle, black's count with a dark disc on the right.
 */
export function DiscCountBar({ black, white }: DiscCountBarProps) {
  const total = black + white;
  const whiteShare = total > 0 ? (white / total) * 100 : 50;

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[15px] font-bold text-[#eaffc2]">
        <span
          className="h-4 w-4 rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #fff, #c7d2e0 78%)',
            boxShadow: '0 0 8px rgba(190,242,100,0.8)',
          }}
          aria-hidden="true"
        />
        {white}
        <span className="sr-only">white discs</span>
      </span>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-[#0b1220]">
        <div
          className="transition-all duration-300"
          style={{ width: `${whiteShare}%`, background: 'linear-gradient(90deg,#bef264,#84cc16)' }}
        />
        <div className="flex-1 bg-[#2a3550]" />
      </div>
      <span className="flex items-center gap-1.5 text-[15px] font-bold text-fg-muted">
        {black}
        <span className="sr-only">black discs</span>
        <span
          className="h-4 w-4 rounded-full border border-white/10"
          style={{ background: 'radial-gradient(circle at 35% 30%, #3a4354, #0b0e17 78%)' }}
          aria-hidden="true"
        />
      </span>
    </div>
  );
}
