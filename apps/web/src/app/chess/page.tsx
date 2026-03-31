'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChessEngine, ChessGameState, Position } from '@gameexplorer/shared';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';

export default function ChessPage() {
  const [gameState, setGameState] = useState<ChessGameState>(() => ChessEngine.newGame());
  const [message, setMessage] = useState<string>('');

  const handleMove = (from: Position, to: Position) => {
    const result = ChessEngine.validateMove(gameState, from, to);

    if (result.valid && result.resultingState) {
      setGameState(result.resultingState);
      setMessage('');

      if (result.resultingState.isCheckmate) {
        const winner = result.resultingState.currentTurn === 'white' ? 'Black' : 'White';
        setMessage(`Checkmate! ${winner} wins! 🎉`);
      } else if (result.resultingState.isStalemate) {
        setMessage('Stalemate! The game is a draw.');
      } else if (result.resultingState.isCheck) {
        setMessage('Check!');
      }
    } else {
      setMessage(result.reason || 'Invalid move');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  const handleReset = () => {
    setGameState(ChessEngine.newGame());
    setMessage('');
  };

  const handleUndo = () => {
    if (gameState.moveHistory.length === 0) {
      setMessage('No moves to undo');
      setTimeout(() => setMessage(''), 2000);
      return;
    }

    let newState = ChessEngine.newGame();
    for (let i = 0; i < gameState.moveHistory.length - 1; i++) {
      const move = gameState.moveHistory[i];
      const result = ChessEngine.validateMove(newState, move.from, move.to);
      if (result.valid && result.resultingState) {
        newState = result.resultingState;
      }
    }
    setGameState(newState);
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
      {/* Back Button */}
      <div className="container mx-auto px-4 pt-8">
        <Link 
          href="/"
          className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            Chess
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Play a game of chess with drag-and-drop or click to move
          </p>
        </div>

        {/* Error/Status Messages */}
        {message && (
          <div className="max-w-2xl mx-auto mb-4">
            <div className={`
              p-4 rounded-lg text-center font-medium
              ${message.includes('Invalid') || message.includes('No moves') 
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' 
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'}
            `}>
              {message}
            </div>
          </div>
        )}

        {/* Chess Board */}
        <ChessBoard
          gameState={gameState}
          onMove={handleMove}
          playerColor="white"
          showCoordinates={true}
        />

        {/* Controls */}
        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md transition-colors"
          >
            New Game
          </button>
          <button
            onClick={handleUndo}
            className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={gameState.moveHistory.length === 0}
          >
            Undo Move
          </button>
        </div>

        {/* Game Info */}
        <div className="max-w-2xl mx-auto mt-8 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-4">
            Game Information
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600 dark:text-slate-400">Current Turn:</span>
              <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                {gameState.currentTurn === 'white' ? 'White' : 'Black'}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Move Number:</span>
              <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                {gameState.fullMoveNumber}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Total Moves:</span>
              <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                {gameState.moveHistory.length}
              </span>
            </div>
            <div>
              <span className="text-slate-600 dark:text-slate-400">Status:</span>
              <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                {gameState.isCheckmate ? 'Checkmate' :
                 gameState.isStalemate ? 'Stalemate' :
                 gameState.isCheck ? 'Check' :
                 'In Progress'}
              </span>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="max-w-2xl mx-auto mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-4">
            How to Play
          </h2>
          <ul className="space-y-2 text-slate-600 dark:text-slate-400">
            <li>• <strong>Click</strong> on a piece to see valid moves (green dots)</li>
            <li>• <strong>Click</strong> on a highlighted square to move</li>
            <li>• <strong>Drag and drop</strong> pieces to move them</li>
            <li>• Circles = empty squares, borders = capture moves</li>
            <li>• Only valid moves are allowed - the engine handles all rules</li>
          </ul>
        </div>
      </div>
    </div>
  );
}