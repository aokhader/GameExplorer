'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChessEngine, ChessGameState, Position, Piece, PieceType } from '@gameexplorer/shared';
import { ChessPiece } from '@gameexplorer/ui';

export interface BoardArrow {
  from: Position;
  to: Position;
  color?: string;
}

interface ChessBoardProps {
  gameState: ChessGameState;
  onMove: (from: Position, to: Position, promotionPiece?: PieceType) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  compact?: boolean;
  /** Draw arrows as an SVG overlay (e.g. for best-move highlights) */
  arrows?: BoardArrow[];
  /** When true, clicks call onSquareClick instead of the normal move logic */
  editMode?: boolean;
  onSquareClick?: (position: Position) => void;
  /** Allow selecting and previewing moves for pieces of any color, regardless of whose turn it is */
  allowSelectAnyColor?: boolean;
}

interface PendingPromotion {
  from: Position;
  to: Position;
}

// Promotion picker — shown as an overlay on the board when a pawn reaches the back rank
function PromotionPicker({
  color,
  onSelect,
}: {
  color: 'white' | 'black';
  onSelect: (piece: PieceType) => void;
}) {
  const pieces: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 rounded-lg">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-center mb-3">
          Promote pawn to:
        </p>
        <div className="flex gap-2">
          {pieces.map((type) => (
            <button
              key={type}
              onClick={() => onSelect(type)}
              className="w-14 h-14 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 hover:scale-110 transition-all shadow-sm"
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            >
              <ChessPiece type={type} color={color} size={48} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Compute SVG center coords (0-800 space, one square = 100 units) for a board position */
function posToSvgCenter(pos: Position, isFlipped: boolean): { x: number; y: number } {
  const col = pos.charCodeAt(0) - 'a'.charCodeAt(0);
  const row = parseInt(pos[1]) - 1;
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
        const to = posToSvgCenter(arrow.to, isFlipped);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return null;

        const nx = dx / len;
        const ny = dy / len;
        const px = -ny;
        const py = nx;

        const headSize = 28;
        const bodyWidth = 14;

        // Body: start a bit past source center, end just before arrowhead
        const startX = from.x + nx * 28;
        const startY = from.y + ny * 28;
        const endX = to.x - nx * headSize;
        const endY = to.y - ny * headSize;

        // Body rectangle corners
        const x1 = startX + px * bodyWidth / 2;
        const y1 = startY + py * bodyWidth / 2;
        const x2 = startX - px * bodyWidth / 2;
        const y2 = startY - py * bodyWidth / 2;
        const x3 = endX - px * bodyWidth / 2;
        const y3 = endY - py * bodyWidth / 2;
        const x4 = endX + px * bodyWidth / 2;
        const y4 = endY + py * bodyWidth / 2;

        // Arrowhead triangle
        const hx1 = to.x;
        const hy1 = to.y;
        const hx2 = endX + px * headSize * 0.9;
        const hy2 = endY + py * headSize * 0.9;
        const hx3 = endX - px * headSize * 0.9;
        const hy3 = endY - py * headSize * 0.9;

        const color = arrow.color ?? 'rgba(255, 170, 0, 0.82)';
        const points = `${x1},${y1} ${x2},${y2} ${x3},${y3} ${hx3},${hy3} ${hx1},${hy1} ${hx2},${hy2} ${x4},${y4}`;

        return <polygon key={i} points={points} fill={color} />;
      })}
    </svg>
  );
}

export function ChessBoard({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  compact = false,
  arrows,
  editMode = false,
  onSquareClick,
  allowSelectAnyColor = false,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [draggedPiece, setDraggedPiece] = useState<{ position: Position; piece: Piece } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [lastMoveTo, setLastMoveTo] = useState<Position | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const isFlipped = playerColor === 'black';

  useEffect(() => {
    if (gameState.moveHistory.length > 0) {
      const latestMove = gameState.moveHistory[gameState.moveHistory.length - 1];
      setLastMove({ from: latestMove.from, to: latestMove.to });
      setLastMoveTo(latestMove.to);
      const t = setTimeout(() => setLastMoveTo(null), 300);
      return () => clearTimeout(t);
    }
  }, [gameState.moveHistory.length]);

  // Reset selection when edit mode changes
  useEffect(() => {
    setSelectedSquare(null);
    setValidMoves([]);
  }, [editMode]);

  const handleSquareClick = (position: Position) => {
    if (editMode) {
      onSquareClick?.(position);
      return;
    }

    if (pendingPromotion) return;

    const piece = gameState.board[getRow(position)][getCol(position)];
    const canSelect = allowSelectAnyColor ? !!piece : !!(piece && piece.color === gameState.currentTurn);

    if (selectedSquare) {
      if (validMoves.includes(position)) {
        attemptMove(selectedSquare, position);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (canSelect) {
        selectPiece(position);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (canSelect) {
        selectPiece(position);
      }
    }
  };

  const attemptMove = (from: Position, to: Position) => {
    // In allowSelectAnyColor mode (browse/preview), never execute moves — just deselect
    if (allowSelectAnyColor) {
      setSelectedSquare(null);
      setValidMoves([]);
      return;
    }
    const result = ChessEngine.validateMove(gameState, from, to);
    if (result.needsPromotion) {
      setPendingPromotion({ from, to });
    } else if (result.valid) {
      onMove(from, to);
    }
  };

  const handlePromotionSelect = (piece: PieceType) => {
    if (!pendingPromotion) return;
    onMove(pendingPromotion.from, pendingPromotion.to, piece);
    setPendingPromotion(null);
  };

  const selectPiece = (position: Position) => {
    setSelectedSquare(position);
    const piece = gameState.board[getRow(position)][getCol(position)];
    // When allowSelectAnyColor, temporarily treat the clicked piece's color as the active turn
    const stateForMoves = (allowSelectAnyColor && piece && piece.color !== gameState.currentTurn)
      ? { ...gameState, currentTurn: piece.color }
      : gameState;
    const moves = ChessEngine.getAllLegalMoves(stateForMoves)
      .filter(move => move.from === position)
      .map(move => move.to);
    setValidMoves(moves);
  };

  const handleDragStart = (position: Position, piece: Piece) => (e: React.DragEvent) => {
    if (editMode || allowSelectAnyColor || piece.color !== gameState.currentTurn) {
      e.preventDefault();
      return;
    }
    setDraggedPiece({ position, piece });
    selectPiece(position);

    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 40, 40);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (position: Position) => (e: React.DragEvent) => {
    e.preventDefault();
    if (!editMode && draggedPiece && validMoves.includes(position)) {
      attemptMove(draggedPiece.position, position);
    }
    setDraggedPiece(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  const handleDragEnd = () => setDraggedPiece(null);

  const renderBoard = () => {
    const squares = [];

    for (let row = 7; row >= 0; row--) {
      for (let col = 0; col < 8; col++) {
        const displayRow = isFlipped ? 7 - row : row;
        const displayCol = isFlipped ? 7 - col : col;
        const position = getPositionFromCoords(displayRow, displayCol);
        const piece = gameState.board[displayRow][displayCol];
        const isLight = (displayRow + displayCol) % 2 === 0;
        const isSelected = selectedSquare === position;
        const isValidMove = validMoves.includes(position);
        const isDragging = draggedPiece?.position === position;
        const isLastMoveSquare = lastMove && (lastMove.from === position || lastMove.to === position);
        const justArrived = lastMoveTo === position;

        squares.push(
          <div
            key={position}
            className={`
              square
              ${isLight ? 'light' : 'dark'}
              ${isSelected ? 'selected' : ''}
              ${isValidMove ? 'valid-move' : ''}
              ${isDragging ? 'dragging' : ''}
              ${isLastMoveSquare ? 'last-move' : ''}
            `}
            onClick={() => handleSquareClick(position)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(position)}
          >
            {showCoordinates && col === (isFlipped ? 7 : 0) && (
              <div className="rank-label">{displayRow + 1}</div>
            )}
            {showCoordinates && row === (isFlipped ? 7 : 0) && (
              <div className="file-label">{String.fromCharCode(97 + displayCol)}</div>
            )}

            {isValidMove && (!editMode || allowSelectAnyColor) && (
              <div className={`move-indicator ${piece ? 'capture' : 'empty'}`} />
            )}

            {piece && !isDragging && (
              <div
                className={`piece${justArrived ? ' just-arrived' : ''}`}
                draggable={!editMode && piece.color === gameState.currentTurn}
                onDragStart={handleDragStart(position, piece)}
                onDragEnd={handleDragEnd}
              >
                <ChessPiece type={piece.type} color={piece.color} size="100%" />
              </div>
            )}
          </div>
        );
      }
    }

    return squares;
  };

  return (
    <div className={`chess-board-wrapper ${compact ? 'compact' : ''}`}>
      <div className="relative">
        <div className="chess-board" ref={boardRef}>
          {renderBoard()}
        </div>
        {arrows && arrows.length > 0 && (
          <ArrowOverlay arrows={arrows} isFlipped={isFlipped} />
        )}
        {pendingPromotion && (
          <PromotionPicker
            color={playerColor}
            onSelect={handlePromotionSelect}
          />
        )}
      </div>
    </div>
  );
}

function getRow(position: Position): number {
  return parseInt(position[1]) - 1;
}

function getCol(position: Position): number {
  return position.charCodeAt(0) - 'a'.charCodeAt(0);
}

function getPositionFromCoords(row: number, col: number): Position {
  return (String.fromCharCode(97 + col) + (row + 1)) as Position;
}
