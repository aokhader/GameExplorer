'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ReversiEngine } from '@gameexplorer/shared';
import type { ReversiGameState, ReversiColor } from '@gameexplorer/shared';
import { ReversiDisc, REVERSI_BOARD_COLORS } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

interface ReversiiBoardProps {
  gameState: ReversiGameState;
  onMove: (position: string) => void;
  playerColor: ReversiColor;
  showCoordinates?: boolean;
  /** Highlight a specific square (e.g. last-placed disc) */
  highlightPos?: string | null;
  /** Show a hint ring on this square */
  hintPos?: string | null;
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
}: ReversiiBoardProps) {
  const [justFlipped, setJustFlipped] = useState<Set<string>>(new Set());
  const [justPlaced, setJustPlaced]   = useState<string | null>(null);
  const sfx = useGameSfx();
  const { settings } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;

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
            backgroundColor: REVERSI_BOARD_COLORS.cell,
            border: `1px solid ${REVERSI_BOARD_COLORS.cellBorder}`,
            aspectRatio: '1 / 1',
          }}
          className={`relative flex items-center justify-center ${isLegal ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => isLegal && onMove(pos)}
        >
          {/* Coordinate labels */}
          {showRank && (
            <span className="absolute top-0.5 left-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10 text-white/70">
              {boardRow + 1}
            </span>
          )}
          {showFile && (
            <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10 text-white/70">
              {String.fromCharCode(97 + boardCol)}
            </span>
          )}

          {/* Last-move ring on the most recently placed disc */}
          {isHighlighted && disc && (
            <div className="absolute inset-[4%] rounded-full ring-2 ring-yellow-300/80 pointer-events-none z-20" />
          )}

          {/* Hint ring — pulsing cyan circle on suggested empty square */}
          {hintPos === pos && !disc && (
            <div className="absolute inset-[10%] rounded-full ring-2 ring-cyan-400 animate-pulse pointer-events-none z-20" />
          )}

          {/* Valid move indicator (ghost dot) */}
          {isLegal && !disc && (
            <div
              className="absolute w-[28%] h-[28%] rounded-full pointer-events-none z-10"
              style={{
                backgroundColor: gameState.currentTurn === 'black'
                  ? REVERSI_BOARD_COLORS.validMoveBlack
                  : REVERSI_BOARD_COLORS.validMoveWhite,
              }}
            />
          )}

          {/* Disc */}
          {disc && (
            <div
              className={`absolute inset-[6%] flex items-center justify-center
                transition-transform duration-300 ease-out
                ${isJustPlaced ? 'scale-110' : isFlipped ? 'scale-90' : 'scale-100'}`}
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
        className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden shadow-lg transition-shadow duration-300"
        style={{
          border: `2px solid ${REVERSI_BOARD_COLORS.boardBorder}`,
          boxShadow: isPlayerTurn
            ? '0 12px 28px -6px rgba(0,0,0,0.5), 0 0 0 2px rgba(163,230,53,0.6), 0 0 30px -2px rgba(163,230,53,0.5)'
            : undefined,
        }}
      >
        {squares}
      </div>
    </BoardFrame>
  );
});
