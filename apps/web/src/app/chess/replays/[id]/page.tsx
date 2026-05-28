// Game replay viewer
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChessEngine, ChessGameState } from '@gameexplorer/shared';
import { getGameById, SavedGame } from '@gameexplorer/db';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';

/**
 * Build an array of board states by replaying all moves from the beginning.
 * Index 0 = starting position, index N = after N moves.
 */
function buildStateTimeline(game: SavedGame): ChessGameState[] {
  const timeline: ChessGameState[] = [ChessEngine.newGame()];

  for (const move of game.moves) {
    const current = timeline[timeline.length - 1];
    const result = ChessEngine.validateMove(current, move.from, move.to, false, move.promotion);
    if (result.valid && result.resultingState) {
      timeline.push(result.resultingState);
    } else {
      break;
    }
  }

  return timeline;
}

/**
 * Derive human-readable notation for move at index i (0-based in game.moves).
 * Uses the state BEFORE the move (timeline[i]) to identify the piece,
 * and the state AFTER (timeline[i+1]) to get check/checkmate.
 */
function getMoveNotation(
  game: SavedGame,
  timeline: ChessGameState[],
  moveIndex: number
): string {
  const move = game.moves[moveIndex];
  const stateBefore = timeline[moveIndex];
  const stateAfter = timeline[moveIndex + 1];

  if (!move || !stateBefore || !stateAfter) return '';

  const piece = stateBefore.board
    [parseInt(move.from[1]) - 1]
    [move.from.charCodeAt(0) - 'a'.charCodeAt(0)];

  const pieceLetters: Record<string, string> = {
    king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '',
  };

  const pieceLetter = piece ? pieceLetters[piece.type] : '';

  // Castling
  const fromCol = move.from.charCodeAt(0) - 'a'.charCodeAt(0);
  const toCol = move.to.charCodeAt(0) - 'a'.charCodeAt(0);
  if (piece?.type === 'king' && Math.abs(toCol - fromCol) === 2) {
    const notation = toCol > fromCol ? 'O-O' : 'O-O-O';
    if (stateAfter.isCheckmate) return notation + '#';
    if (stateAfter.isCheck) return notation + '+';
    return notation;
  }

  // Capture
  const targetSquare = stateBefore.board
    [parseInt(move.to[1]) - 1]
    [move.to.charCodeAt(0) - 'a'.charCodeAt(0)];
  const isCapture = targetSquare !== null;
  const captureStr = isCapture ? 'x' : '';

  // Pawn captures include the file of origin
  const pawnFile = piece?.type === 'pawn' && isCapture ? move.from[0] : '';

  const suffix = stateAfter.isCheckmate ? '#' : stateAfter.isCheck ? '+' : '';

  return `${pieceLetter}${pawnFile}${captureStr}${move.to}${suffix}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export default function ReplayPage() {
  const { id } = useParams<{ id: string }>();
  const [game, setGame] = useState<SavedGame | null>(null);
  const [timeline, setTimeline] = useState<ChessGameState[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    getGameById(id).then((data) => {
      if (!data) {
        setNotFound(true);
      } else {
        setGame(data);
        const tl = buildStateTimeline(data);
        setTimeline(tl);
        setCursor(tl.length - 1); // start at final position
      }
      setLoading(false);
    });
  }, [id]);

  const goTo = useCallback((index: number) => {
    setCursor(Math.max(0, Math.min(index, timeline.length - 1)));
  }, [timeline.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  goTo(cursor - 1);
      if (e.key === 'ArrowRight') goTo(cursor + 1);
      if (e.key === 'ArrowUp'   || e.key === 'Home') goTo(0);
      if (e.key === 'ArrowDown' || e.key === 'End')  goTo(timeline.length - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [cursor, goTo, timeline.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-slate-400 dark:text-slate-500">Loading replay...</div>
      </div>
    );
  }

  if (notFound || !game) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">♟</div>
          <p className="text-slate-500 dark:text-slate-400">Game not found</p>
          <Link href="/chess/replays" className="mt-4 inline-block text-blue-500 hover:underline">
            Back to replays
          </Link>
        </div>
      </div>
    );
  }

  const currentState = timeline[cursor];
  const totalMoves = timeline.length - 1;
  const playerWon = game.result === game.player_color;
  const isDraw = game.result === 'draw';
  const resultLabel = isDraw ? 'Draw' : playerWon ? 'You won' : 'You lost';
  const resultColor = isDraw
    ? 'text-slate-500 dark:text-slate-400'
    : playerWon
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400';

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            href="/chess/replays"
            className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Replays
          </Link>
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {formatDate(game.created_at)}
            </div>
            <div className={`text-xs font-medium ${resultColor}`}>
              {resultLabel} · vs {game.opponent} ({game.difficulty})
            </div>
          </div>
          <div className="w-16" />
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto h-full px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 h-full">

            {/* Board */}
            <div className="flex flex-col items-center justify-center min-h-0 gap-4">
              <div className="w-full max-w-150">
                <ChessBoard
                  gameState={currentState}
                  onMove={() => {}}
                  playerColor={game.player_color}
                  showCoordinates={true}
                />
              </div>

              {/* Playback controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goTo(0)}
                  disabled={cursor === 0}
                  className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow hover:shadow-md disabled:opacity-30 transition-all"
                  title="Start (↑)"
                >
                  <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => goTo(cursor - 1)}
                  disabled={cursor === 0}
                  className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow hover:shadow-md disabled:opacity-30 transition-all"
                  title="Previous (←)"
                >
                  <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <span className="px-4 py-2 bg-white dark:bg-slate-800 rounded-lg shadow text-sm font-mono text-slate-700 dark:text-slate-300 min-w-20 text-center">
                  {cursor === 0 ? 'Start' : `Move ${cursor}/${totalMoves}`}
                </span>

                <button
                  onClick={() => goTo(cursor + 1)}
                  disabled={cursor === timeline.length - 1}
                  className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow hover:shadow-md disabled:opacity-30 transition-all"
                  title="Next (→)"
                >
                  <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => goTo(timeline.length - 1)}
                  disabled={cursor === timeline.length - 1}
                  className="p-2 rounded-lg bg-white dark:bg-slate-800 shadow hover:shadow-md disabled:opacity-30 transition-all"
                  title="End (↓)"
                >
                  <svg className="w-5 h-5 text-slate-700 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">Use ← → arrow keys to step through moves</p>
            </div>

            {/* Move list panel */}
            <div className="flex flex-col min-h-0 bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">

              {/* Column headers */}
              <div className="shrink-0 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center">
                  <div className="w-8 shrink-0" /> {/* move number spacer */}
                  <div className="flex-1 px-2 py-2.5 flex items-center gap-1.5 border-r border-slate-200 dark:border-slate-700">
                    <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300 dark:bg-slate-200 dark:border-slate-400 inline-block" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">White</span>
                  </div>
                  <div className="flex-1 px-2 py-2.5 flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-slate-800 border border-slate-600 dark:bg-slate-900 dark:border-slate-500 inline-block" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Black</span>
                  </div>
                </div>
              </div>

              {/* Move rows */}
              <div className="flex-1 overflow-y-auto">
                <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {Array.from({ length: Math.ceil(totalMoves / 2) }).map((_, i) => {
                    const whiteMoveIndex = i * 2 + 1;
                    const blackMoveIndex = i * 2 + 2;
                    const hasBlack = blackMoveIndex <= totalMoves;

                    const whiteNotation = getMoveNotation(game, timeline, i * 2);
                    const blackNotation = hasBlack ? getMoveNotation(game, timeline, i * 2 + 1) : null;

                    const whiteActive = cursor === whiteMoveIndex;
                    const blackActive = cursor === blackMoveIndex;

                    return (
                      <div key={i} className="flex items-stretch text-sm font-mono">
                        {/* Move number */}
                        <div className="w-8 shrink-0 flex items-center justify-end pr-1.5 text-slate-400 dark:text-slate-500 text-xs">
                          {i + 1}.
                        </div>

                        {/* White move */}
                        <button
                          onClick={() => goTo(whiteMoveIndex)}
                          className={`flex-1 text-left px-2 py-1.5 border-r border-slate-100 dark:border-slate-700/50 transition-colors ${
                            whiteActive
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {whiteNotation}
                        </button>

                        {/* Black move */}
                        {blackNotation ? (
                          <button
                            onClick={() => goTo(blackMoveIndex)}
                            className={`flex-1 text-left px-2 py-1.5 transition-colors ${
                              blackActive
                                ? 'bg-blue-600 text-white'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {blackNotation}
                          </button>
                        ) : (
                          <div className="flex-1" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Result footer */}
              <div className="shrink-0 px-4 py-3 border-t border-slate-200 dark:border-slate-700 text-center">
                <span className={`text-sm font-semibold ${resultColor}`}>
                  {isDraw ? '½ – ½' : game.result === 'white' ? '1 – 0' : '0 – 1'}
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}