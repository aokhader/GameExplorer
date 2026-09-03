'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChessGameState,
  Position,
  PieceType,
  calculateNewRating,
  GameOutcome,
  summarizeMaterial,
} from '@finesse/shared';
import { ChessBoard, BoardArrow } from '@/components/chess/ChessBoard';
import { ChessPiece } from '@finesse/ui';
import '@/components/chess/ChessBoard.css';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useChessEngine } from '@/hooks/useChessEngine';
import { useStockfish, thinkTimeForElo, STOCKFISH_MIN_ELO } from '@/hooks/useStockfish';
import { useAuth } from '@/hooks/useAuth';
import { saveGame, getUserRating, upsertUserRating } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { PlayerCard } from '@/components/game/PlayerCard';
import { CapturedTray } from '@/components/game/CapturedTray';
import { GameActions } from '@/components/game/GameActions';
import { StatusBanner } from '@/components/game/StatusBanner';
import { Button } from '@/components/ui';

// GameResultScreen pulls in canvas-confetti + a framer-motion tree but only
// renders at game end — load it lazily so it stays out of the initial route
// chunk (smaller first-load JS / faster first navigation to this page).
const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then(m => m.GameResultScreen),
  { ssr: false },
);

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

  // Worker owns the canonical game state; all move validation and the weak
  // bot's minimax run off the main thread (same architecture as /chess/bot).
  const { gameState: liveState, legalMoves: legalMovesMap, isReady: engineReady, makeMove, getBotMove, reset } = useChessEngine();

  // Timeline for replay — grows as the worker confirms each move.
  const [timeline, setTimeline] = useState<ChessGameState[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  // Player-initiated end (½ Draw / Resign) — still applies the rated outcome.
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);

  // Hint state
  const [hintArrow, setHintArrow] = useState<BoardArrow | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  // View only — which colour sits at the bottom. Never changes what you own.
  const [flipped, setFlipped] = useState(false);

  // Post-game overlay
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [savedGameId, setSavedGameId] = useState<string | null>(null);
  const [gameSaved, setGameSaved] = useState(false);

  // Defer Stockfish (and its ~7 MB WASM download) until the game actually
  // starts — no need to load the engine on the rating/setup screen. Bots
  // below STOCKFISH_MIN_ELO never need it at all (they run in the engine worker).
  const stockfish = useStockfish({ enabled: gameStarted });

  // Tracks whether a bot MAKE_MOVE is in flight so we clear isThinking only
  // when the worker confirms, not when makeMove() posts the message.
  const botMovePendingRef = useRef(false);

  // Stable refs for async callbacks
  const liveStateRef = useRef(liveState);
  liveStateRef.current = liveState;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const userRatingRef = useRef(userRating);
  userRatingRef.current = userRating;
  const hintsUsedRef = useRef(hintsUsed);
  hintsUsedRef.current = hintsUsed;
  const manualEndRef = useRef(manualEnd);
  manualEndRef.current = manualEnd;

  const displayState = timeline[viewIndex] ?? liveState;
  const isAtLive = timeline.length === 0 || viewIndex === timeline.length - 1;
  const botElo = userRating?.rating ?? 1200;

  // Capture trays follow the board being LOOKED at, so stepping back rewinds them.
  const botColor = playerColor === 'white' ? 'black' : 'white';
  const material = summarizeMaterial(displayState);
  const whiteLead = material.advantage;
  const orientation = flipped ? botColor : playerColor;

  // ── Sync confirmed worker state → timeline ────────────────────────────────

  useEffect(() => {
    if (!engineReady) return;
    setTimeline(prev => {
      if (prev.length === 0) {
        // First STATE_UPDATE after mount or after reset.
        return [liveState];
      }
      const last = prev[prev.length - 1];
      if (liveState.moveHistory.length > last.moveHistory.length) {
        // New confirmed move — append and advance viewIndex if user was at live.
        const newLen = prev.length + 1;
        setViewIndex(vi => (vi === prev.length - 1 ? newLen - 1 : vi));

        // Clear thinking flag once the bot move is confirmed by the worker.
        if (botMovePendingRef.current && liveState.currentTurn === playerColorRef.current) {
          botMovePendingRef.current = false;
          setIsThinking(false);
        }

        return [...prev, liveState];
      }
      if (liveState.moveHistory.length === 0 && last.moveHistory.length > 0) {
        // Reset — replace timeline with fresh initial state.
        setViewIndex(0);
        return [liveState];
      }
      return prev;
    });
  }, [engineReady, liveState]);

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
    if (!gameStarted || !engineReady) return;
    // Weak bots (< STOCKFISH_MIN_ELO) run in the chess-engine worker and don't
    // need Stockfish; only wait on it when the matched ELO actually uses it.
    if (botElo >= STOCKFISH_MIN_ELO && !stockfish.isReady) return;
    if (liveState.isCheckmate || liveState.isStalemate || liveState.isDraw || manualEnd) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking) {
      makeBotMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, stockfish.isReady, engineReady, botElo, manualEnd]);

  // ── Save game + update rating when game ends ──────────────────────────────

  useEffect(() => {
    if (!gameStarted || gameSaved) return;

    let outcome: GameOutcome | null = null;
    if (manualEnd === 'resign') {
      outcome = 'loss';
    } else if (manualEnd === 'draw') {
      outcome = 'draw';
    } else if (liveState.isCheckmate) {
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
      outcome === 'draw' ? 'draw' : outcome === 'win' ? playerColor : (playerColor === 'white' ? 'black' : 'white');

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
  }, [liveState.isCheckmate, liveState.isStalemate, liveState.isDraw, manualEnd]);

  // ── Bot move ──────────────────────────────────────────────────────────────

  const makeBotMove = async () => {
    const elo = userRatingRef.current?.rating ?? 1200;

    setIsThinking(true);
    botMovePendingRef.current = true;
    try {
      let move: { from: Position; to: Position; promotion?: PieceType };
      if (elo < STOCKFISH_MIN_ELO) {
        // Weak engine runs inside the chess engine worker — zero main-thread cost.
        [move] = await Promise.all([
          getBotMove(elo),
          new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
        ]);
      } else {
        // Stockfish runs in its own worker; we just need the current position.
        [move] = await Promise.all([
          stockfish.getBestMove(liveStateRef.current, elo),
          new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
        ]);
      }

      // Dropped if the player resigned / agreed a draw while the bot thought.
      if (manualEndRef.current) {
        botMovePendingRef.current = false;
        setIsThinking(false);
        return;
      }

      // Post the move to the chess engine worker for validation + state update.
      // isThinking is cleared in the timeline sync effect when the worker confirms.
      makeMove(move.from as Position, move.to as Position, move.promotion as PieceType | undefined);
    } catch (err) {
      console.error('Bot error:', err);
      botMovePendingRef.current = false;
      setIsThinking(false);
    }
  };

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (!isAtLive || isThinking || !engineReady || manualEnd) return;
    if (liveState.currentTurn !== playerColor) return;
    setHintArrow(null); // clear hint on move

    // Post to worker — returns immediately; validation runs off main thread.
    makeMove(from, to, promotionPiece);
  };

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = async () => {
    if (isHinting || isThinking || liveState.currentTurn !== playerColor) return;
    if (!isAtLive) return;

    setIsHinting(true);
    try {
      // Ask the engine at player's rating + 200 (good moves, not perfect).
      // Weak strengths run in the chess engine worker; Stockfish covers 1400+.
      const hintElo = Math.min(3000, botElo + 200);
      const move = hintElo < STOCKFISH_MIN_ELO
        ? await getBotMove(hintElo)
        : await stockfish.getBestMove(liveState, hintElo);
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

  // Resign / agree a draw — ends the game now; the save effect applies the
  // rated outcome exactly as it would for a checkmate or stalemate.
  const endManually = (kind: 'resign' | 'draw') => {
    if (manualEnd || liveState.isCheckmate || liveState.isStalemate || liveState.isDraw) return;
    setManualEnd(kind);
    setIsThinking(false);
    botMovePendingRef.current = false;
    setHintArrow(null);
  };

  const handleNewGame = () => {
    setTimeline([]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setHintArrow(null);
    setHintsUsed(0);
    setRatingResult(null);
    setSavedGameId(null);
    setGameSaved(false);
    botMovePendingRef.current = false;
    reset(); // worker resets to newGame() and broadcasts STATE_UPDATE
  };

  const handleStartGame = () => {
    // When the player is black the bot-turn effect fires the first move once
    // the required engine is ready — no manual kick-off needed.
    setGameStarted(true);
  };

  const movePairs = buildMovePairs(timeline);
  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;

  // ── Loading / auth states ─────────────────────────────────────────────────

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-fg-muted">Loading…</div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen page-glow-chess">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/chess"
            className="inline-flex items-center text-fg-muted hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg mb-2 text-center">
            Training Mode
          </h1>
          <p className="text-fg-muted text-center mb-8">
            Play rated games against a bot matched to your skill level
          </p>

          {/* Rating card */}
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-lg font-semibold text-fg-muted mb-4 uppercase tracking-wide text-center">
              Your Rating
            </h2>
            {ratingLoading ? (
              <div className="text-center text-fg-muted animate-pulse py-4">Loading…</div>
            ) : (
              <div className="text-center">
                <div className="font-display text-7xl font-bold tabular-nums text-fg leading-none mb-2">
                  {userRating?.rating ?? 1200}
                </div>
                <div className="text-lg font-semibold text-accent mb-1">
                  {eloLabel(userRating?.rating ?? 1200)}
                </div>
                <div className="flex justify-center gap-6 text-sm text-fg-muted mt-3">
                  <span>{userRating?.games_played ?? 0} games</span>
                  <span>{userRating?.wins ?? 0}W / {userRating?.losses ?? 0}L / {userRating?.draws ?? 0}D</span>
                  <span>Peak: {userRating?.peak_rating ?? 1200}</span>
                </div>
                {(userRating?.games_played ?? 0) < 30 && (
                  <div className="mt-3 text-xs text-warning-hover bg-warning/10 border border-warning/30 rounded-lg px-3 py-1.5 inline-block">
                    Provisional — higher K-factor until 30 games played ({30 - (userRating?.games_played ?? 0)} remaining)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bot info */}
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-fg">Bot Strength</h2>
                <p className="text-sm text-fg-muted mt-0.5">
                  Automatically matched to your rating
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-fg">{botElo}</div>
                <div className="text-sm text-accent">{eloLabel(botElo)}</div>
              </div>
            </div>
          </div>

          {/* Hint penalty notice */}
          <div className="bg-warning/10 border border-warning/35 rounded-xl p-4 mb-6 text-sm text-warning-hover">
            <div className="font-semibold mb-1">💡 Hints available — with a cost</div>
            Each hint reveals the best move for 3 seconds but applies a <strong>−2 rating penalty</strong> to your result.
          </div>

          {/* Color selector */}
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-xl font-semibold text-fg mb-4">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['white', 'black'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'border border-transparent bg-accent [background-image:var(--gradient-accent)] text-on-accent [box-shadow:var(--shadow-glow-accent)] scale-105'
                      : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                  }`}
                >
                  <div className="flex justify-center mb-2"><ChessPiece type="king" color={color} size={40} /></div>
                  <div className="font-semibold capitalize">{color}</div>
                  <div className={`text-sm ${playerColor === color ? 'text-on-accent/80' : 'text-fg-muted'}`}>
                    {color === 'white' ? 'You move first' : 'Bot moves first'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartGame}
            disabled={ratingLoading}
            className="w-full px-8 py-4 rounded-xl bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-lg [box-shadow:var(--shadow-glow-accent)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Start Rated Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────

  const gameOverMsg = manualEnd === 'resign'
    ? 'You resigned'
    : manualEnd === 'draw' ? 'Draw by agreement'
    : liveState.isCheckmate
    ? `Checkmate — ${liveState.currentTurn === 'white' ? 'Black' : 'White'} wins`
    : liveState.isStalemate ? 'Stalemate — Draw'
    : liveState.isDraw ? 'Draw'
    : null;

  const isPlayerTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;

  // Player-relative result for the celebration screen.
  const myResult: GameResult = manualEnd === 'resign'
    ? 'loss'
    : manualEnd === 'draw' ? 'draw'
    : liveState.isCheckmate
    ? ((liveState.currentTurn === 'white' ? 'black' : 'white') === playerColor ? 'win' : 'loss')
    : 'draw';

  return (
    <>
      <GameScreenLayout
        accent="chess"
        backHref="/chess"
        headerCenter={
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className="text-xs text-fg-muted">Rating</span>
            <span className="text-sm font-bold text-fg">{userRating?.rating ?? 1200}</span>
          </div>
        }
        headerActions={
          <>
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
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
            >
              New Game
            </button>
          </>
        }
        topCard={
          <PlayerCard
            name="Bot"
            initial="B"
            active={isThinking}
            subline={isThinking ? `${botElo} · thinking…` : `${botElo} · ${eloLabel(botElo)}`}
            captured={
              <CapturedTray
                pieces={material[botColor]}
                color={playerColor}
                advantage={botColor === 'white' ? whiteLead : -whiteLead}
                ownerLabel="Bot"
              />
            }
          />
        }
        board={
          <ChessBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            orientation={orientation}
            showCoordinates={true}
            // Worker-precomputed legal moves — piece taps are O(1) lookups
            // instead of a synchronous getAllLegalMoves scan.
            legalMovesMap={isAtLive && !isThinking ? legalMovesMap : undefined}
            arrows={hintArrow ? [hintArrow] : undefined}
          />
        }
        bottomCard={
          <PlayerCard
            name="You"
            initial="Y"
            isYou
            active={isPlayerTurn}
            subline={`Playing ${playerColor}${isPlayerTurn ? ' · your move' : ''}`}
            captured={
              <CapturedTray
                pieces={material[playerColor]}
                color={botColor}
                advantage={playerColor === 'white' ? whiteLead : -whiteLead}
                ownerLabel="You"
              />
            }
          />
        }
        sidebar={
          <>
            {/* Turn / result status — the accent banner from the design. */}
            <StatusBanner
              accent="chess"
              title={
                gameOverMsg ?? (isThinking ? 'Bot is thinking…' : isPlayerTurn ? 'Your move' : 'Reviewing history')
              }
              description={gameOverMsg ? undefined : isPlayerTurn ? 'Rated game — hints cost 2 points each.' : undefined}
            />

            {/* Game facts */}
            <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Bot:</span>
                  <span className="font-semibold text-fg">
                    {botElo}
                    <span className="text-xs font-normal text-fg-muted ml-1">
                      ({eloLabel(botElo)})
                    </span>
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Playing:</span>
                  <span className="font-semibold text-fg capitalize">{playerColor}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Turn:</span>
                  <span className="font-semibold text-fg capitalize">{liveState.currentTurn}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Hints:</span>
                  <span className="font-semibold text-fg">
                    {hintsUsed}
                    {hintsUsed > 0 && (
                      <span className="text-xs font-normal text-warning-hover ml-1">(−{hintsUsed * 2} pts)</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Hint button — only shown on player's turn, game not over */}
            {!gameOverMsg && (
              <button
                onClick={handleHint}
                disabled={!isPlayerTurn || isHinting}
                className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all border ${
                  isPlayerTurn && !isHinting
                    ? 'bg-warning/15 border-warning/40 text-warning-hover hover:bg-warning/25'
                    : 'bg-white/5 border-white/10 text-fg-subtle cursor-not-allowed'
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

            {/* ½ Draw / Resign — as in the design's in-game sidebar. */}
            <GameActions
              className="shrink-0"
              onDraw={() => endManually('draw')}
              onResign={() => endManually('resign')}
              onFlip={() => setFlipped(f => !f)}
              disabled={!!gameOverMsg}
            />
          </>
        }
      />

      <GameResultScreen
        open={!!ratingResult}
        result={myResult}
        title={gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        hintsUsed={ratingResult?.hintsUsed}
        actions={
          <>
            {savedGameId && (
              <Link
                href={`/chess/analysis?gameId=${savedGameId}`}
                className="inline-flex items-center justify-center h-11 px-6 rounded-lg font-semibold bg-accent [background-image:var(--gradient-accent)] text-on-accent hover:[box-shadow:var(--shadow-glow-accent)] transition-shadow"
              >
                Analyze Game
              </Link>
            )}
            <Button size="lg" fullWidth onClick={handleNewGame}>
              Play Again
            </Button>
            <Link
              href="/chess"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg font-semibold bg-surface-muted hover:bg-surface-hover text-fg transition-colors"
            >
              Back to Chess
            </Link>
          </>
        }
      />
    </>
  );
}
