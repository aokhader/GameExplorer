'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import Link from 'next/link';
import { CheckersEngine, CheckersGameState, getBestCheckersMove, calculateNewRating, GameOutcome } from '@gameexplorer/shared';
import { CheckersBoard } from '@/components/checkers/CheckersBoard';
import { useAuth } from '@/hooks/useAuth';
import { saveCheckersGame, getUserRating, upsertUserRating } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { PlayerCard } from '@/components/game/PlayerCard';
import { GameActions } from '@/components/game/GameActions';
import { Button } from '@/components/ui';

// GameResultScreen pulls in canvas-confetti + a framer-motion tree but only
// renders at game end — load it lazily so it stays out of the initial route
// chunk (smaller first-load JS / faster first navigation to this page).
const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then(m => m.GameResultScreen),
  { ssr: false },
);

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
  // Player-initiated end (½ Draw / Resign) — still applies the rated outcome.
  const [manualEnd, setManualEnd]   = useState<'resign' | 'draw' | null>(null);

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
  const manualEndRef   = useRef(manualEnd);
  manualEndRef.current = manualEnd;

  const liveState   = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive    = viewIndex === timeline.length - 1;

  useEffect(() => { setUserId(user?.id ?? null); }, [user]);

  // Deep link from onboarding (?elo=1100&start=1) — snap to the nearest
  // difficulty level and skip the setup screen. Layout effect so the flip to
  // the game screen commits before paint: the setup screen never flashes on the
  // onboarding navigation, avoiding a layout shift.
  useIsomorphicLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const elo = Number(params.get('elo'));
    if (Number.isFinite(elo) && elo > 0) {
      const nearest = DIFFICULTY_LEVELS.reduce((a, b) =>
        Math.abs(b.elo - elo) < Math.abs(a.elo - elo) ? b : a,
      );
      setTargetElo(nearest.elo);
    }
    if (params.get('start') === '1') setGameStarted(true);
  }, []);

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

      // Dropped if the player resigned / agreed a draw while the bot thought.
      if (manualEndRef.current) return;

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
    if (liveState.isGameOver || manualEnd) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking) makeBotMove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, manualEnd]);

  // Save game and update rating when it ends (naturally or by resign/draw)
  useEffect(() => {
    if (!gameStarted || gameSaved) return;
    if (!liveState.isGameOver && !manualEnd) return;
    setGameSaved(true);

    const pc = playerColorRef.current;
    const result: 'white' | 'black' | 'draw' =
      manualEnd === 'draw' ? 'draw'
      : manualEnd === 'resign' ? (pc === 'white' ? 'black' : 'white')
      : liveState.winner === null ? 'draw'
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
  }, [liveState.isGameOver, manualEnd]);

  const handleMove = (from: string, to: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver || manualEnd) return;
    if (liveState.currentTurn !== playerColor) return;

    const result = CheckersEngine.validateMove(liveState, from, to);
    if (result.valid && result.resultingState) {
      const newIdx = timeline.length;
      setTimeline(prev => [...prev, result.resultingState!]);
      setViewIndex(newIdx);
    }
  };

  // Resign / agree a draw — ends the game now; the save effect applies the
  // rated outcome exactly as a natural end would.
  const endManually = (kind: 'resign' | 'draw') => {
    if (manualEnd || liveState.isGameOver) return;
    setManualEnd(kind);
    setIsThinking(false);
  };

  const handleNewGame = () => {
    setTimeline([CheckersEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
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
      <div className="min-h-screen pt-16 page-glow-checkers">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/checkers"
            className="inline-flex items-center text-fg-muted hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg mb-8 text-center">
            Play vs Bot
          </h1>

          {/* Difficulty selector */}
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-2xl font-semibold text-fg mb-6">Bot Strength</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {DIFFICULTY_LEVELS.map((level) => {
                const selected = targetElo === level.elo;
                return (
                  <button
                    key={level.elo}
                    onClick={() => setTargetElo(level.elo)}
                    className={`relative p-4 rounded-xl text-left transition-all border-2 ${
                      selected
                        ? 'border-accent bg-accent-muted [box-shadow:var(--shadow-glow-accent)] scale-[1.02]'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-2xl mb-2">{level.icon}</div>
                    <div className={`font-bold text-sm mb-0.5 ${selected ? 'text-accent' : 'text-fg'}`}>
                      {level.label}
                    </div>
                    <div className="text-xs text-fg-muted leading-snug">
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
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-2xl font-semibold text-fg mb-6">Choose Your Color</h2>
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
                  {/* Mini piece preview */}
                  <div className="flex justify-center mb-2">
                    <svg width="40" height="40" viewBox="0 0 45 45">
                      <circle cx="23" cy="24.5" r="17" fill={color === 'white' ? '#c8b49a' : '#1a0f08'} opacity="0.35" />
                      <circle cx="22.5" cy="22" r="17" fill={color === 'white' ? '#faf0e0' : '#2c1b08'} stroke={color === 'white' ? '#5c3d1e' : '#e8d5b7'} strokeWidth="1.5" />
                      <ellipse cx="17" cy="16.5" rx="6.5" ry="4.5" fill={color === 'white' ? '#ffffff' : '#5c4033'} opacity="0.35" />
                    </svg>
                  </div>
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
            className="w-full px-8 py-4 rounded-xl bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-lg [box-shadow:var(--shadow-glow-accent)] hover:brightness-110 transition-all"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────────

  const gameOverMsg = manualEnd === 'resign'
    ? 'You resigned'
    : manualEnd === 'draw' ? 'Draw by agreement'
    : liveState.isGameOver
    ? liveState.winner === null
      ? 'Draw — 40 moves without capture'
      : liveState.winner === playerColor
        ? 'You win! 🎉'
        : 'Bot wins'
    : null;

  // Player-relative result for the celebration screen.
  const myResult: GameResult = manualEnd === 'resign'
    ? 'loss'
    : manualEnd === 'draw' ? 'draw'
    : liveState.winner === null ? 'draw' : liveState.winner === playerColor ? 'win' : 'loss';

  const botLabel = DIFFICULTY_LEVELS.find(l => l.elo === targetElo)?.label ?? String(targetElo);
  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;

  return (
    <>
      <GameScreenLayout
        accent="checkers"
        backHref="/checkers"
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
            subline={isThinking ? `${botLabel} · thinking…` : botLabel}
          />
        }
        board={
          <CheckersBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            showCoordinates
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
              {/* No status banner: the player cards flanking the board already
                  carry whose turn it is (pulse + subline), and the result gets
                  its own celebration screen. */}

              {/* Info card */}
              <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg">
                      {DIFFICULTY_LEVELS.find(l => l.elo === targetElo)?.label ?? targetElo}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Playing:</span>
                    <span className="font-semibold text-fg capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Turn:</span>
                    <span className="font-semibold text-fg capitalize">
                      {liveState.isGameOver ? '—' : liveState.currentTurn}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Move:</span>
                    <span className="font-semibold text-fg">
                      {liveState.moveHistory.length}
                    </span>
                  </div>
                </div>

                {/* Piece count display */}
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-around text-xs">
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#f4d270" stroke="#8a6a1f" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg">{counts.white}</span>
                  </div>
                  <div className="text-fg-muted">vs</div>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="#3b82f6" stroke="#1e40af" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg">{counts.black}</span>
                  </div>
                </div>

              </div>

              {/* Move history */}
              <div className="flex-1 min-h-0 bg-white/[0.04] rounded-xl border border-white/10 flex flex-col">
                {/* Nav buttons */}
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Moves</span>
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
                        className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-white/5 border border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Move list */}
                <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
                  {liveState.moveHistory.length === 0 ? (
                    <p className="text-fg-subtle text-xs text-center py-4">
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
                              <span className="text-fg-subtle w-7 shrink-0 text-right pr-1">
                                {moveNum}.
                              </span>
                            )}
                            {!isWhiteMove && <span className="w-7 shrink-0" />}
                            <button
                              onClick={() => setViewIndex(stateIdx)}
                              className={`flex-1 text-left px-2 py-0.5 rounded transition-colors truncate ${
                                isActive
                                  ? 'bg-[rgba(205,164,63,0.18)] text-[#f0d589] font-semibold'
                                  : 'text-fg-muted hover:bg-white/5'
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

              {/* ½ Draw / Resign — as in the design's in-game sidebar. */}
              <GameActions
                className="shrink-0"
                onDraw={() => endManually('draw')}
                onResign={() => endManually('resign')}
                disabled={!!gameOverMsg}
              />
          </>
        }
      />

      {/* Open on game end for everyone — guests too (onboarding's soft sign-up
          shows here); the rating block simply stays absent until the rated
          update resolves for signed-in players. */}
      <GameResultScreen
        open={!!gameOverMsg}
        result={myResult}
        subtitle={myResult === 'win' ? undefined : gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        actions={
          <>
            <Button size="lg" fullWidth onClick={handleNewGame}>
              Play Again
            </Button>
            <Link
              href="/checkers"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg font-semibold bg-surface-muted hover:bg-surface-hover text-fg transition-colors"
            >
              Back to Checkers
            </Link>
          </>
        }
      />
    </>
  );
}
