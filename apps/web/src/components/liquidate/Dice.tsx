'use client';

import React from 'react';
import { LIQUIDATE_TIMING } from '@gameexplorer/shared';
import { useSettings } from '@/components/providers/SettingsProvider';
import { cn } from '@/lib/utils';
import { LQ } from './theme';

const { diceSettleMs: DICE_SETTLE_MS, diceTumbleMs: DICE_TUMBLE_MS } = LIQUIDATE_TIMING;

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

/** How often the faces change while tumbling. */
const TUMBLE_TICK_MS = 70;

export interface DiceProps {
  dice: [number, number] | null;
  /** Shows the tumbling state while a roll resolves. */
  rolling?: boolean;
  size?: number;
}

/**
 * The two dice.
 *
 * The *values* always come from the engine's seeded RNG. The tumble shows
 * throwaway faces for half a second and then lands on the real result — the
 * randomness on screen is decoration over an outcome that was already decided,
 * so the visual can never disagree with the roll that moved the player.
 */
export function Dice({ dice, rolling = false, size = 44 }: DiceProps) {
  const { reducedMotion } = useSettings();
  const [tumble, setTumble] = React.useState<[number, number] | null>(null);

  // Keyed on the array identity: the engine builds a new state (and a new dice
  // tuple) per roll, so this fires once per roll even when the same faces come
  // up twice in a row, and never on an unrelated re-render.
  React.useEffect(() => {
    if (!dice || reducedMotion) return;
    const face = () => (1 + Math.floor(Math.random() * 6)) as number;
    setTumble([face(), face()]);
    const spin = window.setInterval(() => setTumble([face(), face()]), TUMBLE_TICK_MS);
    const land = window.setTimeout(() => {
      window.clearInterval(spin);
      setTumble(null);
    }, DICE_TUMBLE_MS);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(land);
      setTumble(null);
    };
  }, [dice, reducedMotion]);

  const tumbling = tumble !== null;
  const shown = tumble ?? dice ?? [1, 1];
  const total = dice ? dice[0] + dice[1] : null;

  // Re-key on the roll so the settle animation replays for every new result,
  // including a repeat of the same faces. `motion-safe:` gates it on the user's
  // reduced-motion preference, matching the rest of the app.
  const rollKey = dice ? `${dice[0]}-${dice[1]}-${total}` : 'idle';

  return (
    <div className="flex items-center gap-2.5">
      <div
        // Re-keying remounts the element, which is what replays the settle for
        // every result — including the same faces twice in a row.
        key={tumbling ? 'tumbling' : rollKey}
        className={cn(
          'flex items-center gap-2',
          tumbling && 'lq-dice-tumble',
          rolling && !tumbling && 'motion-safe:animate-pulse',
        )}
        style={
          // Inline rather than a utility class: `animate-dice-settle` was never
          // a real utility (Tailwind v4 generates those from `--animate-*` theme
          // entries, and there is none), so this bounce silently never ran.
          // Driving it from the shared constant also keeps it in step with the
          // delay the token layer waits out.
          !tumbling && !rolling && dice && !reducedMotion
            ? { animation: `dice-settle ${DICE_SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1) both` }
            : undefined
        }
      >
        <Face value={shown[0]} size={size} />
        <Face value={shown[1]} size={size} />
      </div>
      <div className="font-semibold" style={{ fontSize: 11, color: LQ.dim }} aria-live="polite">
        {tumbling || rolling ? (
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
