'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckersEngine,
  CheckersGameState,
  getBestCheckersMove,
  calculateNewRating,
  GameOutcome,
} from '@gameexplorer/shared';
import { CheckersBoard, BoardArrow } from '@/components/checkers/CheckersBoard';
import { useAuth } from '@/hooks/useAuth';
import { saveCheckersGame, getUserRating, upsertUserRating } from '@gameexplorer/db';
import type { UserRating } from '@gameexplorer/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

function eloLabel(elo: number): string {
  if (elo < 700)  return 'Beginner';
  if (elo < 900)  return 'Novice';
  if (elo < 1100) return 'Casual';
  if (elo < 1300) return 'Intermediate';
  if (elo < 1500) return 'Skilled';
  if (elo < 1700) return 'Advanced';
  if (elo < 1900) return 'Expert';
  return 'Master';
}

function thinkTimeForElo(elo: number): number {
  if (elo < 700)  return 300;
  if (elo < 1000) return 500;
  if (elo < 1400) return 750;
  if (elo < 1800) return 1000;
  return 1300;
}

function formatMove(move: CheckersGameState['moveHistory'][number]): string {
  if (move.captures.length === 0) return `${move.from}-${move.to}`;
  return move.path.reduce((acc, sq, i) => (i === 0 ? `${move.from}x${sq}` : `${acc}x${sq}`), '');
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatingResult {
  before: number;
  after: number;
  delta: number;
  hintsUsed: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CheckersTrainingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(true);

  const [timeline, setTimeline] = useState<CheckersGameState[]>(() => [CheckersEngine.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  const [hintArrow, setHintArrow] = useState<BoardArrow | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const userRatingRef = useRef(userRating);
  userRatingRef.current = userRating;
  const hintsUsedRef = useRef(hintsUsed);
  hintsUsedRef.current = hintsUsed;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;
  const botElo = Math.min(2000, Math.max(400, userRating?.rating ?? 1200));

  // ── Auth guard ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?next=/checkers/training');
    }
  }, [authLoading, user, router]);

  // ── Load rating ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setRatingLoading(true);
    getUserRating(user.id, 'checkers').then(r => {
      setUserRating(r);
      setRatingLoading(false);
    });
  }, [user]);

  // ── Bot turn trigger ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!gameStarted) return;
    if (liveState.isGameOver) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking) makeBotMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking]);

  // ── Save game + update rating when game ends ──────────────────────────────

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
    if (!current || !user) return;

    const rawDelta = calculateNewRating(current.rating, botElo, outcome, current.games_played) - current.rating;
    const hintPenalty = hintsUsedRef.current * 2;
    const adjustedDelta = rawDelta - hintPenalty;
    const newRating = Math.max(100, current.rating + adjustedDelta);

    Promise.all([
      upsertUserRating(user.id, newRating, outcome, 'checkers'),
      saveCheckersGame(liveState, pc, result, `elo-${botElo}`, user.id, {
        mode: 'rated',
        rating_before: current.rating,
        rating_after: newRating,
      }),
    ]).then(([updatedRating]) => {
      setUserRating(updatedRating);
      setRatingResult({
        before: current.rating,
        after: newRating,
        delta: adjustedDelta,
        hintsUsed: hintsUsedRef.current,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isGameOver]);

  // ── Bot move ──────────────────────────────────────────────────────────────

  const makeBotMove = async () => {
    const currentTimeline = timelineRef.current;
    const wasAtLive = viewIndexRef.current === currentTimeline.length - 1;
    const currentLiveState = currentTimeline[currentTimeline.length - 1];
    const elo = userRatingRef.current?.rating ?? 1200;

    setIsThinking(true);
    try {
      const [move] = await Promise.all([
        new Promise<{ from: string; to: string }>(resolve =>
          setTimeout(() => resolve(getBestCheckersMove(currentLiveState, elo)), 0),
        ),
        new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
      ]);

      const result = CheckersEngine.validateMove(currentLiveState, move.from, move.to);
      if (result.valid && result.resultingState) {
        const next = result.resultingState;
        const newLength = currentTimeline.length + 1;
        setTimeline(prev => [...prev, next]);
        if (wasAtLive) setViewIndex(newLength - 1);
      }
    } catch (err) {
      console.error('Bot error:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = (from: string, to: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver) return;
    if (liveState.currentTurn !== playerColor) return;
    setHintArrow(null);

    const result = CheckersEngine.validateMove(liveState, from, to);
    if (result.valid && result.resultingState) {
      const newIdx = timeline.length;
      setTimeline(prev => [...prev, result.resultingState!]);
      setViewIndex(newIdx);
    }
  };

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = async () => {
    if (isHinting || isThinking || liveState.currentTurn !== playerColor) return;
    if (!isAtLive || liveState.isGameOver) return;

    setIsHinting(true);
    try {
      const move = await new Promise<{ from: string; to: string }>(resolve =>
        setTimeout(() => resolve(getBestCheckersMove(liveState, 2000)), 0),
      );
      setHintsUsed(n => n + 1);
      setHintArrow({ from: move.from, to: move.to });
      setTimeout(() => setHintArrow(null), 3000);
    } catch (err) {
      console.error('Hint error:', err);
    } finally {
      setIsHinting(false);
    }
  };

  // ── Game control ──────────────────────────────────────────────────────────

  const handleNewGame = () => {
    setTimeline([CheckersEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setHintArrow(null);
    setHintsUsed(0);
    setRatingResult(null);
    setGameSaved(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
  };

  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;
  const counts = CheckersEngine.getPieceCounts(displayState);
  const isPlayerTurn = isAtLive && !isThinking && !liveState.isGameOver && liveState.currentTurn === playerColor;

  // ── Loading / auth states ─────────────────────────────────────────────────

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-fg-subtle dark:text-fg-muted">Loading…</div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen pt-16">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/checkers"
            className="inline-flex items-center text-fg-subtle dark:text-fg-muted hover:text-fg-subtle dark:hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg-subtle dark:text-fg mb-2 text-center">
            Training Mode
          </h1>
          <p className="text-fg-subtle dark:text-fg-muted text-center mb-8">
            Play rated games against a bot matched to your skill level
          </p>

          {/* Rating card */}
          <div className="bg-white dark:bg-surface-alt rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-lg font-semibold text-fg-subtle dark:text-fg-muted mb-4 uppercase tracking-wide text-center">
              Your Rating
            </h2>
            {ratingLoading ? (
              <div className="text-center text-fg-muted animate-pulse py-4">Loading…</div>
            ) : (
              <div className="text-center">
                <div className="text-7xl font-bold tabular-nums text-fg-subtle dark:text-fg leading-none mb-2">
                  {userRating?.rating ?? 1200}
                </div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  {eloLabel(userRating?.rating ?? 1200)}
                </div>
                <div className="flex justify-center gap-6 text-sm text-fg-subtle dark:text-fg-muted mt-3">
                  <span>{userRating?.games_played ?? 0} games</span>
                  <span>{userRating?.wins ?? 0}W / {userRating?.losses ?? 0}L / {userRating?.draws ?? 0}D</span>
                  <span>Peak: {userRating?.peak_rating ?? 1200}</span>
                </div>
                {(userRating?.games_played ?? 0) < 30 && (
                  <div className="mt-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5 inline-block">
                    Provisional — higher K-factor until 30 games played ({30 - (userRating?.games_played ?? 0)} remaining)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bot info */}
          <div className="bg-white dark:bg-surface-alt rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-fg-subtle dark:text-fg">Bot Strength</h2>
                <p className="text-sm text-fg-subtle dark:text-fg-muted mt-0.5">
                  Automatically matched to your rating
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-fg-subtle dark:text-fg">{botElo}</div>
                <div className="text-sm text-amber-600 dark:text-amber-400">{eloLabel(botElo)}</div>
              </div>
            </div>
          </div>

          {/* Hint penalty notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6 text-sm text-amber-800 dark:text-amber-300">
            <div className="font-semibold mb-1">💡 Hints available — with a cost</div>
            Each hint shows the best move for 3 seconds but applies a <strong>−2 rating penalty</strong> to your result.
          </div>

          {/* Color selector */}
          <div className="bg-white dark:bg-surface-alt rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-xl font-semibold text-fg-subtle dark:text-fg mb-4">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['white', 'black'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'bg-amber-600 text-white shadow-lg scale-105'
                      : 'bg-surface-hover dark:bg-surface-muted text-fg-subtle dark:text-fg hover:bg-surface-hover dark:hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex justify-center mb-2">
                    <svg width="40" height="40" viewBox="0 0 45 45">
                      <circle cx="23" cy="24.5" r="17" fill={color === 'white' ? '#c8b49a' : '#1a0f08'} opacity="0.35" />
                      <circle cx="22.5" cy="22" r="17" fill={color === 'white' ? '#faf0e0' : '#2c1b08'} stroke={color === 'white' ? '#5c3d1e' : '#e8d5b7'} strokeWidth="1.5" />
                      <ellipse cx="17" cy="16.5" rx="6.5" ry="4.5" fill={color === 'white' ? '#ffffff' : '#5c4033'} opacity="0.35" />
                    </svg>
                  </div>
                  <div className="font-semibold capitalize">{color}</div>
                  <div className={`text-sm ${playerColor === color ? 'text-amber-100' : 'text-fg-subtle dark:text-fg-muted'}`}>
                    {color === 'white' ? 'You move first' : 'Bot moves first'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={ratingLoading}
            className="w-full px-8 py-4 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-on-accent font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start Rated Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────

  const gameOverMsg = liveState.isGameOver
    ? liveState.winner === null
      ? 'Draw — 40 moves without capture'
      : liveState.winner === playerColor
        ? 'You win! 🎉'
        : 'Bot wins'
    : null;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden pt-16">

      {/* Rating result overlay */}
      {ratingResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pt-16">
          <div className="bg-white dark:bg-surface-alt rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            <div className="text-5xl mb-3">
              {ratingResult.delta > 0 ? '🏆' : ratingResult.delta < 0 ? '😞' : '🤝'}
            </div>
            <div className="text-2xl font-bold text-fg-subtle dark:text-fg mb-1">
              {gameOverMsg}
            </div>

            <div className="mt-5 mb-5 p-4 rounded-xl bg-surface-hover dark:bg-surface-muted">
              <div className="flex items-center justify-center gap-3">
                <span className="text-fg-subtle dark:text-fg-muted text-sm">Rating</span>
                <span className="text-xl font-bold text-fg-subtle dark:text-fg">{ratingResult.before}</span>
                <svg className="w-5 h-5 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                <span className="text-xl font-bold text-fg-subtle dark:text-fg">{ratingResult.after}</span>
                <span className={`text-lg font-bold ${ratingResult.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {ratingResult.delta >= 0 ? '+' : ''}{ratingResult.delta}
                </span>
              </div>
              {ratingResult.hintsUsed > 0 && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  💡 {ratingResult.hintsUsed} hint{ratingResult.hintsUsed > 1 ? 's' : ''} used (−{ratingResult.hintsUsed * 2} pts)
                </div>
              )}
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
                className="w-full px-4 py-2.5 bg-surface-hover dark:bg-surface-hover hover:bg-surface-hover dark:hover:bg-surface-hover text-fg-subtle dark:text-fg font-semibold rounded-lg transition-colors text-sm block"
              >
                Back to Checkers
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-border-strong dark:border-border bg-white/50 dark:bg-surface-alt/50">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            href="/checkers"
            className="inline-flex items-center text-fg-subtle dark:text-fg-muted hover:text-fg-subtle dark:hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>

          <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-surface-muted rounded-full shadow-sm border border-border-strong dark:border-border-strong">
            <span className="text-xs text-fg-subtle dark:text-fg-muted">Rating</span>
            <span className="text-sm font-bold text-fg-subtle dark:text-fg">{userRating?.rating ?? 1200}</span>
          </div>

          <div className="flex items-center gap-3">
            {isThinking && (
              <span className="text-sm text-fg-subtle dark:text-fg-muted animate-pulse">Bot thinking…</span>
            )}
            {!isAtLive && (
              <button
                onClick={() => setViewIndex(timeline.length - 1)}
                className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-on-accent rounded-lg transition-colors font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors text-sm"
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
                  arrows={hintArrow ? [hintArrow] : undefined}
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* Info card */}
              <div className="shrink-0 bg-white dark:bg-surface-alt rounded-xl shadow-sm border border-border-strong dark:border-border p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-fg-subtle dark:text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg-subtle dark:text-fg">
                      {botElo}
                      <span className="text-xs font-normal text-fg-subtle dark:text-fg-muted ml-1">({eloLabel(botElo)})</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-subtle dark:text-fg-muted">Playing:</span>
                    <span className="font-semibold text-fg-subtle dark:text-fg capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-subtle dark:text-fg-muted">Turn:</span>
                    <span className="font-semibold text-fg-subtle dark:text-fg capitalize">
                      {liveState.isGameOver ? '—' : liveState.currentTurn}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-subtle dark:text-fg-muted">Hints:</span>
                    <span className="font-semibold text-fg-subtle dark:text-fg">
                      {hintsUsed}
                      {hintsUsed > 0 && (
                        <span className="text-xs font-normal text-amber-500 ml-1">(−{hintsUsed * 2} pts)</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Piece counts */}
                <div className="mt-2 pt-2 border-t border-border-strong dark:border-border-strong flex justify-around text-xs">
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#faf0e0" stroke="#5c3d1e" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg-subtle dark:text-fg">{counts.white}</span>
                  </div>
                  <div className="text-fg-muted">vs</div>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#2c1b08" stroke="#e8d5b7" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg-subtle dark:text-fg">{counts.black}</span>
                  </div>
                </div>

                {gameOverMsg && (
                  <div className="mt-2 pt-2 border-t border-border-strong dark:border-border-strong text-sm font-semibold text-center text-amber-700 dark:text-amber-300">
                    {gameOverMsg}
                  </div>
                )}
              </div>

              {/* Hint button */}
              {!gameOverMsg && (
                <button
                  onClick={handleHint}
                  disabled={!isPlayerTurn || isHinting}
                  className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border ${
                    isPlayerTurn && !isHinting
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      : 'bg-surface-hover dark:bg-surface-muted border-border-strong dark:border-border-strong text-fg-muted dark:text-fg-subtle cursor-not-allowed'
                  }`}
                >
                  <span>💡</span>
                  <span>{isHinting ? 'Thinking…' : 'Show Hint'}</span>
                  <span className="text-xs opacity-70">−2 pts</span>
                </button>
              )}

              {/* Move list */}
              <div className="flex-1 min-h-0 bg-white dark:bg-surface-alt rounded-xl shadow-sm border border-border-strong dark:border-border flex flex-col">
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-border-strong dark:border-border-strong">
                  <span className="text-xs font-semibold text-fg-subtle dark:text-fg-muted uppercase tracking-wide">Moves</span>
                  <div className="flex gap-1">
                    {[
                      { label: '⇤', action: () => setViewIndex(0), disabled: !canGoBack },
                      { label: '←', action: () => setViewIndex(i => Math.max(0, i - 1)), disabled: !canGoBack },
                      { label: '→', action: () => setViewIndex(i => Math.min(timeline.length - 1, i + 1)), disabled: !canGoForward },
                      { label: '⇥', action: () => setViewIndex(timeline.length - 1), disabled: !canGoForward },
                    ].map(({ label, action, disabled }) => (
                      <button
                        key={label}
                        onClick={action}
                        disabled={disabled}
                        className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-surface-hover dark:bg-surface-muted text-fg-subtle dark:text-fg-muted hover:bg-surface-hover dark:hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
                  {liveState.moveHistory.length === 0 ? (
                    <p className="text-fg-muted dark:text-fg-subtle text-xs text-center py-4">
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
                              <span className="text-fg-muted dark:text-fg-subtle w-7 shrink-0 text-right pr-1">
                                {moveNum}.
                              </span>
                            )}
                            {!isWhiteMove && <span className="w-7 shrink-0" />}
                            <button
                              onClick={() => setViewIndex(stateIdx)}
                              className={`flex-1 text-left px-2 py-0.5 rounded transition-colors truncate ${
                                isActive
                                  ? 'bg-amber-600 text-white font-semibold'
                                  : 'text-fg-subtle dark:text-fg-muted hover:bg-surface-hover dark:hover:bg-surface-muted'
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
