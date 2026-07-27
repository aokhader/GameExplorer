'use client';

import React from 'react';
import { LIQUIDATE_BOARD_COLORS } from '@gameexplorer/ui';
import { LiquidateEngine, type LiquidateGameState } from '@gameexplorer/shared';
import { BoardFrame } from '@/components/board/BoardFrame';
import { LiquidateTileCell } from './LiquidateTile';
import { gridPos, sideLength } from './geometry';

export interface LiquidateBoardProps {
  state: LiquidateGameState;
  /** Rendered inside the ring — dice, current prompt, action log. */
  children?: React.ReactNode;
  /** Called when a tile is clicked, to open its property card. */
  onSelectTile?: (tileId: number) => void;
}

/**
 * The property ring.
 *
 * Rendered as an `N × N` CSS grid where only the perimeter is filled and the
 * interior is a single spanned "well" holding the dice and log. Sizing goes
 * through the shared `BoardFrame` so this board obeys the same
 * never-overflow-either-axis contract as chess/checkers/reversi — with a larger
 * `maxPx`, because a 12-per-side ring needs more room than an 8×8 grid before
 * tile labels stop being legible.
 */
export const LiquidateBoard = React.memo(function LiquidateBoard({
  state,
  children,
  onSelectTile,
}: LiquidateBoardProps) {
  const board = LiquidateEngine.board(state);
  const n = sideLength(board.length);
  const actingId = LiquidateEngine.actingPlayerId(state);

  // Seat indices standing on each tile, so tokens can be drawn per square.
  const occupants = React.useMemo(() => {
    const map = new Map<number, number[]>();
    state.players.forEach((player, seat) => {
      if (player.bankrupt) return;
      const list = map.get(player.tile) ?? [];
      list.push(seat);
      map.set(player.tile, list);
    });
    return map;
  }, [state.players]);

  const activeTile = React.useMemo(() => {
    const actor = state.players.find((p) => p.id === actingId);
    return actor?.tile ?? -1;
  }, [state.players, actingId]);

  return (
    <BoardFrame maxPx={680} vhCap={78}>
      <div
        className="grid h-full w-full gap-[2px] rounded-xl p-[2px]"
        style={{
          background: LIQUIDATE_BOARD_COLORS.frame,
          gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
        }}
      >
        {board.map((tile) => {
          const { row, col } = gridPos(tile.id, n);
          return (
            <div key={tile.id} style={{ gridRow: row, gridColumn: col }} className="min-h-0 min-w-0">
              <LiquidateTileCell
                tile={tile}
                owned={state.tiles[tile.id]}
                n={n}
                occupants={occupants.get(tile.id) ?? []}
                active={tile.id === activeTile}
                onSelect={onSelectTile}
              />
            </div>
          );
        })}

        {/* The well: everything inside the ring. */}
        <div
          className="flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg p-2"
          style={{
            gridRow: `2 / ${n}`,
            gridColumn: `2 / ${n}`,
            background: LIQUIDATE_BOARD_COLORS.well,
          }}
        >
          {children}
        </div>
      </div>
    </BoardFrame>
  );
});
