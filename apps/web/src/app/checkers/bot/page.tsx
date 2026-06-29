'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { CheckersEngine, CheckersGameState, getBestCheckersMove, calculateNewRating, GameOutcome } from '@gameexplorer/shared';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { useAuth } from '@/hooks/useAuth';
import { saveCheckersGame, getUserRating, upsertUserRating } from '@gameexplorer/db';
import type { UserRating } from '@gameexplorer/db';

// ── Difficulty levels ─────────────────────────────────────────────────────────
// Each entry maps to a distinct minimax depth — that's what makes them
// meaningfully different. Within a level the engine also interpolates blunder
// chance and noise, but depth is the primary skill lever.

const DIFFICULTY_LEVELS = [
  {
    elo: 500,
    label: 'Beginner',
    description: 'Frequently misses captures and blunders pieces',
    depth: 1,
    icon: '🟢',
  },
  {
    elo: 800,
    label: 'Casual',
    description: 'Misses multi-jump chains, plays somewhat randomly',
    depth: 2,
    icon: '🔵',
  },
  {
    elo: 1100,
    label: 'Club',
    description: 'Consistent play, catches most forced captures',
    depth: 3,
    icon: '🟡',
  },
  {
    elo: 1400,
    label: 'Strong',
    description: 'Strong tactically, handles most positions well',
    depth: 4,
    icon: '🟠',
  },
  {
    elo: 1700,
    label: 'Expert',
    description: 'Very difficult to beat, deep tactical vision',
    depth: 5,
    icon: '🔴',
  },
  {
    elo: 2000,
    label: 'Master',
    description: 'Near-optimal play — essentially a computer',
    depth: 5,
    icon: '⚫',
  },
] as const;

function thinkTimeForElo(elo: number): number {
  if (elo < 700)  return 300;
  if (elo < 1000) return 500;
  if (elo < 1400) return 750;
  if (elo < 1800) return 1000;
  return 1300;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatingResult {
  before: number;
  after: number;
  delta: number;
}

// ── Move notation ──────────────────────────────────────────────────────────────

function formatMove(move: CheckersGameState['moveHistory'][number]): string {
  if (move.captures.length === 0) return `${move.from}-${move.to}`;
  return move.path.reduce((acc, sq, i) => (i === 0 ? `${move.from}x${sq}` : `${acc}x${sq}`), '');
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckersBotPage() {
  const [timeline, setTimeline]     = useState<CheckersGameState[]>(() => [CheckersEngine.newGame()]);
  const [viewIndex, setViewIndex]   = useState(0);
  const [targetElo, setTargetElo]   = useState(1100);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [userId, setUserId]         = useState<string | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved]   = useState(false);

  const { user } = useAuth();

  const timelineRef  = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef  = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const targetEloRef  = useRef(targetElo);
  targetEloRef.current = targetElo;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const userRatingRef  = useRef(userRating);
  userRatingRef.current = userRating;

  const liveState   = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive    = viewIndex === timeline.length - 1;

  useEffect(() => { setUserId(user?.id ?? null); }, [user]);

  // Load rating when user is available
  useEffect(() => {
    if (!user) return;
    getUserRating(user.id, 'checkers').then(setUserRating);
  }, [user]);

  const makeBotMove = useCallback(async () => {
    const currentTimeline  = timelineRef.current;
    const wasAtLive        = viewIndexRef.current === currentTimeline.length - 1;
    const currentLiveState = currentTimeline[currentTimeline.length - 1];
    const elo              = targetEloRef.current;

    setIsThinking(true);
    try {
      // Run the minimax bot off the main thread tick so the UI can show "thinking"
      const [move] = await Promise.all([
        new Promise<{ from: string; to: string }>(resolve =>
          setTimeout(() => resolve(getBestCheckersMove(currentLiveState, elo)), 0),
        ),
        new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
      ]);

      const result = CheckersEngine.validateMove(currentLiveState, move.from, move.to);
      if (result.valid && result.resultingState) {
        const next       = result.resultingState;
        const newLength  = currentTimeline.length + 1;
        setTimeline(prev => [...prev, next]);
        if (wasAtLive) setViewIndex(newLength - 1);
      }
    } catch (err) {
      console.error('Bot error:', err);
    } finally {
      setIsThinking(false);
    }
  }, []);

  // Trigger bot move when it's the bot's turn
  useEffect(() => {
    if (!gameStarted) return;
    if (liveState.isGameOver) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking) makeBotMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking]);

  // Save game and update rating when it ends
  useEffect(() => {
    if (!gameStarted || !liveState.isGameOver || gameSaved) return;
    setGameSaved(true);

    const pc = playerColorRef.current;
    const result: 'white' | 'black' | 'draw' =
      liveState.winner === null ? 'draw'
      : liveState.winner === pc ? pc
      : (pc === 'white' ? 'black' : 'white');

    const outcome: GameOutcome =
      result === 'draw' ? 'draw' : result === pc ? 'win' : 'loss';

    const current = userRatingRef.current;
    const uid = userId;

    if (current && uid) {
      const rawDelta = calculateNewRating(current.rating, targetEloRef.current, outcome, current.games_played) - current.rating;
      const newRating = Math.max(100, current.rating + rawDelta);

      Promise.all([
        upsertUserRating(uid, newRating, outcome, 'checkers'),
        saveCheckersGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid, {
          mode: 'rated',
          rating_before: current.rating,
          rating_after: newRating,
        }),
      ]).then(([updatedRating]) => {
        setUserRating(updatedRating);
        setRatingResult({ before: current.rating, after: newRating, delta: rawDelta });
      });
    } else {
      saveCheckersGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isGameOver]);

  const handleMove = (from: string, to: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver) return;
    if (liveState.currentTurn !== playerColor) return;

    const result = CheckersEngine.validateMove(liveState, from, to);
    if (result.valid && result.resultingState) {
      const newIdx = timeline.length;
      setTimeline(prev => [...prev, result.resultingState!]);
      setViewIndex(newIdx);
    }
  };

  const handleNewGame = () => {
    setTimeline([CheckersEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setRatingResult(null);
    setGameSaved(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
    // The useEffect watching liveState/gameStarted handles triggering the first
    // bot move when the player picks black — no setTimeout needed.
  };

  const canGoBack    = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;

  const counts = CheckersEngine.getPieceCounts(displayState);

  // ── Setup screen ──────────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 pt-16">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/checkers"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-8 text-center">
            Play vs Bot
          </h1>

          {/* Difficulty selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">Bot Strength</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DIFFICULTY_LEVELS.map((level) => {
                const selected = targetElo === level.elo;
                return (
                  <button
                    key={level.elo}
                    onClick={() => setTargetElo(level.elo)}
                    className={`relative p-4 rounded-xl text-left transition-all border-2 ${
                      selected
                        ? 'border-accent bg-accent-muted dark:bg-accent-muted shadow-md scale-[1.02]'
                        : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="text-2xl mb-2">{level.icon}</div>
                    <div className={`font-bold text-sm mb-0.5 ${selected ? 'text-accent dark:text-accent' : 'text-slate-800 dark:text-slate-100'}`}>
                      {level.label}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
                      {level.description}
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">Choose Your Color</h2>
            <div className="grid grid-cols-2 gap-4">
              {(['white', 'black'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'bg-accent text-on-accent shadow-lg scale-105'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  {/* Mini piece preview */}
                  <div className="flex justify-center mb-2">
                    <svg width="40" height="40" viewBox="0 0 45 45">
                      <circle cx="23" cy="24.5" r="17" fill={color === 'white' ? '#c8b49a' : '#1a0f08'} opacity="0.35" />
                      <circle cx="22.5" cy="22" r="17" fill={color === 'white' ? '#faf0e0' : '#2c1b08'} stroke={color === 'white' ? '#5c3d1e' : '#e8d5b7'} strokeWidth="1.5" />
                      <ellipse cx="17" cy="16.5" rx="6.5" ry="4.5" fill={color === 'white' ? '#ffffff' : '#5c4033'} opacity="0.35" />
                    </svg>
                  </div>
                  <div className="font-semibold capitalize">{color}</div>
                  <div className={`text-sm ${playerColor === color ? 'text-accent' : 'text-slate-600 dark:text-slate-400'}`}>
                    {color === 'white' ? 'You move first' : 'Bot moves first'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            className="w-full px-8 py-4 bg-accent hover:bg-accent-hover text-on-accent font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────────

  const gameOverMsg = liveState.isGameOver
    ? liveState.winner === null
      ? 'Draw — 40 moves without capture'
      : liveState.winner === playerColor
        ? 'You win! 🎉'
        : 'Bot wins'
    : null;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 lg:overflow-hidden pt-16">

      {/* Rating result overlay */}
      {ratingResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pt-16">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-5xl mb-3">
              {ratingResult.delta > 0 ? '🏆' : ratingResult.delta < 0 ? '😞' : '🤝'}
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
              {gameOverMsg}
            </div>
            <div className="mt-5 mb-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-700">
              <div className="flex items-center justify-center gap-3">
                <span className="text-slate-500 dark:text-slate-400 text-sm">Rating</span>
                <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{ratingResult.before}</span>
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className="text-xl font-bold text-slate-800 dark:text-slate-100">{ratingResult.after}</span>
                <span className={`text-lg font-bold ${ratingResult.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {ratingResult.delta >= 0 ? '+' : ''}{ratingResult.delta}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleNewGame}
                className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
              >
                Play Again
              </button>
              <Link
                href="/checkers"
                className="w-full px-4 py-2.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 font-semibold rounded-lg transition-colors text-sm block"
              >
                Back to Checkers
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            href="/checkers"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>

          <div className="flex items-center gap-3">
            {isThinking && (
              <span className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">
                Bot thinking…
              </span>
            )}
            {!isAtLive && (
              <button
                onClick={() => setViewIndex(timeline.length - 1)}
                className="text-xs px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
            >
              New Game
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 lg:overflow-hidden">
        <div className="container mx-auto lg:h-full px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] lg:grid-rows-1 gap-4 lg:h-full lg:max-h-full">

            {/* Board */}
            <div className="flex items-center justify-center min-h-0">
              <div className="w-full max-w-[560px]">
                <CheckersBoard
                  gameState={displayState}
                  onMove={handleMove}
                  playerColor={playerColor}
                  showCoordinates
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* Info card */}
              <div className="shrink-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Bot:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {DIFFICULTY_LEVELS.find(l => l.elo === targetElo)?.label ?? targetElo}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Playing:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Turn:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">
                      {liveState.isGameOver ? '—' : liveState.currentTurn}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Move:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {liveState.moveHistory.length}
                    </span>
                  </div>
                </div>

                {/* Piece count display */}
                <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex justify-around text-xs">
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#faf0e0" stroke="#5c3d1e" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{counts.white}</span>
                  </div>
                  <div className="text-slate-400">vs</div>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#2c1b08" stroke="#e8d5b7" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{counts.black}</span>
                  </div>
                </div>

                {gameOverMsg && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-semibold text-center text-amber-700 dark:text-amber-300">
                    {gameOverMsg}
                  </div>
                )}
              </div>

              {/* Move history */}
              <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
                {/* Nav buttons */}
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-600">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Moves</span>
                  <div className="flex gap-1">
                    {[
                      { label: '⇤', action: () => setViewIndex(0),                        disabled: !canGoBack },
                      { label: '←', action: () => setViewIndex(i => Math.max(0, i - 1)),  disabled: !canGoBack },
                      { label: '→', action: () => setViewIndex(i => Math.min(timeline.length - 1, i + 1)), disabled: !canGoForward },
                      { label: '⇥', action: () => setViewIndex(timeline.length - 1),      disabled: !canGoForward },
                    ].map(({ label, action, disabled }) => (
                      <button
                        key={label}
                        onClick={action}
                        disabled={disabled}
                        className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Move list */}
                <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
                  {liveState.moveHistory.length === 0 ? (
                    <p className="text-slate-400 dark:text-slate-500 text-xs text-center py-4">
                      No moves yet — make your first move
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {liveState.moveHistory.map((move, i) => {
                        const moveNum = Math.floor(i / 2) + 1;
                        const isWhiteMove = i % 2 === 0;
                        const stateIdx = i + 1;
                        const isActive = viewIndex === stateIdx;
                        return (
                          <div key={i} className="flex items-center gap-1">
                            {isWhiteMove && (
                              <span className="text-slate-400 dark:text-slate-500 w-7 shrink-0 text-right pr-1">
                                {moveNum}.
                              </span>
                            )}
                            {!isWhiteMove && <span className="w-7 shrink-0" />}
                            <button
                              onClick={() => setViewIndex(stateIdx)}
                              className={`flex-1 text-left px-2 py-0.5 rounded transition-colors truncate ${
                                isActive
                                  ? 'bg-accent text-on-accent font-semibold'
                                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {formatMove(move)}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
