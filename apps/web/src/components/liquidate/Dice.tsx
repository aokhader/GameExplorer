'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { LQ } from './theme';

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
      className="grid grid-cols-3 grid-rows-3"
      style={{
        width: size,
        height: size,
        padding: size * 0.18,
        borderRadius: size * 0.24,
        background: LQ.panel,
        border: `1px solid ${LQ.line}`,
        boxShadow: LQ.diceShadow,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="flex items-center justify-center">
          {PIPS[value]?.includes(i) && (
            <span
              className="block rounded-full"
              style={{ width: '62%', height: '62%', background: LQ.ink }}
            />
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
export function Dice({ dice, rolling = false, size = 44 }: DiceProps) {
  const shown = dice ?? [1, 1];
  const total = dice ? dice[0] + dice[1] : null;

  // Re-key on the roll so the settle animation replays for every new result,
  // including a repeat of the same faces. `motion-safe:` gates it on the user's
  // reduced-motion preference, matching the rest of the app.
  const rollKey = dice ? `${dice[0]}-${dice[1]}-${total}` : 'idle';

  return (
    <div className="flex items-center gap-2.5">
      <div
        key={rollKey}
        className={cn(
          'flex items-center gap-2',
          rolling ? 'motion-safe:animate-pulse' : 'motion-safe:animate-dice-settle',
        )}
      >
        <Face value={shown[0]} size={size} />
        <Face value={shown[1]} size={size} />
      </div>
      <div className="font-semibold" style={{ fontSize: 11, color: LQ.dim }} aria-live="polite">
        {rolling ? (
          'Rolling…'
        ) : total !== null ? (
          <>
            rolled
            <br />
            <span
              className="tabular-nums"
              style={{
                fontFamily: LQ.dispFont,
                fontWeight: LQ.dispWeight as unknown as number,
                fontSize: 20,
                color: LQ.ink,
              }}
            >
              {total}
            </span>
          </>
        ) : (
          'Ready to roll'
        )}
      </div>
    </div>
  );
}
