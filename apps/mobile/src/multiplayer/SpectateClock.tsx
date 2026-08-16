import { useEffect, useState } from 'react';
import type { ClockSnapshot } from '@gameexplorer/shared';
import { Clock } from './Clock';

export interface SpectateClockProps {
  color: 'white' | 'black';
  clocks: ClockSnapshot | null;
  clockSyncedAt: number;
  /** The game is live — a finished game's clocks are frozen. */
  running: boolean;
  format: (ms: number) => string;
  lowClockMs: number;
}

/**
 * A spectator's clock, counting down locally between server syncs.
 *
 * A player's clocks come from `useGameSession`, which owns one interval for the
 * pair. A spectator has no session hook, so the countdown lives here — and
 * deliberately per badge, the same decision web's spectate page made after a
 * page-level 10Hz timer pushed that route's INP to about 1.5s. One tick
 * re-renders one clock, never the board.
 *
 * Callers re-key this on `clockSyncedAt` so a fresh server sync remounts the
 * badge and re-seeds from the new base, rather than syncing state in an effect.
 */
export function SpectateClock({
  color,
  clocks,
  clockSyncedAt,
  running,
  format,
  lowClockMs,
}: SpectateClockProps) {
  const baseMs = (color === 'white' ? clocks?.white_ms : clocks?.black_ms) ?? 0;
  const active = clocks?.active_color === color;
  const countdown = running && active;
  const [ms, setMs] = useState(baseMs);

  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(() => {
      // `Date.now()` is read only in the callback, never during render.
      setMs(Math.max(0, baseMs - (Date.now() - clockSyncedAt)));
    }, 100);
    return () => clearInterval(id);
  }, [countdown, baseMs, clockSyncedAt]);

  return (
    <Clock
      ms={countdown ? ms : baseMs}
      active={active && running}
      format={format}
      lowClockMs={lowClockMs}
    />
  );
}
