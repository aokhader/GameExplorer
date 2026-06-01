'use client';

import React, { useState, useEffect } from 'react';
import { ReversiEngine } from '@gameexplorer/shared';
import type { ReversiGameState, ReversiColor } from '@gameexplorer/shared';
import { ReversiDisc } from '@gameexplorer/ui';

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
function rowOf(pos: string): number { return parseInt(pos[1]) - 1; }
function colOf(pos: string): number { return pos.charCodeAt(0) - 97; }

export function ReversiBoard({
  gameState,
  onMove,
  playerColor,
  showCoordinates = true,
  highlightPos,
  hintPos,
}: ReversiiBoardProps) {
  const [justFlipped, setJustFlipped] = useState<Set<string>>(new Set());
  const [justPlaced, setJustPlaced]   = useState<string | null>(null);

  // Animate the most recent move
  useEffect(() => {
    const history = gameState.moveHistory;
    if (history.length === 0) return;
    const latest = history[history.length - 1];
    if (!latest.position) return; // pass — nothing to animate

    setJustPlaced(latest.position);
    setJustFlipped(new Set(latest.flipped));

    const t = setTimeout(() => {
      setJustFlipped(new Set());
      setJustPlaced(null);
    }, 350);
    return () => clearTimeout(t);
  }, [gameState.moveHistory.length]);

  const legalMoves = ReversiEngine.getAllLegalMoves(gameState);
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

      const showRank = showCoordinates && screenCol === 0;
      const showFile = showCoordinates && screenRow === 7;

      squares.push(
        <div
          key={pos}
          style={{
            backgroundColor: '#3d8b40',
            border: '1px solid rgba(0,0,0,0.18)',
            aspectRatio: '1 / 1',
          }}
          className={`relative flex items-center justify-center ${isLegal ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => isLegal && onMove(pos)}
        >
          {/* Coordinate labels */}
          {showRank && (
            <span className="absolute top-0.5 left-0.5 text-[9px] font-semibold leading-none select-none pointer-events-none z-10 text-white/50">
              {boardRow + 1}
            </span>
          )}
          {showFile && (
            <span className="absolute bottom-0.5 right-0.5 text-[9px] font-semibold leading-none select-none pointer-events-none z-10 text-white/50">
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
                  ? 'rgba(0,0,0,0.35)'
                  : 'rgba(255,255,255,0.35)',
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
    <div className="w-full max-w-[560px] mx-auto select-none">
      <div
        className="relative grid grid-cols-8 rounded-sm overflow-hidden shadow-xl"
        style={{ border: '3px solid #2a6030' }}
      >
        {squares}
      </div>
    </div>
  );
}
