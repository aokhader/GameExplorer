'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ReversiEngine,
  ReversiGameState,
  ReversiColor,
  getBestReversiMove,
  calculateNewRating,
  GameOutcome,
} from '@gameexplorer/shared';
import { ReversiBoard } from '@/components/reversi/ReversiBoard';
import { DiscCountBar } from '@/components/reversi/DiscCountBar';
import { useAuth } from '@/hooks/useAuth';
import { saveReversiGame, getUserRating, upsertUserRating } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { PlayerCard } from '@/components/game/PlayerCard';
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
  if (elo < 700)  return 350;
  if (elo < 1000) return 550;
  if (elo < 1400) return 800;
  if (elo < 1800) return 1100;
  return 1400;
}

function formatMoveNotation(move: ReversiGameState['moveHistory'][number]): string {
  return move.position ?? '—';
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface RatingResult {
  before: number;
  after: number;
  delta: number;
  hintsUsed: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReversiTrainingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(true);

  const [timeline, setTimeline] = useState<ReversiGameState[]>(() => [ReversiEngine.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [playerColor, setPlayerColor] = useState<ReversiColor>('black');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [passMsg, setPassMsg] = useState<string | null>(null);

  const [hintPos, setHintPos] = useState<string | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // Player-initiated end — reversi has no draw offers, so resign only.
  const [manualEnd, setManualEnd] = useState<'resign' | null>(null);

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
  const manualEndRef = useRef(manualEnd);
  manualEndRef.current = manualEnd;

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;
  const botElo = Math.min(2000, Math.max(400, userRating?.rating ?? 1200));

  const lastMove = liveState.moveHistory[liveState.moveHistory.length - 1];
  const lastPlacedPos = lastMove?.position ?? null;

  // ── Auth guard ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin?next=/reversi/training');
    }
  }, [authLoading, user, router]);

  // ── Load rating ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    setRatingLoading(true);
    getUserRating(user.id, 'reversi').then(r => {
      setUserRating(r);
      setRatingLoading(false);
    });
  }, [user]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const appendState = useCallback((next: ReversiGameState) => {
    setTimeline(prev => {
      const wasAtLive = viewIndexRef.current === prev.length - 1;
      const updated = [...prev, next];
      if (wasAtLive) setViewIndex(updated.length - 1);
      return updated;
    });
  }, []);

  // ── Bot move ──────────────────────────────────────────────────────────────

  const makeBotMove = useCallback(async () => {
    const currentLive = timelineRef.current[timelineRef.current.length - 1];
    const elo = userRatingRef.current?.rating ?? 1200;

    setIsThinking(true);
    try {
      const [move] = await Promise.all([
        new Promise<{ position: string }>(resolve =>
          setTimeout(() => resolve(getBestReversiMove(currentLive, elo)), 0),
        ),
        new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
      ]);
      // Dropped if the player resigned while the bot was thinking.
      if (manualEndRef.current) return;
      const result = ReversiEngine.validateMove(currentLive, move.position);
      if (result.valid && result.resultingState) {
        appendState(result.resultingState);
      }
    } catch (err) {
      console.error('Bot error:', err);
    } finally {
      setIsThinking(false);
    }
  }, [appendState]);

  // ── Main turn effect — bot moves and auto-passes ──────────────────────────

  useEffect(() => {
    if (!gameStarted || liveState.isGameOver || isThinking || manualEnd) return;

    const isBotTurn = liveState.currentTurn !== playerColor;
    const currentMoves = ReversiEngine.getAllLegalMoves(liveState);
    const mustPass = currentMoves.length === 0;

    if (mustPass) {
      const who = isBotTurn ? 'Bot' : 'You';
      setPassMsg(`${who} ${isBotTurn ? 'has' : 'have'} no legal moves — passing`);
      const t = setTimeout(() => {
        setPassMsg(null);
        appendState(ReversiEngine.executePass(liveState));
      }, isBotTurn ? 800 : 1400);
      return () => { clearTimeout(t); };
    }

    if (isBotTurn) makeBotMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, manualEnd]);

  // ── Save game + update rating when game ends ──────────────────────────────

  useEffect(() => {
    if (!gameStarted || gameSaved) return;
    if (!liveState.isGameOver && !manualEnd) return;
    setGameSaved(true);

    const pc = playerColorRef.current;
    const result: 'white' | 'black' | 'draw' =
      manualEnd === 'resign' ? (pc === 'black' ? 'white' : 'black')
      : liveState.winner === null ? 'draw'
      : liveState.winner === pc ? pc
      : (pc === 'black' ? 'white' : 'black');

    const outcome: GameOutcome =
      result === 'draw' ? 'draw' : result === pc ? 'win' : 'loss';

    const current = userRatingRef.current;
    if (!current || !user) return;

    const rawDelta = calculateNewRating(current.rating, botElo, outcome, current.games_played) - current.rating;
    const hintPenalty = hintsUsedRef.current * 2;
    const adjustedDelta = rawDelta - hintPenalty;
    const newRating = Math.max(100, current.rating + adjustedDelta);

    Promise.all([
      upsertUserRating(user.id, newRating, outcome, 'reversi'),
      saveReversiGame(liveState, pc, result, `elo-${botElo}`, user.id, {
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
  }, [liveState.isGameOver, manualEnd]);

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = (position: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver || manualEnd) return;
    if (liveState.currentTurn !== playerColor) return;
    setHintPos(null);

    const result = ReversiEngine.validateMove(liveState, position);
    if (result.valid && result.resultingState) {
      appendState(result.resultingState);
    }
  };

  // ── Hint ──────────────────────────────────────────────────────────────────

  const handleHint = async () => {
    if (isHinting || isThinking || liveState.currentTurn !== playerColor) return;
    if (!isAtLive || liveState.isGameOver) return;

    setIsHinting(true);
    try {
      const move = await new Promise<{ position: string }>(resolve =>
        setTimeout(() => resolve(getBestReversiMove(liveState, 2000)), 0),
      );
      setHintsUsed(n => n + 1);
      setHintPos(move.position);
      setTimeout(() => setHintPos(null), 3000);
    } catch (err) {
      console.error('Hint error:', err);
    } finally {
      setIsHinting(false);
    }
  };

  // ── Game control ──────────────────────────────────────────────────────────

  // Resign — ends the game now; the save effect applies the rated outcome.
  const handleResign = () => {
    if (manualEnd || liveState.isGameOver) return;
    setManualEnd('resign');
    setIsThinking(false);
    setPassMsg(null);
    setHintPos(null);
  };

  const handleNewGame = () => {
    setTimeline([ReversiEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setPassMsg(null);
    setHintPos(null);
    setHintsUsed(0);
    setRatingResult(null);
    setGameSaved(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
  };

  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;
  const counts = ReversiEngine.getDiscCounts(displayState);
  const isPlayerTurn = isAtLive && !isThinking && !liveState.isGameOver && !manualEnd && liveState.currentTurn === playerColor;

  // ── Loading / auth states ─────────────────────────────────────────────────

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen pt-16 flex items-center justify-center">
        <div className="text-fg-muted">Loading…</div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen pt-16 page-glow-reversi">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/reversi"
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
            Each hint highlights the best square for 3 seconds but applies a <strong>−2 rating penalty</strong> to your result.
          </div>

          {/* Color selector */}
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-xl font-semibold text-fg mb-4">
              Choose Your Colour
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['black', 'white'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => setPlayerColor(color)}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'border border-transparent bg-accent [background-image:var(--gradient-accent)] text-on-accent [box-shadow:var(--shadow-glow-accent)] scale-105'
                      : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                  }`}
                >
                  <div className="flex justify-center mb-2">
                    <svg width="40" height="40" viewBox="0 0 40 40">
                      <circle cx="20.5" cy="21.5" r="16" fill={color === 'black' ? '#000' : '#ccc'} opacity="0.4" />
                      <circle cx="20" cy="20" r="16" fill={color === 'black' ? '#1a1a1a' : '#f5f0e8'} stroke={color === 'black' ? '#555' : '#aaa'} strokeWidth="1" />
                      <ellipse cx="15" cy="14.5" rx="6" ry="4" fill={color === 'black' ? '#444' : '#fff'} opacity="0.35" />
                    </svg>
                  </div>
                  <div className="font-semibold capitalize">{color}</div>
                  <div className={`text-sm ${playerColor === color ? 'text-on-accent/80' : 'text-fg-muted'}`}>
                    {color === 'black' ? 'You move first' : 'Bot moves first'}
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
    : liveState.isGameOver
    ? liveState.winner === null
      ? `Draw! ${counts.black}–${counts.white}`
      : liveState.winner === playerColor
        ? `You win! ${counts[playerColor]}–${counts[playerColor === 'black' ? 'white' : 'black']} 🎉`
        : `Bot wins. ${counts[playerColor === 'black' ? 'white' : 'black']}–${counts[playerColor]}`
    : null;

  // Player-relative result for the celebration screen.
  const myResult: GameResult = manualEnd === 'resign'
    ? 'loss'
    : liveState.winner === null ? 'draw' : liveState.winner === playerColor ? 'win' : 'loss';

  const yourTurn = isPlayerTurn;

  return (
    <>
      <GameScreenLayout
        accent="reversi"
        backHref="/reversi"
        headerCenter={
          <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
            <span className="text-xs text-fg-muted">Rating</span>
            <span className="text-sm font-bold text-fg">{userRating?.rating ?? 1200}</span>
          </div>
        }
        headerActions={
          <>
            {passMsg && (
              <span className="text-xs px-3 py-1 bg-warning/15 text-warning-hover rounded-full border border-warning/40 animate-pulse">
                {passMsg}
              </span>
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
          />
        }
        // Live disc-count bar above the board, per the design.
        topExtras={<DiscCountBar black={counts.black} white={counts.white} />}
        board={
          <ReversiBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            showCoordinates
            highlightPos={isAtLive ? lastPlacedPos : null}
            hintPos={isAtLive ? hintPos : null}
          />
        }
        bottomCard={
          <PlayerCard
            name="You"
            initial="Y"
            isYou
            active={yourTurn}
            subline={`Playing ${playerColor}${yourTurn ? ' · your move' : ''}`}
          />
        }
        sidebar={
          <>
              {/* Turn / result status — the accent banner from the design. */}
              <StatusBanner
                accent="reversi"
                title={
                  gameOverMsg ?? (isThinking ? 'Bot is thinking…' : isPlayerTurn ? 'Your move' : 'Reviewing history')
                }
                description={gameOverMsg ? undefined : isPlayerTurn ? 'Rated game — hints cost 2 points each.' : undefined}
              />

              {/* Info card */}
              <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg">
                      {botElo}
                      <span className="text-xs font-normal text-fg-muted ml-1">({eloLabel(botElo)})</span>
                    </span>
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
                  <div className="flex gap-1.5 col-span-2">
                    <span className="text-fg-muted">Turn:</span>
                    <span className="font-semibold text-fg capitalize">
                      {liveState.isGameOver ? '—' : liveState.currentTurn}
                    </span>
                  </div>
                </div>
              </div>

              {/* Hint button */}
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
              <div className="flex-1 min-h-0 bg-white/[0.04] rounded-xl border border-white/10 flex flex-col">
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Moves</span>
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
                        className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-white/5 border border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
                  {liveState.moveHistory.length === 0 ? (
                    <p className="text-fg-subtle text-xs text-center py-4">
                      No moves yet
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {liveState.moveHistory.map((move, i) => {
                        const moveNum = Math.floor(i / 2) + 1;
                        const isBlack = i % 2 === 0;
                        const stateIdx = i + 1;
                        const isActive = viewIndex === stateIdx;
                        const colorDot = move.color === 'black' ? '⬤' : '○';
                        return (
                          <div key={i} className="flex items-center gap-1">
                            {isBlack && (
                              <span className="text-fg-subtle w-6 shrink-0 text-right pr-0.5 text-xs">{moveNum}.</span>
                            )}
                            {!isBlack && <span className="w-6 shrink-0" />}
                            <button
                              onClick={() => setViewIndex(stateIdx)}
                              className={`flex-1 text-left px-2 py-0.5 rounded transition-colors text-xs ${
                                isActive
                                  ? 'bg-[color-mix(in_srgb,var(--c-accent)_18%,transparent)] text-[var(--c-accent-text)] font-semibold'
                                  : 'text-fg-muted hover:bg-white/5'
                              }`}
                            >
                              <span className="mr-1 opacity-60">{colorDot}</span>
                              {formatMoveNotation(move)}
                              {move.flipped.length > 0 && (
                                <span className="ml-1 opacity-50 text-[10px]">+{move.flipped.length}</span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Resign — reversi has no draw offers, per the design. */}
              <GameActions
                className="shrink-0"
                onResign={handleResign}
                disabled={!!gameOverMsg}
              />
          </>
        }
      />

      <GameResultScreen
        open={!!ratingResult}
        result={myResult}
        subtitle={gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        hintsUsed={ratingResult?.hintsUsed}
        actions={
          <>
            <Button size="lg" fullWidth onClick={handleNewGame}>
              Play Again
            </Button>
            <Link
              href="/reversi"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg font-semibold bg-surface-muted hover:bg-surface-hover text-fg transition-colors"
            >
              Back to Reversi
            </Link>
          </>
        }
      />
    </>
  );
}
