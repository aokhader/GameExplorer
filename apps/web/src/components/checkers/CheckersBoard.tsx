'use client';

import React, { useState, useEffect } from 'react';
import { CheckersEngine } from '@gameexplorer/shared';
import type { CheckersGameState } from '@gameexplorer/shared';
import { CheckersPiece } from '@gameexplorer/ui';

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

export function CheckersBoard({
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

  const isFlipped = playerColor === 'black';

  useEffect(() => {
    if (gameState.moveHistory.length > 0) {
      const latest = gameState.moveHistory[gameState.moveHistory.length - 1];
      setLastMove({ from: latest.from, to: latest.to });
      setLastMoveTo(latest.to);
      const t = setTimeout(() => setLastMoveTo(null), 300);
      return () => clearTimeout(t);
    }
  }, [gameState.moveHistory.length]);

  // Reset selection whenever the game state changes (e.g. after bot moves)
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
  }, [gameState.currentTurn]);

  const legalMoves = CheckersEngine.getAllLegalMoves(gameState);

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
    const img = e.currentTarget.cloneNode(true) as HTMLElement;
    img.style.cssText = 'position:absolute;top:-1000px';
    document.body.appendChild(img);
    e.dataTransfer.setDragImage(img, 30, 30);
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

      let bg = dark ? '#b58863' : '#f0d9b5';
      if (isSelected) bg = '#baca44';
      else if (isLastMoveSquare && dark)  bg = 'rgba(155,199,0,0.51)';
      else if (isLastMoveSquare && !dark) bg = 'rgba(155,199,0,0.41)';

      // For coord labels: rank on leftmost screen column, file on bottommost screen row
      const showRank = showCoordinates && screenCol === 0;
      const showFile = showCoordinates && screenRow === 7;
      const labelColor = dark ? '#f0d9b5' : '#b58863';

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
              style={{ backgroundColor: 'rgba(0,0,0,0.18)' }} />
          )}

          {/* Capture ring (valid dest that has an enemy piece) — shouldn't normally show
              since in checkers you land on empty squares, but guard anyway */}
          {dark && isValidDest && piece && (
            <div className="absolute inset-1 rounded-full border-4 pointer-events-none z-10"
              style={{ borderColor: 'rgba(0,0,0,0.30)' }} />
          )}

          {/* Piece */}
          {piece && !isDragging && (
            <div
              className={`absolute inset-[6%] flex items-center justify-center
                transition-transform duration-200 ease-out
                ${justArrived ? 'scale-110' : 'scale-100'}`}
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
    <div className="w-full max-w-[600px] mx-auto select-none">
      <div
        className="relative grid grid-cols-8 rounded-sm overflow-hidden shadow-lg"
        style={{ border: '2px solid rgba(0,0,0,0.25)' }}
      >
        {squares}
        {arrows && arrows.length > 0 && (
          <ArrowOverlay arrows={arrows} isFlipped={isFlipped} />
        )}
      </div>
    </div>
  );
}
