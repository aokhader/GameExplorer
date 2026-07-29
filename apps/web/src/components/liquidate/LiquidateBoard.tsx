'use client';

import React from 'react';
import { LiquidateEngine, type LiquidateGameState } from '@gameexplorer/shared';
import { BoardFrame } from '@/components/board/BoardFrame';
import { LiquidateTileCell } from './LiquidateTile';
import { gridPos, sideLength } from './geometry';
import { LQ } from './theme';

/** Gutter between tiles, in px — also the frame's own padding. */
const GAP_PX = 5;

export interface LiquidateBoardProps {
  state: LiquidateGameState;
  /** Rendered inside the ring — dice and the tile inspector. */
  children?: React.ReactNode;
  /** Called when a tile is clicked, to focus it in the inspector. */
  onSelectTile?: (tileId: number) => void;
  /** Seat this device is following, so its tile can be marked "you are here". */
  youId?: string | null;
  /** Tile currently focused in the inspector. */
  selectedTile?: number | null;
}

/**
 * The property ring.
 *
 * Rendered as an `N × N` CSS grid where only the perimeter is filled and the
 * interior is a single spanned "well". Sizing goes through the shared
 * `BoardFrame` so this board obeys the same never-overflow-either-axis contract
 * as chess/checkers/reversi — with a larger `maxPx`, because a 12-per-side ring
 * needs more room than an 8×8 grid before tile labels stop being legible.
 *
 * The rendered edge length is measured rather than assumed: `BoardFrame` sizes
 * itself with a CSS `min()` of viewport units and caps, so the only way to size
 * tile type against the actual cell is to observe it.
 */
export const LiquidateBoard = React.memo(function LiquidateBoard({
  state,
  children,
  onSelectTile,
  youId,
  selectedTile,
}: LiquidateBoardProps) {
  const board = LiquidateEngine.board(state);
  const n = sideLength(board.length);
  const actingId = LiquidateEngine.actingPlayerId(state);

  const frameRef = React.useRef<HTMLDivElement>(null);
  const [edgePx, setEdgePx] = React.useState(0);

  React.useEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    // Read once up front rather than waiting on the observer's first callback:
    // ResizeObserver delivers on the rendering lifecycle, so a tab that is not
    // producing frames never gets that call and the board would sit on its
    // fallback size indefinitely. A direct read is correct immediately.
    const measure = () => setEdgePx(el.getBoundingClientRect().width);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // Belt and braces for the same reason — a viewport resize always fires this
    // even where observer callbacks are being throttled away.
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // SSR and the very first render have no measurement yet; fall back to the
  // common desktop size so the board never renders with 0px type.
  const cellPx = ((edgePx || 620) - GAP_PX * 2 - GAP_PX * (n - 1)) / n;

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

  const youSeat = youId ? state.players.findIndex((p) => p.id === youId) : -1;
  const youTile = youSeat >= 0 ? state.players[youSeat].tile : -1;

  return (
    // `vhCap` is a backstop, not the working limit: the shell caps this column
    // by the height actually left after its chrome (`--gx-board-cap`), which is
    // a far better number than a flat percentage of the viewport. Left at 78 it
    // was the binding constraint and held the board ~65px below what fits.
    <BoardFrame ref={frameRef} maxPx={760} vhCap={94}>
      {/* Pinned to the frame box rather than `h-full`: a percentage height has
          nothing definite to resolve against in the stacked mobile layout, and
          the grid then fell back to sizing its rows off tile content — which
          stretched the "square" board. Out-of-flow, the frame keeps its 1:1
          ratio and the row tracks stay a true 1fr. */}
      <div
        className="absolute inset-0 grid rounded-2xl"
        style={{
          background: LQ.frame,
          gap: GAP_PX,
          padding: GAP_PX,
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
                cellPx={cellPx}
                occupants={occupants.get(tile.id) ?? []}
                active={tile.id === activeTile}
                youSeat={tile.id === youTile && youSeat >= 0 ? youSeat : undefined}
                selected={tile.id === selectedTile}
                stipend={state.config.stipend}
                onSelect={onSelectTile}
              />
            </div>
          );
        })}

        {/* The well: everything inside the ring. */}
        <div
          className="flex min-h-0 min-w-0 flex-col items-center justify-center overflow-hidden"
          style={{
            gridRow: `2 / ${n}`,
            gridColumn: `2 / ${n}`,
            background: LQ.well,
            padding: 8,
          }}
        >
          {children}
        </div>
      </div>
    </BoardFrame>
  );
});
