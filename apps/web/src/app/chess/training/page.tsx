'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChessEngine,
  ChessGameState,
  Position,
  PieceType,
  calculateNewRating,
  GameOutcome,
} from '@gameexplorer/shared';
import { ChessBoard, BoardArrow } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useStockfish, thinkTimeForElo } from '@/hooks/useStockfish';
import { useChessAudio } from '@/hooks/useChessAudio';
import { useAuth } from '@/hooks/useAuth';
import { saveGame, getUserRating, upsertUserRating } from '@gameexplorer/db';
import type { UserRating } from '@gameexplorer/db';

// ── Helpers ──────────────────────────────────────────────────────────────────

function eloLabel(elo: number): string {
  if (elo < 600)  return 'Beginner';
  if (elo < 800)  return 'Novice';
  if (elo < 1000) return 'Casual';
  if (elo < 1200) return 'Club Player';
  if (elo < 1400) return 'Intermediate';
  if (elo < 1600) return 'Competitive';
  if (elo < 1800) return 'Advanced';
  if (elo < 2000) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2400) return 'FIDE Master';
  if (elo < 2600) return 'International Master';
  return 'Grandmaster';
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatingResult {
  before: number;
  after: number;
  delta: number;
  hintsUsed: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChessTrainingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(true);

  const [timeline, setTimeline] = useState<ChessGameState[]>(() => [ChessEngine.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);

  // Hint state
  const [hintArrow, setHintArrow] = useState<BoardArrow | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  // Post-game overlay
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [gameSaved, setGameSaved] = useState(false);

  const stockfish = useStockfish();
  const { playCheck, playCheckmate } = useChessAudio();

  // Stable refs for async callbacks
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const userRatingRef = useRef(userRating);
  userRatingRef.current = userRating;
  const hintsUsedRef = useRef(hintsUsed);
  hintsUsedRef.current = hintsUsed;

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;
  const botElo = userRating?.rating ?? 1200;

  // ── Auth guard ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?next=/chess/training');
    }
  }, [authLoading, user, router]);

  // ── Load rating ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setRatingLoading(true);
    getUserRating(user.id, 'chess').then(r => {
      setUserRating(r);
      setRatingLoading(false);
    });
  }, [user]);

  // ── Bot turn trigger ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!gameStarted) return;
    if (liveState.isCheckmate || liveState.isStalemate || liveState.isDraw) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking && stockfish.isReady) {
      makeBotMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, stockfish.isReady]);

  // ── Save game + update rating when game ends ──────────────────────────────

  useEffect(() => {
    if (!gameStarted || gameSaved) return;

    let outcome: GameOutcome | null = null;
    if (liveState.isCheckmate) {
      const winnerIsPlayer = liveState.currentTurn !== playerColor;
      outcome = winnerIsPlayer ? 'win' : 'loss';
    } else if (liveState.isStalemate || liveState.isDraw) {
      outcome = 'draw';
    }

    if (!outcome || !user) return;

    setGameSaved(true); // prevent double-fire

    const current = userRatingRef.current;
    if (!current) return;

    const rawDelta = calculateNewRating(current.rating, botElo, outcome, current.games_played) - current.rating;
    const hintPenalty = hintsUsedRef.current * 2;
    const adjustedDelta = rawDelta - hintPenalty;
    const newRating = Math.max(100, current.rating + adjustedDelta);

    const result: 'white' | 'black' | 'draw' =
      outcome === 'draw' ? 'draw' : liveState.currentTurn !== playerColor ? playerColor : (playerColor === 'white' ? 'black' : 'white');

    Promise.all([
      upsertUserRating(user.id, newRating, outcome, 'chess'),
      saveGame(
        liveState,
        playerColor,
        result,
        `elo-${botElo}`,
        user.id,
        { mode: 'rated', rating_before: current.rating, rating_after: newRating },
      ),
    ]).then(([updatedRating, savedGame]) => {
      setUserRating(updatedRating);
      setSavedGameId(savedGame?.id ?? null);
      setRatingResult({
        before: current.rating,
        after: newRating,
        delta: adjustedDelta,
        hintsUsed: hintsUsedRef.current,
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isCheckmate, liveState.isStalemate, liveState.isDraw]);

  // ── Bot move ──────────────────────────────────────────────────────────────

  const makeBotMove = async () => {
    const currentTimeline = timelineRef.current;
    const wasAtLive = viewIndexRef.current === currentTimeline.length - 1;
    const currentLiveState = currentTimeline[currentTimeline.length - 1];
    const elo = userRatingRef.current?.rating ?? 1200;

    setIsThinking(true);
    try {
      const [move] = await Promise.all([
        stockfish.getBestMove(currentLiveState, elo),
        new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
      ]);

      if (move) {
        const result = ChessEngine.validateMove(
          currentLiveState,
          move.from,
          move.to,
          false,
          move.promotion as PieceType | undefined,
        );
        if (result.valid && result.resultingState) {
          const next = result.resultingState;
          const newLength = currentTimeline.length + 1;
          setTimeline(prev => [...prev, next]);
          if (wasAtLive) setViewIndex(newLength - 1);
          if (next.isCheckmate) playCheckmate();
          else if (next.isCheck) playCheck();
        }
      }
    } catch (err) {
      console.error('Bot error:', err);
    } finally {
      setIsThinking(false);
    }
  };

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (!isAtLive || isThinking) return;
    if (liveState.currentTurn !== playerColor) return;
    setHintArrow(null); // clear hint on move

    const result = ChessEngine.validateMove(liveState, from, to, false, promotionPiece);
    if (result.valid && result.resultingState) {
      const next = result.resultingState;
      const newIdx = timeline.length;
      setTimeline(prev => [...prev, next]);
      setViewIndex(newIdx);
      if (next.isCheckmate) playCheckmate();
      else if (next.isCheck) playCheck();
    }
  };

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = async () => {
    if (isHinting || isThinking || liveState.currentTurn !== playerColor) return;
    if (!isAtLive) return;

    setIsHinting(true);
    try {
      // Ask Stockfish at player's rating + 200 (good moves, not perfect)
      const hintElo = Math.min(3000, botElo + 200);
      const move = await stockfish.getBestMove(liveState, hintElo);
      if (move) {
        setHintsUsed(n => n + 1);
        setHintArrow({ from: move.from as Position, to: move.to as Position });
        // Auto-clear after 3 seconds
        setTimeout(() => setHintArrow(null), 3000);
      }
    } catch (err) {
      console.error('Hint error:', err);
    } finally {
      setIsHinting(false);
    }
  };

  // ── Game control ──────────────────────────────────────────────────────────

  const handleNewGame = () => {
    setTimeline([ChessEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setHintArrow(null);
    setHintsUsed(0);
    setRatingResult(null);
    setSavedGameId(null);
    setGameSaved(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
    if (playerColor === 'black') {
      setTimeout(() => makeBotMove(), 500);
    }
  };

  const movePairs = buildMovePairs(timeline);
  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;

  // ── Loading / auth states ─────────────────────────────────────────────────

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 pt-16 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading…</div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 pt-16">
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

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-2 text-center">
            Training Mode
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8">
            Play rated games against a bot matched to your skill level
          </p>

          {/* Rating card */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-4 uppercase tracking-wide text-center">
              Your Rating
            </h2>
            {ratingLoading ? (
              <div className="text-center text-slate-400 animate-pulse py-4">Loading…</div>
            ) : (
              <div className="text-center">
                <div className="text-7xl font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-none mb-2">
                  {userRating?.rating ?? 1200}
                </div>
                <div className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-1">
                  {eloLabel(userRating?.rating ?? 1200)}
                </div>
                <div className="flex justify-center gap-6 text-sm text-slate-500 dark:text-slate-400 mt-3">
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
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Bot Strength</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatically matched to your rating
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{botElo}</div>
                <div className="text-sm text-blue-600 dark:text-blue-400">{eloLabel(botElo)}</div>
              </div>
            </div>
          </div>

          {/* Hint penalty notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6 text-sm text-amber-800 dark:text-amber-300">
            <div className="font-semibold mb-1">💡 Hints available — with a cost</div>
            Each hint reveals the best move for 3 seconds but applies a <strong>−2 rating penalty</strong> to your result.
          </div>

          {/* Color selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100 mb-4">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['white', 'black'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'bg-blue-600 text-white shadow-lg scale-105'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <div className="text-4xl mb-2">{color === 'white' ? '♔' : '♚'}</div>
                  <div className="font-semibold capitalize">{color}</div>
                  <div className={`text-sm ${playerColor === color ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                    {color === 'white' ? 'You move first' : 'Bot moves first'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={ratingLoading}
            className="w-full px-8 py-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start Rated Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────

  const gameOverMsg = liveState.isCheckmate
    ? `Checkmate — ${liveState.currentTurn === 'white' ? 'Black' : 'White'} wins`
    : liveState.isStalemate ? 'Stalemate — Draw'
    : liveState.isDraw ? 'Draw'
    : null;

  const isPlayerTurn = isAtLive && !isThinking && liveState.currentTurn === playerColor;

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 overflow-hidden pt-16">

      {/* Rating result overlay */}
      {ratingResult && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pt-16">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
            {/* Outcome */}
            <div className="text-5xl mb-3">
              {ratingResult.delta > 0 ? '🏆' : ratingResult.delta < 0 ? '😞' : '🤝'}
            </div>
            <div className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-1">
              {gameOverMsg}
            </div>

            {/* Rating change */}
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
              {ratingResult.hintsUsed > 0 && (
                <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  💡 {ratingResult.hintsUsed} hint{ratingResult.hintsUsed > 1 ? 's' : ''} used (−{ratingResult.hintsUsed * 2} pts)
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-2">
              {savedGameId && (
                <Link
                  href={`/chess/analysis?gameId=${savedGameId}`}
                  className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Analyze Game
                </Link>
              )}
              <button
                onClick={handleNewGame}
                className="w-full px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Play Again
              </button>
              <Link
                href="/chess"
                className="w-full px-4 py-2.5 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-800 dark:text-slate-100 font-semibold rounded-lg transition-colors text-sm"
              >
                Back to Chess
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
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

          {/* Rating badge */}
          <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-slate-700 rounded-full shadow-sm border border-slate-200 dark:border-slate-600">
            <span className="text-xs text-slate-500 dark:text-slate-400">Rating</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{userRating?.rating ?? 1200}</span>
          </div>

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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              New Game
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="container mx-auto h-full px-4 py-4">
          <div className="grid grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[1fr_380px] lg:grid-rows-1 gap-4 h-full max-h-full">

            {/* Board */}
            <div className="flex items-center justify-center min-h-0">
              <div className="w-full max-w-150">
                <ChessBoard
                  gameState={displayState}
                  onMove={handleMove}
                  playerColor={playerColor}
                  showCoordinates={true}
                  arrows={hintArrow ? [hintArrow] : undefined}
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
                      {botElo}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                        ({eloLabel(botElo)})
                      </span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Playing:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Turn:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{liveState.currentTurn}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Hints:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {hintsUsed}
                      {hintsUsed > 0 && (
                        <span className="text-xs font-normal text-amber-500 ml-1">(−{hintsUsed * 2} pts)</span>
                      )}
                    </span>
                  </div>
                </div>
                {gameOverMsg && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-semibold text-center text-amber-700 dark:text-amber-300">
                    {gameOverMsg}
                  </div>
                )}
              </div>

              {/* Hint button — only shown on player's turn, game not over */}
              {!gameOverMsg && (
                <button
                  onClick={handleHint}
                  disabled={!isPlayerTurn || isHinting}
                  className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border ${
                    isPlayerTurn && !isHinting
                      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                      : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>💡</span>
                  <span>{isHinting ? 'Thinking…' : 'Show Hint'}</span>
                  <span className="text-xs opacity-70">−2 pts</span>
                </button>
              )}

              {/* Move list */}
              <ChessMoveList
                className="flex-1 min-h-0"
                movePairs={movePairs}
                currentIndex={viewIndex}
                onJump={setViewIndex}
                onFirst={() => setViewIndex(0)}
                onPrev={() => setViewIndex(i => Math.max(0, i - 1))}
                onNext={() => setViewIndex(i => Math.min(timeline.length - 1, i + 1))}
                onLast={() => setViewIndex(timeline.length - 1)}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                emptyMessage="No moves yet — make your first move"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
