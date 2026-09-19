'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ReversiEngine, boardAnimMs } from '@gameexplorer/shared';
import type { LessonMark, ReversiGameState, ReversiColor } from '@gameexplorer/shared';
import { ReversiDisc, REVERSI_BOARD_COLORS } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { BoardMark, markMap } from '@/components/board/BoardMark';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Felt palette, read from the `--gx-reversi-board-*` variables that globals.css
 * declares per theme, with the shared token as the fallback so the board is still
 * correct on its own. (Mobile reads REVERSI_BOARD_COLORS directly — no themes.)
 */
const FELT = {
  cell:           `var(--gx-reversi-board-cell, ${REVERSI_BOARD_COLORS.cell})`,
  cellBorder:     `var(--gx-reversi-board-cell-border, ${REVERSI_BOARD_COLORS.cellBorder})`,
  frame:          `var(--gx-reversi-board-frame, ${REVERSI_BOARD_COLORS.boardBorder})`,
  validMoveBlack: `var(--gx-reversi-board-valid-black, ${REVERSI_BOARD_COLORS.validMoveBlack})`,
  validMoveWhite: `var(--gx-reversi-board-valid-white, ${REVERSI_BOARD_COLORS.validMoveWhite})`,
  lastMoveRing:   `var(--gx-reversi-board-lastmove-ring, ${REVERSI_BOARD_COLORS.lastMoveRing})`,
  hintRing:       REVERSI_BOARD_COLORS.hintRing,
  hintFill:       REVERSI_BOARD_COLORS.hintFill,
} as const;

interface ReversiiBoardProps {
  gameState: ReversiGameState;
  onMove: (position: string) => void;
  playerColor: ReversiColor;
  showCoordinates?: boolean;
  /** Highlight a specific square (e.g. last-placed disc) */
  highlightPos?: string | null;
  /** Show a hint ring on this square */
  hintPos?: string | null;
  /**
   * Coached annotations, drawn per point — see `BoardMark`.
   *
   * `highlightPos` and `hintPos` above are deliberately singular; a lesson
   * about liberties or eye shape has to number several points at once.
   */
  highlightSquares?: LessonMark[];
  /**
   * Board is inert — legal-move dots still show, but a tap does nothing.
   *
   * Real inertness, not a no-op `onMove`: the puzzle screens used to fake this
   * by swallowing the callback, which left the board looking playable.
   */
  interactive?: boolean;
}

function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

// Memoized — see ChessBoard: skips the play screens' 100 ms clock re-renders
// when gameState/onMove are stable.
export const ReversiBoard = React.memo(function ReversiBoard({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  hintPos,
  highlightSquares,
  interactive = true,
}: ReversiiBoardProps) {
  const [justFlipped, setJustFlipped] = useState<Set<string>>(new Set());
  const [justPlaced, setJustPlaced]   = useState<string | null>(null);
  const sfx = useGameSfx();
  const { settings, reducedMotion } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;
  // The placement pop and flip squeeze are motion like any other: off under
  // reduced motion or with piece animation set to none. They used to run
  // regardless of either.
  const animates = boardAnimMs(settings, reducedMotion) > 0;

  // Animate + sound the most recent move
  useEffect(() => {
    const history = gameState.moveHistory;
    if (history.length === 0) return;
    const latest = history[history.length - 1];
    if (!latest.position) return; // pass — nothing to animate

    setJustPlaced(latest.position);
    setJustFlipped(new Set(latest.flipped));
    // A placement always flips at least one disc — the flip is the moment.
    sfx.play(latest.flipped.length > 0 ? 'flip' : 'move');

    const t = setTimeout(() => {
      setJustFlipped(new Set());
      setJustPlaced(null);
    }, 350);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moveHistory.length]);

  // Full move generation is expensive; only recompute when the game state
  // actually changes, not on every parent re-render (clock ticks, hover, etc.).
  const legalMoves = useMemo(() => ReversiEngine.getAllLegalMoves(gameState), [gameState]);
  const isPlayerTurn = gameState.currentTurn === playerColor && !gameState.isGameOver;

  const squares = [];
  const marks = markMap(highlightSquares);

  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let screenCol = 0; screenCol < 8; screenCol++) {
      // Reversi has no board flip — position is always the same
      const boardRow = 7 - screenRow;
      const boardCol = screenCol;
      const pos   = posFromCoords(boardRow, boardCol);
      const disc  = gameState.board[boardRow][boardCol];
      const isLegal      = isPlayerTurn && legalMoves.includes(pos);
      const isJustPlaced = justPlaced === pos;
      const isFlipped    = justFlipped.has(pos);
      const isHighlighted = highlightPos === pos;

      const showRank = coordsOn && screenCol === 0;
      const showFile = coordsOn && screenRow === 7;

      squares.push(
        <div
          key={pos}
          data-pos={pos}
          data-legal={isLegal || undefined}
          data-disc={disc?.color}
          style={{
            backgroundColor: FELT.cell,
            border: `1px solid ${FELT.cellBorder}`,
            aspectRatio: '1 / 1',
          }}
          className={`relative flex items-center justify-center ${isLegal ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => interactive && isLegal && onMove(pos)}
        >
          {/* Coordinate labels */}
          {showRank && (
            <span className="absolute top-0.5 left-1 text-2xs font-semibold leading-none select-none pointer-events-none z-10 text-white/70">
              {boardRow + 1}
            </span>
          )}
          {showFile && (
            <span className="absolute bottom-0.5 right-1 text-2xs font-semibold leading-none select-none pointer-events-none z-10 text-white/70">
              {String.fromCharCode(97 + boardCol)}
            </span>
          )}

          {marks.has(pos) && <BoardMark mark={marks.get(pos)!} round />}

          {/* Last-move ring on the most recently placed disc — the board's
              one last-move hue, from the token rather than a colour of web's
              own. */}
          {isHighlighted && disc && (
            <div
              className="absolute inset-[4%] rounded-full border-2 pointer-events-none z-20"
              style={{ borderColor: FELT.lastMoveRing }}
            />
          )}

          {/* Training hint — the square the engine would play, outlined and
              filled in amber like every board's hint, and still: the player
              asked for it, so it does not need to call attention to itself. */}
          {hintPos === pos && !disc && (
            <div
              className="absolute inset-0 border-[3px] pointer-events-none z-20"
              style={{ borderColor: FELT.hintRing, backgroundColor: FELT.hintFill }}
            />
          )}

          {/* Valid move indicator (ghost dot) */}
          {isLegal && !disc && settings.showDestinations && (
            <div
              className="absolute w-[22%] h-[22%] rounded-full pointer-events-none z-10"
              style={{
                backgroundColor: gameState.currentTurn === 'black'
                  ? FELT.validMoveBlack
                  : FELT.validMoveWhite,
              }}
            />
          )}

          {/* Disc */}
          {disc && (
            <div
              className={`absolute inset-[6%] flex items-center justify-center
                ${animates ? 'transition-transform duration-300 ease-out' : ''}
                ${animates && isJustPlaced ? 'scale-110' : animates && isFlipped ? 'scale-90' : 'scale-100'}`}
            >
              <ReversiDisc color={disc.color} size="100%" />
            </div>
          )}
        </div>,
      );
    }
  }

  return (
    <BoardFrame className="select-none">
      <div
        className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden shadow-lg"
        // No turn glow: the player cards say whose move it is.
        style={{ border: `2px solid ${FELT.frame}` }}
      >
        {squares}
      </div>
    </BoardFrame>
  );
});
