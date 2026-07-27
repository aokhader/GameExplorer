'use client';

import React from 'react';
import { LIQUIDATE_BOARD_COLORS } from '@gameexplorer/ui';
import { cn } from '@/lib/utils';

/** Pip layout per face, on a 3×3 grid (indices 0–8). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ value, size }: { value: number; size: number }) {
  return (
    <span
      className="grid grid-cols-3 grid-rows-3 rounded-lg border p-[12%]"
      style={{
        width: size,
        height: size,
        background: LIQUIDATE_BOARD_COLORS.corner,
        borderColor: LIQUIDATE_BOARD_COLORS.border,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[value]?.includes(i) && (
            <span className="block rounded-full bg-fg" style={{ width: '58%', height: '58%' }} />
          )}
        </span>
      ))}
    </span>
  );
}

export interface DiceProps {
  dice: [number, number] | null;
  /** Shows the tumbling state while a roll resolves. */
  rolling?: boolean;
  size?: number;
}

/**
 * The two dice. The *values* always come from the engine's seeded RNG — this
 * component only animates the reveal, so the visual can never disagree with the
 * roll that actually moved the player.
 */
export function Dice({ dice, rolling = false, size = 34 }: DiceProps) {
  const shown = dice ?? [1, 1];
  const total = dice ? dice[0] + dice[1] : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('flex items-center gap-2', rolling && 'motion-safe:animate-pulse')}>
        <Face value={shown[0]} size={size} />
        <Face value={shown[1]} size={size} />
      </div>
      <span className="text-xs text-fg-muted tabular-nums" aria-live="polite">
        {rolling ? 'Rolling…' : total !== null ? `Rolled ${total}` : 'Ready to roll'}
      </span>
    </div>
  );
}
