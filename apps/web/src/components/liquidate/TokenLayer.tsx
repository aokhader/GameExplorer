'use client';

import React from 'react';
import { LIQUIDATE_TIMING, gridPos, type LiquidatePlayer } from '@gameexplorer/shared';
import { PlayerToken } from '@gameexplorer/ui';
import type { PlacedToken } from '@/hooks/useLiquidateWalk';
import { useSettings } from '@/components/providers/SettingsProvider';
import { LQ, seatColor } from './theme';

const { jumpMs: JUMP_MS, stepMs: STEP_MS } = LIQUIDATE_TIMING;

export interface TokenLayerProps {
  players: LiquidatePlayer[];
  /** Where each piece is shown, from `useLiquidateWalk`. */
  placed: Record<string, PlacedToken>;
  /** Tiles per side. */
  n: number;
  /** Measured edge of one cell, in px. */
  cellPx: number;
  /** Gutter between tiles, in px — also the grid's own padding. */
  gap: number;
  /** Edge of one token, in px. */
  tokenPx: number;
  /** Seat this device follows, for the halo. */
  youSeat?: number;
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
 * Purely presentational — the walk itself is `useLiquidateWalk`, which the game
 * hook also reads so bots and the property card can wait for it.
 */
export function TokenLayer({
  players,
  placed,
  n,
  cellPx,
  gap,
  tokenPx,
  youSeat,
}: TokenLayerProps) {
  const { reducedMotion } = useSettings();

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
              <PlayerToken
                color={seatColor(seat)}
                outline={LQ.tile}
                width={tokenPx}
                you={seat === youSeat}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
