'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChessEngine, ChessGameState, Position } from '@gameexplorer/shared';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { useStockfish } from '@/hooks/useStockfish';
import { saveGame } from '@gameexplorer/db';
import { supabase } from '@gameexplorer/db';

type Difficulty = 'easy' | 'medium' | 'hard';

export default function ChessBotPage() {
  const [gameState, setGameState] = useState<ChessGameState>(() => ChessEngine.newGame());
  const [message, setMessage] = useState<string>('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const stockfish = useStockfish();

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }

    loadUser();
  }, []);

  useEffect(() => {
    if (!gameStarted) return;
    if (gameState.isCheckmate || gameState.isStalemate || gameState.isDraw) return;

    const isBotTurn = gameState.currentTurn !== playerColor;

    if (isBotTurn && !isThinking && stockfish.isReady) {
      makeBotMove();
    }
  }, [gameState, playerColor, gameStarted, isThinking, stockfish.isReady]);

  // Save game when it ends
  useEffect(() => {
    if (!gameStarted) return;

    let result: 'white' | 'black' | 'draw' | null = null;

    if (gameState.isCheckmate) {
      result = gameState.currentTurn === 'white' ? 'black' : 'white';
    } else if (gameState.isStalemate || gameState.isDraw) {
      result = 'draw';
    }

    if (result) {
      // Pass userId — null if not signed in, game still saves anonymously
      saveGame(gameState, playerColor, result, difficulty, userId ?? undefined);
    }
  }, [gameState.isCheckmate, gameState.isStalemate, gameState.isDraw]);

  const makeBotMove = async () => {
    setIsThinking(true);
    setMessage('Bot is thinking...');

    try {
      const thinkTime = { easy: 500, medium: 1000, hard: 1500 }[difficulty];

      const [move] = await Promise.all([
        stockfish.getBestMove(gameState, difficulty),
        new Promise(resolve => setTimeout(resolve, thinkTime))
      ]);

      if (move) {
        const result = ChessEngine.validateMove(gameState, move.from, move.to);

        if (result.valid && result.resultingState) {
          setGameState(result.resultingState);

          if (result.resultingState.isCheckmate) {
            setMessage('Checkmate! Bot wins! 🤖');
          } else if (result.resultingState.isCheck) {
            setMessage('Check!');
          } else {
            setMessage('');
          }
        }
      }
    } catch (error) {
      console.error('Bot error:', error);
      setMessage('Bot encountered an error');
    } finally {
      setIsThinking(false);
    }
  };

  const handleMove = (from: Position, to: Position) => {
    if (isThinking) return;
    if (gameState.currentTurn !== playerColor) return;

    const result = ChessEngine.validateMove(gameState, from, to);

    if (result.valid && result.resultingState) {
      setGameState(result.resultingState);
      setMessage('');

      if (result.resultingState.isCheckmate) {
        setMessage('Checkmate! You win! 🎉');
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

  const handleNewGame = () => {
    setGameState(ChessEngine.newGame());
    setMessage('');
    setGameStarted(false);
    setIsThinking(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);

    if (playerColor === 'black') {
      setTimeout(() => makeBotMove(), 500);
    }
  };

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/chess"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-16 max-w-2xl">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-8 text-center">
            Play vs Bot
          </h1>

          {/* Sign-in nudge for guests */}
          {!userId && (
            <div className="mb-6 p-4 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 flex items-center justify-between gap-4">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Sign in to save your games and track your progress.
              </p>
              <Link
                href="/auth/signin"
                className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                Sign in
              </Link>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">
              Choose Difficulty
            </h2>
            <div className="space-y-4">
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => (
                <button
                  key={diff}
                  onClick={() => setDifficulty(diff)}
                  className={`
                    w-full p-4 rounded-lg text-left transition-all
                    ${difficulty === diff
                      ? 'bg-blue-600 text-white shadow-lg scale-105'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }
                  `}
                >
                  <div className="font-semibold text-lg capitalize">{diff}</div>
                  <div className={`text-sm ${difficulty === diff ? 'text-blue-100' : 'text-slate-600 dark:text-slate-400'}`}>
                    {diff === 'easy' && 'Beginner - Makes mistakes'}
                    {diff === 'medium' && 'Intermediate - Plays well'}
                    {diff === 'hard' && 'Advanced - Very strong'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPlayerColor('white')}
                className={`
                  p-6 rounded-lg transition-all
                  ${playerColor === 'white'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }
                `}
              >
                <div className="text-4xl mb-2">♔</div>
                <div className="font-semibold">White</div>
                <div className={`text-sm ${playerColor === 'white' ? 'text-blue-100' : 'text-slate-600 dark:text-slate-400'}`}>
                  You move first
                </div>
              </button>
              <button
                onClick={() => setPlayerColor('black')}
                className={`
                  p-6 rounded-lg transition-all
                  ${playerColor === 'black'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }
                `}
              >
                <div className="text-4xl mb-2">♚</div>
                <div className="font-semibold">Black</div>
                <div className={`text-sm ${playerColor === 'black' ? 'text-blue-100' : 'text-slate-600 dark:text-slate-400'}`}>
                  Bot moves first
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={handleStartGame}
            className="w-full px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 overflow-hidden">
      {/* Fixed Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            href="/chess"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
          <button
            onClick={handleNewGame}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            New Game
          </button>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto h-full px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 h-full max-h-full">
            {/* Left: Chess Board */}
            <div className="flex items-center justify-center min-h-0">
              <div className="w-full max-w-150">
                <ChessBoard
                  gameState={gameState}
                  onMove={handleMove}
                  playerColor={playerColor}
                  showCoordinates={true}
                />
              </div>
            </div>

            {/* Right: Info and Move List */}
            <div className="flex flex-col gap-4 min-h-0">
              {/* Status Message */}
              {message && (
                <div className={`
                  shrink-0 p-3 rounded-lg text-center font-medium text-sm
                  ${isThinking
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    : message.includes('Invalid')
                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}
                `}>
                  {message}
                </div>
              )}

              {/* Game Info */}
              <div className="shrink-0 bg-white dark:bg-slate-800 rounded-lg shadow p-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Difficulty:</span>
                    <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100 capitalize">
                      {difficulty}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Your Color:</span>
                    <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100 capitalize">
                      {playerColor}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Turn:</span>
                    <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                      {gameState.currentTurn === 'white' ? 'White' : 'Black'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Move:</span>
                    <span className="ml-2 font-semibold text-slate-800 dark:text-slate-100">
                      {gameState.fullMoveNumber}
                    </span>
                  </div>
                </div>
              </div>

              {/* Move History */}
              <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-lg shadow overflow-hidden flex flex-col">
                <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100">Moves</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-1">
                    {Array.from({ length: Math.ceil(gameState.moveHistory.length / 2) }).map((_, i) => {
                      const whiteMove = gameState.moveHistory[i * 2];
                      const blackMove = gameState.moveHistory[i * 2 + 1];
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm font-mono">
                          <span className="text-slate-500 dark:text-slate-400 w-8">{i + 1}.</span>
                          <span className="flex-1 text-slate-800 dark:text-slate-100">
                            {whiteMove.from}-{whiteMove.to}
                          </span>
                          {blackMove && (
                            <span className="flex-1 text-slate-800 dark:text-slate-100">
                              {blackMove.from}-{blackMove.to}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}