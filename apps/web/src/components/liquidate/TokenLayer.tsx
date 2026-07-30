'use client';

import React from 'react';
import type { LiquidatePlayer } from '@gameexplorer/shared';
import { useSettings } from '@/components/providers/SettingsProvider';
import { PlayerToken } from './PlayerToken';
import { gridPos } from './geometry';

import {
  DICE_ROLL_MS,
  JUMP_MS,
  NO_ROLL_START_MS,
  POST_ROLL_BEAT_MS,
  STEP_MS,
  WALK_MAX,
} from './timing';

interface Placed {
  tile: number;
  /** This move was a teleport, so it glides rather than hops. */
  jumped: boolean;
}

export interface TokenLayerProps {
  players: LiquidatePlayer[];
  /** Tiles per side. */
  n: number;
  /** Total tiles on the loop. */
  total: number;
  /** Measured edge of one cell, in px. */
  cellPx: number;
  /** Gutter between tiles, in px — also the grid's own padding. */
  gap: number;
  /** Edge of one token, in px. */
  tokenPx: number;
  /** Seat this device follows, for the halo. */
  youSeat?: number;
  /**
   * The roll that produced this position, or `null` before the first one.
   *
   * Identity is the signal: the engine builds a fresh tuple per roll, so a
   * change means dice are in the air and the piece should wait them out. A move
   * with the SAME tuple came from a card, and has nothing to wait for.
   */
  dice: [number, number] | null;
}

/**
 * Every player's piece, drawn over the ring rather than inside the tiles.
 *
 * Tokens have to live outside the grid cells to move between them: a token
 * parented to a tile can only ever appear and disappear, which is what made a
 * six-square move read as a teleport. Here each piece is absolutely positioned
 * from its tile's grid coordinates, so a move is a change of coordinates and
 * the browser tweens it.
 *
 * The layer keeps its own idea of where each piece IS, which lags the engine
 * while a walk plays out. That split is the whole mechanism — the engine is
 * always at the destination, and this catches up one tile at a time.
 */
export function TokenLayer({
  players,
  n,
  total,
  cellPx,
  gap,
  tokenPx,
  youSeat,
  dice,
}: TokenLayerProps) {
  const { reducedMotion } = useSettings();
  const [placed, setPlaced] = React.useState<Record<string, Placed>>(() =>
    Object.fromEntries(players.map((p) => [p.id, { tile: p.tile, jumped: false }])),
  );
  // True once a walk is under way, so only the FIRST hop waits for the dice.
  const walking = React.useRef(false);
  /** The last roll this layer has already waited out. */
  const settledDice = React.useRef(dice);

  React.useEffect(() => {
    // Seats that appeared since the last render (a new game, a resumed save)
    // start where they are — there is nothing to animate from.
    const unseen = players.filter((p) => placed[p.id] === undefined);
    if (unseen.length > 0) {
      setPlaced((prev) => ({
        ...prev,
        ...Object.fromEntries(unseen.map((p) => [p.id, { tile: p.tile, jumped: false }])),
      }));
      return;
    }

    const lagging = players.filter((p) => placed[p.id].tile !== p.tile);
    if (lagging.length === 0) {
      walking.current = false;
      // A roll that moved nobody (failed doubles in Impound) is consumed here,
      // so the NEXT move does not mistake it for dice still in the air.
      settledDice.current = dice;
      return;
    }

    if (reducedMotion) {
      setPlaced(Object.fromEntries(players.map((p) => [p.id, { tile: p.tile, jumped: true }])));
      return;
    }

    const first = !walking.current;
    const afterRoll = dice !== settledDice.current;
    const lead = afterRoll ? DICE_ROLL_MS + POST_ROLL_BEAT_MS : NO_ROLL_START_MS;
    const timer = window.setTimeout(
      () => {
        walking.current = true;
        settledDice.current = dice;
        setPlaced((prev) => {
          const next = { ...prev };
          for (const p of players) {
            const from = prev[p.id]?.tile ?? p.tile;
            if (from === p.tile) continue;
            const forward = (p.tile - from + total) % total;
            next[p.id] =
              forward > 0 && forward <= WALK_MAX
                ? { tile: (from + 1) % total, jumped: false }
                : { tile: p.tile, jumped: true };
          }
          return next;
        });
      },
      first ? lead : STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [players, placed, total, reducedMotion, dice]);

  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      {players.map((player, seat) => {
        if (player.bankrupt) return null;
        const spot = placed[player.id];
        if (!spot) return null;

        const { row, col } = gridPos(spot.tile, n);
        const moving = spot.tile !== player.tile;

        // Bottom-right of the tile, fanned by SEAT rather than by how many
        // pieces happen to share the square — a fixed slot per player means
        // nobody's piece shuffles sideways when someone else arrives or leaves.
        const slotX = (seat % 3) * (tokenPx * 0.5);
        const slotY = Math.floor(seat / 3) * (tokenPx * 0.42);
        const x = gap + (col - 1) * (cellPx + gap) + cellPx - tokenPx - 3 - slotX;
        const y = gap + (row - 1) * (cellPx + gap) + cellPx - tokenPx * 1.25 - 3 - slotY;

        return (
          <div
            key={player.id}
            className="absolute left-0 top-0"
            style={{
              transform: `translate3d(${x}px, ${y}px, 0)`,
              transition: reducedMotion
                ? 'none'
                : `transform ${spot.jumped ? JUMP_MS : STEP_MS}ms ${
                    spot.jumped ? 'cubic-bezier(0.4, 0, 0.2, 1)' : 'linear'
                  }`,
            }}
          >
            <div
              className={moving && !reducedMotion ? 'lq-hop' : undefined}
              style={{ '--lq-step': `${STEP_MS}ms` } as React.CSSProperties}
            >
              <PlayerToken seat={seat} width={tokenPx} you={seat === youSeat} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
