'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChessEngine, ChessGameState, Position, Piece, PieceType } from '@gameexplorer/shared';

interface ChessBoardProps {
  gameState: ChessGameState;
  onMove: (from: Position, to: Position, promotionPiece?: PieceType) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
  compact?: boolean;
}

interface AnimatingPiece {
  piece: Piece;
  from: Position;
  to: Position;
  startTime: number;
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

  const symbols: Record<string, string> = {
    'white-queen': '♕', 'white-rook': '♖', 'white-bishop': '♗', 'white-knight': '♘',
    'black-queen': '♛', 'black-rook': '♜', 'black-bishop': '♝', 'black-knight': '♞',
  };

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
              className="w-14 h-14 flex items-center justify-center text-4xl rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-blue-900 hover:scale-110 transition-all shadow-sm"
              title={type.charAt(0).toUpperCase() + type.slice(1)}
            >
              {symbols[`${color}-${type}`]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChessBoard({
  gameState,
  onMove,
  playerColor = 'white',
  showCoordinates = true,
  compact = false,
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [draggedPiece, setDraggedPiece] = useState<{ position: Position; piece: Piece } | null>(null);
  const [animatingPiece, setAnimatingPiece] = useState<AnimatingPiece | null>(null);
  const [lastMove, setLastMove] = useState<{ from: Position; to: Position } | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const isFlipped = playerColor === 'black';

  useEffect(() => {
    if (gameState.moveHistory.length > 0) {
      const latestMove = gameState.moveHistory[gameState.moveHistory.length - 1];
      setLastMove({ from: latestMove.from, to: latestMove.to });

      const piece = gameState.board[getRow(latestMove.to)][getCol(latestMove.to)];
      if (piece) {
        setAnimatingPiece({
          piece,
          from: latestMove.from,
          to: latestMove.to,
          startTime: Date.now(),
        });
        setTimeout(() => setAnimatingPiece(null), 300);
      }
    }
  }, [gameState.moveHistory.length]);

  const handleSquareClick = (position: Position) => {
    if (pendingPromotion) return; // ignore clicks while promotion picker is open

    const piece = gameState.board[getRow(position)][getCol(position)];

    if (selectedSquare) {
      if (validMoves.includes(position)) {
        attemptMove(selectedSquare, position);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && piece.color === gameState.currentTurn) {
        selectPiece(position);
      } else {
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      if (piece && piece.color === gameState.currentTurn) {
        selectPiece(position);
      }
    }
  };

  /**
   * Attempt a move — if it needs promotion, show the picker instead of
   * calling onMove immediately.
   */
  const attemptMove = (from: Position, to: Position) => {
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
    const moves = ChessEngine.getAllLegalMoves(gameState)
      .filter(move => move.from === position)
      .map(move => move.to);
    setValidMoves(moves);
  };

  const handleDragStart = (position: Position, piece: Piece) => (e: React.DragEvent) => {
    if (piece.color !== gameState.currentTurn) {
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
    if (draggedPiece && validMoves.includes(position)) {
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
        const isAnimating = animatingPiece && (animatingPiece.from === position || animatingPiece.to === position);

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

            {isValidMove && (
              <div className={`move-indicator ${piece ? 'capture' : 'empty'}`} />
            )}

            {piece && !isDragging && !isAnimating && (
              <div
                className="piece"
                draggable={piece.color === gameState.currentTurn}
                onDragStart={handleDragStart(position, piece)}
                onDragEnd={handleDragEnd}
              >
                {getPieceSymbol(piece)}
              </div>
            )}

            {animatingPiece && animatingPiece.to === position && (
              <div className="piece animating">
                {getPieceSymbol(animatingPiece.piece)}
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
      {/* Promotion picker overlays the entire board */}
      <div className="relative">
        <div className="chess-board" ref={boardRef}>
          {renderBoard()}
        </div>
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

function getPieceSymbol(piece: Piece): string {
  const symbols: Record<string, string> = {
    'white-pawn': '♙', 'white-knight': '♘', 'white-bishop': '♗',
    'white-rook': '♖', 'white-queen': '♕', 'white-king': '♔',
    'black-pawn': '♟', 'black-knight': '♞', 'black-bishop': '♝',
    'black-rook': '♜', 'black-queen': '♛', 'black-king': '♚',
  };
  return symbols[`${piece.color}-${piece.type}`] || '?';
}