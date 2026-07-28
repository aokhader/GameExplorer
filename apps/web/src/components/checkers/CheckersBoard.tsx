'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CheckersEngine } from '@gameexplorer/shared';
import type { CheckersGameState } from '@gameexplorer/shared';
import { CheckersPiece, CHECKERS_BOARD_COLORS } from '@gameexplorer/ui';
import { BoardFrame } from '@/components/board/BoardFrame';
import { useGameSfx } from '@/hooks/useGameSfx';
import { useSettings } from '@/components/providers/SettingsProvider';

/**
 * Square palette, read from the `--gx-checkers-board-*` variables that globals.css
 * declares per theme, with the shared token as the fallback so the board is still
 * correct on its own. (Mobile reads CHECKERS_BOARD_COLORS directly — it has no
 * themes.) These are inline styles rather than classes because the square color
 * is picked per-square from game state.
 */
const SQUARE: Record<
  'light' | 'dark' | 'frame' | 'selected' | 'lastMoveLight' | 'lastMoveDark' | 'move' | 'capture',
  string
> = {
  light:        `var(--gx-checkers-board-light, ${CHECKERS_BOARD_COLORS.lightSquare})`,
  dark:         `var(--gx-checkers-board-dark, ${CHECKERS_BOARD_COLORS.darkSquare})`,
  frame:        `var(--gx-checkers-board-frame, var(--c-border-strong))`,
  selected:     `var(--gx-checkers-board-selected, ${CHECKERS_BOARD_COLORS.selectedSquare})`,
  lastMoveLight: `var(--gx-checkers-board-lastmove-light, ${CHECKERS_BOARD_COLORS.lastMoveLight})`,
  lastMoveDark:  `var(--gx-checkers-board-lastmove-dark, ${CHECKERS_BOARD_COLORS.lastMoveDark})`,
  move:         `var(--gx-checkers-board-move, ${CHECKERS_BOARD_COLORS.moveIndicator})`,
  capture:      `var(--gx-checkers-board-capture, ${CHECKERS_BOARD_COLORS.captureIndicator})`,
};

export interface BoardArrow {
  from: string;
  to: string;
  color?: string;
}

interface CheckersBoardProps {
  gameState: CheckersGameState;
  onMove: (from: string, to: string) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  arrows?: BoardArrow[];
}

function isDark(row: number, col: number): boolean {
  return (row + col) % 2 === 1;
}

function posFromCoords(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (row + 1);
}

function rowOf(pos: string): number { return parseInt(pos[1]) - 1; }
function colOf(pos: string): number { return pos.charCodeAt(0) - 97; }

function posToSvgCenter(pos: string, isFlipped: boolean): { x: number; y: number } {
  const col = colOf(pos);
  const row = rowOf(pos);
  const screenCol = isFlipped ? 7 - col : col;
  const screenRow = isFlipped ? row : 7 - row;
  return { x: screenCol * 100 + 50, y: screenRow * 100 + 50 };
}

function ArrowOverlay({ arrows, isFlipped }: { arrows: BoardArrow[]; isFlipped: boolean }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none z-20"
      viewBox="0 0 800 800"
      xmlns="http://www.w3.org/2000/svg"
    >
      {arrows.map((arrow, i) => {
        const from = posToSvgCenter(arrow.from, isFlipped);
        const to   = posToSvgCenter(arrow.to,   isFlipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;
        const nx = dx / len, ny = dy / len;
        const px = -ny,     py = nx;
        const headSize = 26, bodyWidth = 13;
        const startX = from.x + nx * 28, startY = from.y + ny * 28;
        const endX   = to.x - nx * headSize, endY = to.y - ny * headSize;
        const x1 = startX + px * bodyWidth / 2, y1 = startY + py * bodyWidth / 2;
        const x2 = startX - px * bodyWidth / 2, y2 = startY - py * bodyWidth / 2;
        const x3 = endX   - px * bodyWidth / 2, y3 = endY   - py * bodyWidth / 2;
        const x4 = endX   + px * bodyWidth / 2, y4 = endY   + py * bodyWidth / 2;
        const hx1 = to.x, hy1 = to.y;
        const hx2 = endX + px * headSize * 0.9, hy2 = endY + py * headSize * 0.9;
        const hx3 = endX - px * headSize * 0.9, hy3 = endY - py * headSize * 0.9;
        const color = arrow.color ?? 'rgba(255,170,0,0.82)';
        const points = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${hx1},${hy1} ${hx2},${hy2} ${x4},${y4}`;
        return <polygon key={i} points={points} fill={color} />;
      })}
    </svg>
  );
}

// Memoized — see ChessBoard: skips the play screens' 100 ms clock re-renders
// when gameState/onMove are stable.
export const CheckersBoard = React.memo(function CheckersBoard({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  arrows,
}: CheckersBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [validMoves, setValidMoves]         = useState<string[]>([]);
  const [lastMove, setLastMove]             = useState<{ from: string; to: string } | null>(null);
  const [lastMoveTo, setLastMoveTo]         = useState<string | null>(null);
  const [draggedFrom, setDraggedFrom]       = useState<string | null>(null);
  const sfx = useGameSfx();
  const { settings } = useSettings();
  const coordsOn = showCoordinates && settings.showCoordinates;

  const isFlipped = playerColor === 'black';

  useEffect(() => {
    if (gameState.moveHistory.length > 0) {
      const latest = gameState.moveHistory[gameState.moveHistory.length - 1];
      setLastMove({ from: latest.from, to: latest.to });
      setLastMoveTo(latest.to);
      // A 2-rank jump is a capture; a single diagonal step is a plain move.
      const isJump = Math.abs(rowOf(latest.to) - rowOf(latest.from)) >= 2;
      sfx.play(isJump ? 'jump' : 'move');
      const t = setTimeout(() => setLastMoveTo(null), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.moveHistory.length]);

  // Reset selection whenever the game state changes (e.g. after bot moves)
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
  }, [gameState.currentTurn]);

  // Full move generation is expensive; only recompute when the game state
  // actually changes, not on every parent re-render (clock ticks, hover, etc.).
  const legalMoves = useMemo(() => CheckersEngine.getAllLegalMoves(gameState), [gameState]);
  // Whose-turn signifier — the board lifts with an ember glow on the player's move.
  const isMyTurn = !gameState.isGameOver && gameState.currentTurn === playerColor;

  const selectSquare = (pos: string) => {
    setSelectedSquare(pos);
    const dests = legalMoves.filter(m => m.from === pos).map(m => m.to);
    setValidMoves(dests);
  };

  const handleSquareClick = (pos: string, row: number, col: number) => {
    if (!isDark(row, col) || gameState.isGameOver) return;

    const piece = gameState.board[row][col];

    if (selectedSquare) {
      if (validMoves.includes(pos)) {
        onMove(selectedSquare, pos);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && piece.color === gameState.currentTurn) {
        selectSquare(pos);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (piece && piece.color === gameState.currentTurn) {
        selectSquare(pos);
      }
    }
  };

  const handleDragStart = (pos: string, row: number, col: number) => (e: React.DragEvent) => {
    const piece = gameState.board[row][col];
    if (!piece || piece.color !== gameState.currentTurn) { e.preventDefault(); return; }
    setDraggedFrom(pos);
    selectSquare(pos);
    // Use getBoundingClientRect so the ghost matches the rendered pixel size.
    // Without explicit width/height the Tailwind inset-[6%] classes expand the
    // clone to ~88 % of the viewport, causing the giant flashing ghost.
    const el = e.currentTarget as HTMLElement;
    const { width, height } = el.getBoundingClientRect();
    const img = el.cloneNode(true) as HTMLElement;
    img.style.cssText =
      `position:fixed;top:-${Math.ceil(height) + 10}px;left:0;` +
      `width:${width}px;height:${height}px`;
    document.body.appendChild(img);
    e.dataTransfer.setDragImage(img, width / 2, height / 2);
    setTimeout(() => document.body.removeChild(img), 0);
  };

  const handleDrop = (pos: string) => (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedFrom && validMoves.includes(pos)) {
      onMove(draggedFrom, pos);
    }
    setDraggedFrom(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  const squares = [];

  for (let screenRow = 0; screenRow < 8; screenRow++) {
    for (let screenCol = 0; screenCol < 8; screenCol++) {
      const boardRow = isFlipped ? screenRow : 7 - screenRow;
      const boardCol = isFlipped ? 7 - screenCol : screenCol;
      const pos   = posFromCoords(boardRow, boardCol);
      const piece = gameState.board[boardRow][boardCol];
      const dark  = isDark(boardRow, boardCol);

      const isSelected      = selectedSquare === pos;
      const isValidDest     = validMoves.includes(pos);
      const isLastMoveSquare = lastMove && (lastMove.from === pos || lastMove.to === pos);
      const justArrived     = lastMoveTo === pos;
      const isDragging      = draggedFrom === pos;

      let bg = dark ? SQUARE.dark : SQUARE.light;
      if (isSelected) bg = SQUARE.selected;
      else if (isLastMoveSquare && dark)  bg = SQUARE.lastMoveDark;
      else if (isLastMoveSquare && !dark) bg = SQUARE.lastMoveLight;

      // For coord labels: rank on leftmost screen column, file on bottommost screen row
      const showRank = coordsOn && screenCol === 0;
      const showFile = coordsOn && screenRow === 7;
      const labelColor = dark ? SQUARE.light : SQUARE.dark;

      squares.push(
        <div
          key={pos}
          style={{ backgroundColor: bg, aspectRatio: '1 / 1' }}
          className={`relative flex items-center justify-center ${dark ? 'cursor-pointer' : 'cursor-default'}`}
          onClick={() => handleSquareClick(pos, boardRow, boardCol)}
          onDragOver={dark ? (e) => e.preventDefault() : undefined}
          onDrop={dark ? handleDrop(pos) : undefined}
        >
          {/* Rank label */}
          {showRank && (
            <span
              className="absolute top-0.5 left-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {boardRow + 1}
            </span>
          )}

          {/* File label */}
          {showFile && (
            <span
              className="absolute bottom-0.5 right-1 text-[10px] font-semibold leading-none select-none pointer-events-none z-10"
              style={{ color: labelColor, opacity: 0.75 }}
            >
              {String.fromCharCode(97 + boardCol)}
            </span>
          )}

          {/* Move indicator dot (empty dark square) */}
          {dark && isValidDest && !piece && (
            <div className="absolute w-[28%] h-[28%] rounded-full pointer-events-none z-10"
              style={{ backgroundColor: SQUARE.move }} />
          )}

          {/* Capture ring (valid dest that has an enemy piece) — shouldn't normally show
              since in checkers you land on empty squares, but guard anyway */}
          {dark && isValidDest && piece && (
            <div className="absolute inset-1 rounded-full border-4 pointer-events-none z-10"
              style={{ borderColor: SQUARE.capture }} />
          )}

          {/* Piece — always rendered so onDragEnd fires on the still-in-DOM
              element regardless of drop outcome. opacity-40 gives the
              "lifted" look without blocking pointer events (which would
              break the drag gesture). */}
          {piece && (
            <div
              className={`absolute inset-[6%] flex items-center justify-center
                transition-transform duration-200 ease-out
                ${justArrived ? 'scale-110' : 'scale-100'}
                ${isDragging ? 'opacity-40' : ''}`}
              draggable={dark && piece.color === gameState.currentTurn}
              onDragStart={handleDragStart(pos, boardRow, boardCol)}
              onDragEnd={() => setDraggedFrom(null)}
            >
              <CheckersPiece type={piece.type} color={piece.color} size="100%" />
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
          border: `2px solid ${SQUARE.frame}`,
          boxShadow: isMyTurn
            ? 'var(--gx-checkers-board-turn-glow, 0 12px 28px -6px rgba(0,0,0,0.5), 0 0 0 2px rgba(236,72,153,0.6), 0 0 30px -2px rgba(236,72,153,0.5))'
            : undefined,
        }}
      >
        {squares}
        {arrows && arrows.length > 0 && (
          <ArrowOverlay arrows={arrows} isFlipped={isFlipped} />
        )}
      </div>
    </BoardFrame>
  );
});
