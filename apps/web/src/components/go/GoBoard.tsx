'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GoEngine } from '@finesse/shared';
import type { GoColor, GoGameState } from '@finesse/shared';
import { GO_BOARD_COLORS, GO_STAR_POINTS_9, GoStone } from '@finesse/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Board palette, read from the `--gx-go-board-*` variables globals.css declares
 * per theme with the shared token as the fallback — the contract CheckersBoard
 * and ReversiBoard use, so a theme can repaint the board from CSS alone.
 */
const WOOD = {
  surface:      `var(--gx-go-board-surface, ${GO_BOARD_COLORS.surface})`,
  surfaceEdge:  `var(--gx-go-board-surface-edge, ${GO_BOARD_COLORS.surfaceEdge})`,
  line:         `var(--gx-go-board-line, ${GO_BOARD_COLORS.line})`,
  lineStrong:   `var(--gx-go-board-line-strong, ${GO_BOARD_COLORS.lineStrong})`,
  hoshi:        `var(--gx-go-board-hoshi, ${GO_BOARD_COLORS.hoshi})`,
  border:       `var(--gx-go-board-border, ${GO_BOARD_COLORS.boardBorder})`,
  coordinate:   `var(--gx-go-board-coordinate, ${GO_BOARD_COLORS.coordinate})`,
  lastMoveRing: `var(--gx-go-board-last-move, ${GO_BOARD_COLORS.lastMoveRing})`,
  ghost:        `var(--gx-go-board-ghost, ${GO_BOARD_COLORS.ghost})`,
  hintRing:     `var(--gx-go-board-hint, ${GO_BOARD_COLORS.hintRing})`,
} as const;

/** Column letters as Go writes them — I is skipped. */
const LETTERS = 'ABCDEFGHJKLMNOPQRST';

/** Stone diameter as a fraction of the distance between two lines. */
const STONE_RATIO = 0.94;

export interface GoBoardProps {
  gameState: GoGameState;
  /** Called with the tapped intersection. */
  onMove: (position: string) => void;
  /** Whose legal points are shown and whose stone the ghost preview wears. */
  playerColor: GoColor;
  showCoordinates?: boolean;
  /** Ring the stone just played. */
  highlightPos?: string | null;
  /** Training hint — outlines the point the engine would play. */
  hintPos?: string | null;
  /**
   * Board is inert. Real inertness, not a swallowed `onMove`: an inert board
   * must not offer a ghost stone or a pointer cursor either.
   */
  interactive?: boolean;
}

function positionAt(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

/**
 * The Go board.
 *
 * Structurally unlike the app's other three: there are no cells to paint, and a
 * stone sits **on a line crossing** rather than inside a square. So the grid is
 * one SVG of ruled lines, and the stones are an absolutely-positioned layer over
 * it — which is also how web's chess and checkers boards ended up after the
 * board-responsiveness pass, for the unrelated reason that a piece parented to a
 * grid cell cannot travel out of it.
 *
 * The geometry is the whole trick: an N-line board is inset by half a cell all
 * round, so line `i` sits at `(i + 0.5) / N` of the edge and the outermost lines
 * have a margin to breathe in — which is exactly where the coordinates go.
 *
 * Stones never move, so there is no `useBoardMotion` here (see ReversiBoard for
 * the same note about discs). Captures are a removal, and they fade.
 */
export const GoBoard = React.memo(function GoBoard({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  hintPos,
  interactive = true,
}: GoBoardProps) {
  const { size } = gameState;
  const [hovered, setHovered] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string[]>([]);
  const sfx = useGameSfx();
  const { settings } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;

  // Sound + the fading ghosts of stones that just came off.
  const historyLength = gameState.moveHistory.length;
  const lastMoveRef = useRef(historyLength);
  useEffect(() => {
    if (historyLength === 0 || historyLength === lastMoveRef.current) {
      lastMoveRef.current = historyLength;
      return;
    }
    lastMoveRef.current = historyLength;

    const latest = gameState.moveHistory[historyLength - 1];
    if (!latest.position) return; // a pass has nothing to draw or play

    sfx.play(latest.captures.length > 0 ? 'capture' : 'move');
    if (latest.captures.length === 0) return;

    setCaptured(latest.captures);
    const timer = setTimeout(() => setCaptured([]), 320);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLength]);

  const isPlayerTurn = gameState.currentTurn === playerColor && !gameState.isGameOver;

  // Legal-move generation walks every empty point and floods each one, so it is
  // by far the most expensive thing here — keep it off every unrelated re-render
  // (a clock tick, a hover) and off the opponent's turn, when nothing shows it.
  const legalMoves = useMemo(
    () => (interactive && isPlayerTurn ? new Set(GoEngine.getAllLegalMoves(gameState)) : new Set<string>()),
    [gameState, interactive, isPlayerTurn],
  );

  const cell = 100 / size;
  const at = (index: number) => (index + 0.5) * cell;

  const stars = size === 9 ? GO_STAR_POINTS_9 : [];

  const lines = [];
  for (let i = 0; i < size; i++) {
    const edge = i === 0 || i === size - 1;
    const p = at(i);
    lines.push(
      <line
        key={`h${i}`}
        x1={at(0)} y1={p} x2={at(size - 1)} y2={p}
        stroke={edge ? WOOD.lineStrong : WOOD.line}
        strokeWidth={edge ? 0.45 : 0.28}
        vectorEffect="non-scaling-stroke"
      />,
      <line
        key={`v${i}`}
        x1={p} y1={at(0)} x2={p} y2={at(size - 1)}
        stroke={edge ? WOOD.lineStrong : WOOD.line}
        strokeWidth={edge ? 0.45 : 0.28}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }

  const points = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      // Row 0 is rank 1, which is drawn at the BOTTOM — so screen y inverts.
      const position = positionAt(row, col);
      const x = at(col);
      const y = at(size - 1 - row);
      const stone = gameState.board[row][col];
      const isLegal = legalMoves.has(position);
      const isGhost = isLegal && hovered === position;

      points.push(
        <div
          key={position}
          data-pos={position}
          data-stone={stone ?? undefined}
          data-legal={isLegal || undefined}
          onClick={() => interactive && isLegal && onMove(position)}
          onMouseEnter={() => setHovered(position)}
          onMouseLeave={() => setHovered(prev => (prev === position ? null : prev))}
          className={`absolute flex items-center justify-center ${isLegal ? 'cursor-pointer' : 'cursor-default'}`}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${cell}%`,
            height: `${cell}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {stone && (
            <div
              className="pointer-events-none flex items-center justify-center"
              style={{ width: `${STONE_RATIO * 100}%`, height: `${STONE_RATIO * 100}%` }}
            >
              <GoStone color={stone} size="100%" />
            </div>
          )}

          {/* A stone that just came off, fading out where it stood. The colour
              is `currentTurn` because the side to move after a capture is
              exactly the side whose stones were taken. */}
          {!stone && captured.includes(position) && (
            <div
              className="pointer-events-none flex items-center justify-center motion-safe:[animation:gx-stone-captured_300ms_ease-out_forwards] motion-reduce:opacity-0"
              style={{ width: `${STONE_RATIO * 100}%`, height: `${STONE_RATIO * 100}%` }}
            >
              <GoStone color={gameState.currentTurn} size="100%" />
            </div>
          )}

          {/* Ghost stone under the cursor — Go's equivalent of a legal-move dot,
              and better than one: where the stone would land is the question. */}
          {!stone && isGhost && (
            <div
              className="pointer-events-none flex items-center justify-center opacity-45"
              style={{ width: `${STONE_RATIO * 100}%`, height: `${STONE_RATIO * 100}%` }}
            >
              <GoStone color={playerColor} size="100%" />
            </div>
          )}

          {/* Last-move ring, drawn on top of the stone. */}
          {stone && highlightPos === position && (
            <div
              className="pointer-events-none absolute rounded-full"
              style={{
                width: '42%',
                height: '42%',
                border: `2px solid ${WOOD.lastMoveRing}`,
              }}
            />
          )}

          {hintPos === position && (
            <div
              className="pointer-events-none absolute animate-pulse rounded-full"
              style={{
                width: `${STONE_RATIO * 100}%`,
                height: `${STONE_RATIO * 100}%`,
                border: `2px solid ${WOOD.hintRing}`,
              }}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <BoardFrame className="select-none">
      <div
        className="relative h-full w-full overflow-hidden rounded-lg shadow-lg"
        style={{
          background: `radial-gradient(circle at 30% 20%, ${WOOD.surface}, ${WOOD.surfaceEdge})`,
          border: `2px solid ${WOOD.border}`,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
        >
          {lines}
          {stars.map(([row, col]) => (
            <circle
              key={`star-${row}-${col}`}
              cx={at(col)}
              cy={at(size - 1 - row)}
              r={0.7}
              fill={WOOD.hoshi}
            />
          ))}
        </svg>

        {coordsOn && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {Array.from({ length: size }, (_, i) => (
              <React.Fragment key={`coord-${i}`}>
                {/* Files along the bottom margin, ranks up the left one. */}
                <span
                  className="absolute -translate-x-1/2 text-[10px] font-semibold leading-none"
                  style={{ left: `${at(i)}%`, bottom: '1%', color: WOOD.coordinate }}
                >
                  {LETTERS[i]}
                </span>
                <span
                  className="absolute -translate-y-1/2 text-[10px] font-semibold leading-none"
                  style={{ top: `${at(size - 1 - i)}%`, left: '1%', color: WOOD.coordinate }}
                >
                  {i + 1}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        {points}
      </div>
    </BoardFrame>
  );
});
