// apps/web/src/components/chess/ChessBoard.tsx
'use client';

import React, { useState } from 'react';
import { ChessEngine, ChessGameState, Position, Piece } from '@gameexplorer/shared';

interface ChessBoardProps {
  gameState: ChessGameState;
  onMove: (from: Position, to: Position) => void;
  playerColor?: 'white' | 'black';
  showCoordinates?: boolean;
}

export function ChessBoard({ 
  gameState, 
  onMove, 
  playerColor = 'white',
  showCoordinates = true 
}: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<Position[]>([]);
  const [draggedPiece, setDraggedPiece] = useState<{ position: Position; piece: Piece } | null>(null);

  // Determine board orientation (white on bottom by default)
  const isFlipped = playerColor === 'black';

  // Handle square click
  const handleSquareClick = (position: Position) => {
    const piece = gameState.board[getRow(position)][getCol(position)];

    // If a square is already selected
    if (selectedSquare) {
      // Try to make a move
      if (validMoves.includes(position)) {
        onMove(selectedSquare, position);
        setSelectedSquare(null);
        setValidMoves([]);
      } else if (piece && piece.color === gameState.currentTurn) {
        // Select different piece
        selectPiece(position);
      } else {
        // Deselect
        setSelectedSquare(null);
        setValidMoves([]);
      }
    } else {
      // Select a piece
      if (piece && piece.color === gameState.currentTurn) {
        selectPiece(position);
      }
    }
  };

  const selectPiece = (position: Position) => {
    setSelectedSquare(position);
    const moves = ChessEngine.getAllLegalMoves(gameState)
      .filter(move => move.from === position)
      .map(move => move.to);
    setValidMoves(moves);
  };

  // Drag and drop handlers
  const handleDragStart = (position: Position, piece: Piece) => (e: React.DragEvent) => {
    if (piece.color !== gameState.currentTurn) {
      e.preventDefault();
      return;
    }

    setDraggedPiece({ position, piece });
    selectPiece(position);

    // Set drag image
    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 40, 40);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (position: Position) => (e: React.DragEvent) => {
    e.preventDefault();
    
    if (draggedPiece && validMoves.includes(position)) {
      onMove(draggedPiece.position, position);
    }

    setDraggedPiece(null);
    setSelectedSquare(null);
    setValidMoves([]);
  };

  const handleDragEnd = () => {
    setDraggedPiece(null);
  };

  // Render the board
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

        squares.push(
          <div
            key={position}
            className={`
              square
              ${isLight ? 'light' : 'dark'}
              ${isSelected ? 'selected' : ''}
              ${isValidMove ? 'valid-move' : ''}
              ${isDragging ? 'dragging' : ''}
            `}
            onClick={() => handleSquareClick(position)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(position)}
          >
            {/* Coordinates */}
            {showCoordinates && col === 0 && (
              <div className="rank-label">{displayRow + 1}</div>
            )}
            {showCoordinates && row === 0 && (
              <div className="file-label">{String.fromCharCode(97 + displayCol)}</div>
            )}

            {/* Valid move indicator */}
            {isValidMove && (
              <div className={`move-indicator ${piece ? 'capture' : 'empty'}`} />
            )}

            {/* Chess piece */}
            {piece && !isDragging && (
              <div
                className="piece"
                draggable={piece.color === gameState.currentTurn}
                onDragStart={handleDragStart(position, piece)}
                onDragEnd={handleDragEnd}
              >
                {getPieceSymbol(piece)}
              </div>
            )}
          </div>
        );
      }
    }

    return squares;
  };

  return (
    <div className="chess-board-container">
      {/* Game status */}
      <div className="game-status">
        {gameState.isCheckmate && (
          <div className="status-message checkmate">
            Checkmate! {gameState.currentTurn === 'white' ? 'Black' : 'White'} wins!
          </div>
        )}
        {gameState.isStalemate && (
          <div className="status-message stalemate">
            Stalemate! Game is a draw.
          </div>
        )}
        {gameState.isCheck && !gameState.isCheckmate && (
          <div className="status-message check">
            Check!
          </div>
        )}
        {!gameState.isCheckmate && !gameState.isStalemate && (
          <div className="status-message turn">
            {gameState.currentTurn === 'white' ? 'White' : 'Black'} to move
          </div>
        )}
      </div>

      {/* Chess board */}
      <div className="chess-board">
        {renderBoard()}
      </div>

      {/* Move history */}
      <div className="move-history">
        <h3>Moves</h3>
        <div className="moves-list">
          {gameState.moveHistory.map((move, index) => (
            <div key={index} className="move-item">
              {Math.floor(index / 2) + 1}. {move.from}-{move.to}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Helper functions
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
    'white-pawn': '♙',
    'white-knight': '♘',
    'white-bishop': '♗',
    'white-rook': '♖',
    'white-queen': '♕',
    'white-king': '♔',
    'black-pawn': '♟',
    'black-knight': '♞',
    'black-bishop': '♝',
    'black-rook': '♜',
    'black-queen': '♛',
    'black-king': '♚',
  };

  return symbols[`${piece.color}-${piece.type}`] || '?';
}