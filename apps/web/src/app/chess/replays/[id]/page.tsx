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
    const result = ChessEngine.validateMove(current, move.from, move.to);
    if (result.valid && result.resultingState) {
      timeline.push(result.resultingState);
    } else {
      break;
    }
  }

  return timeline;
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
              <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Moves</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-0.5">
                  {Array.from({ length: Math.ceil(totalMoves / 2) }).map((_, i) => {
                    const whiteMoveIndex = i * 2 + 1;
                    const blackMoveIndex = i * 2 + 2;
                    const whiteMove = game.moves[i * 2];
                    const blackMove = game.moves[i * 2 + 1];

                    return (
                      <div key={i} className="flex items-center gap-1 text-sm font-mono rounded overflow-hidden">
                        <span className="text-slate-400 dark:text-slate-500 w-7 text-right shrink-0 pr-1">
                          {i + 1}.
                        </span>
                        <button
                          onClick={() => goTo(whiteMoveIndex)}
                          className={`flex-1 text-left px-2 py-1 rounded transition-colors ${
                            cursor === whiteMoveIndex
                              ? 'bg-blue-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {whiteMove.from}-{whiteMove.to}
                          {whiteMove.isCheck && !whiteMove.isCheckmate && '+'}
                          {whiteMove.isCheckmate && '#'}
                        </button>
                        {blackMove ? (
                          <button
                            onClick={() => goTo(blackMoveIndex)}
                            className={`flex-1 text-left px-2 py-1 rounded transition-colors ${
                              cursor === blackMoveIndex
                                ? 'bg-blue-600 text-white'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                            }`}
                          >
                            {blackMove.from}-{blackMove.to}
                            {blackMove.isCheck && !blackMove.isCheckmate && '+'}
                            {blackMove.isCheckmate && '#'}
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
                  {isDraw ? '½ - ½' : game.result === 'white' ? '1 - 0' : '0 - 1'}
                </span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}