'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  MODE_COPY,
  CheckersEngine,
  CheckersGameState,
  getBestCheckersMove,
  calculateNewRating,
  GameOutcome,
  botStrengthLabel,
} from '@gameexplorer/shared';
import { CheckersBoard, BoardArrow } from '@/components/checkers/CheckersBoard';
import { useAuth } from '@/hooks/useAuth';
import { saveCheckersGame, getUserRating, upsertUserRating } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GAME_SIDEBAR_ID, GameScreenLayout } from '@/components/game/GameScreenLayout';
import { MoveStrip, numberedStripItems } from '@/components/game/MoveStrip';
import { PlayerCard } from '@/components/game/PlayerCard';
import { GameActions } from '@/components/game/GameActions';
import { StatusBanner } from '@/components/game/StatusBanner';
import { ResultActions } from '@/components/game/ResultActions';
import { SetupStartBar } from '@/components/game/SetupStartBar';
import { Icon } from '@gameexplorer/ui';
import { ShellNav } from '@/components/game/ShellNav';
import { ContinueCard, GuardedStartButton } from '@/components/game/ContinueCard';
import { useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { useUnfinishedGameWriter } from '@gameexplorer/client/hooks/useUnfinishedGameWriter';
import { CHECKERS_RULES, actionsFromHistory } from '@gameexplorer/client/game/localRules';
import { replayActions, type UnfinishedGame } from '@gameexplorer/client/game/unfinishedGame';
import { webLocalStore } from '@/lib/localStore';
import { resumeHref, useUnfinishedGame, wantsResume } from '@/hooks/useUnfinishedGame';
import { useMarkPlayed } from '@/hooks/useMarkPlayed';
import { useStartLink } from '@/hooks/useStartLink';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { signInRequiredHref } from '@/components/auth/returnTo';

// GameResultScreen pulls in canvas-confetti + a framer-motion tree but only
// renders at game end — load it lazily so it stays out of the initial route
// chunk (smaller first-load JS / faster first navigation to this page).
const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then(m => m.GameResultScreen),
  { ssr: false },
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** A bot's name, shared with the setup screen so a preset keeps its tier. */
const eloLabel = (elo: number): string => botStrengthLabel('checkers', elo);

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
  // The colour chosen last time, read before the first paint (`ux-fix-ideas.md` §2.1).
  const { setup, update } = useRememberedSetup({ store: webLocalStore, game: 'checkers', mode: 'training' });
  const playerColor = setup.color;

  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingLoading, setRatingLoading] = useState(true);

  const [timeline, setTimeline] = useState<CheckersGameState[]>(() => [CheckersEngine.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  useMarkPlayed('checkers', 'training', gameStarted);

  const [hintArrow, setHintArrow] = useState<BoardArrow | null>(null);
  const [isHinting, setIsHinting] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);

  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // Player-initiated end (½ Draw / Resign) — still applies the rated outcome.
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);
  // View only — which colour sits at the bottom. Never changes what you own.
  const [flipped, setFlipped] = useState(false);

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
  const orientation = flipped
    ? (playerColor === 'white' ? 'black' : 'white')
    : playerColor;
  const botElo = Math.min(2000, Math.max(400, userRating?.rating ?? 1200));

  // ── Unfinished game (`ux-fix-ideas.md` §2.4) ──────────────────────────────
  // Training is always rated, so an unfinished game here stays open until it is
  // finished or resigned — saved as it is played, hints included.
  const unfinished = useUnfinishedGame('checkers');
  const trainingActions = useMemo(() => actionsFromHistory('checkers', liveState), [liveState]);
  const slot = useUnfinishedGameWriter({
    store: webLocalStore,
    game: 'checkers',
    mode: 'training',
    userId: user?.id ?? null,
    rated: true,
    playerColor,
    botElo,
    setup,
    hintsUsed,
    started: gameStarted,
    actions: trainingActions,
    over: liveState.isGameOver || !!manualEnd,
  });

  /**
   * A saved game waiting for what a resume needs: the player's rating, which the
   * bot's strength comes from.
   */
  const [pendingResume, setPendingResume] = useState<UnfinishedGame | null>(null);

  /** Pick a saved game up where it was left; another mode's resumes on its own route. */
  const resumeSaved = (saved: UnfinishedGame) => {
    if (saved.mode !== 'training') {
      router.push(resumeHref(saved));
      return;
    }
    if (ratingLoading) {
      setPendingResume(saved);
      return;
    }
    const replayed = replayActions(CHECKERS_RULES, saved.actions) as CheckersGameState[] | null;
    if (!replayed) {
      void unfinished.settle({ resign: true }).catch(() => {});
      return;
    }
    gameGenRef.current += 1;
    update({ color: saved.playerColor });
    setTimeline(replayed);
    setViewIndex(replayed.length - 1);
    setIsThinking(false);
    setManualEnd(null);
    setHintArrow(null);
    setHintsUsed(saved.hintsUsed);
    setRatingResult(null);
    setGameSaved(false);
    slot.resumedFrom(saved);
    setGameStarted(true);
  };

  // `?resume=1` from a Continue card on another route: blank until it is known
  // whether there is a game to open.
  const [awaitingResume, setAwaitingResume] = useState(false);
  useIsomorphicLayoutEffect(() => {
    if (wantsResume()) setAwaitingResume(true);
  }, []);
  useEffect(() => {
    if (!awaitingResume || !unfinished.hydrated) return;
    setAwaitingResume(false);
    const saved = unfinished.saved;
    if (saved && !saved.end && saved.mode === 'training') resumeSaved(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingResume, unfinished.hydrated]);
  useEffect(() => {
    if (!pendingResume || ratingLoading) return;
    setPendingResume(null);
    resumeSaved(pendingResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, ratingLoading]);

  // ── Auth guard ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(signInRequiredHref('/checkers/training'));
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
    if (liveState.isGameOver || manualEnd) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking) makeBotMove();
  }, [liveState, playerColor, gameStarted, isThinking, manualEnd]);

  // ── Save game + update rating when game ends ──────────────────────────────

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
    // Owed until written: a failed write or a closed tab leaves the result on the
    // Continue card rather than losing it.
    slot.markEnded(manualEnd ?? 'over');
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
      slot.clear();
      setUserRating(updatedRating);
      setRatingResult({
        before: current.rating,
        after: newRating,
        delta: adjustedDelta,
        hintsUsed: hintsUsedRef.current,
      });
    }).catch((err) => console.error('Failed to save game / rating:', err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isGameOver, manualEnd]);

  // ── Bot move ──────────────────────────────────────────────────────────────

  // Bumped on every reset. A rematch starts the next game the instant the last
  // one ends, so a reply still being computed for the finished board must not be
  // appended to the new one, or clear the thinking flag a newer search owns.
  const gameGenRef = useRef(0);

  const makeBotMove = async () => {
    const gen = gameGenRef.current;
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

      // Dropped if the game was reset, or the player resigned / agreed a draw,
      // while the bot thought.
      if (gen !== gameGenRef.current || manualEndRef.current) return;

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
      if (gen === gameGenRef.current) setIsThinking(false);
    }
  };

  // ── Player move ───────────────────────────────────────────────────────────

  const handleMove = (from: string, to: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver || manualEnd) return;
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

  // Resign / agree a draw — ends the game now; the save effect applies the
  // rated outcome exactly as a natural end would.
  const endManually = (kind: 'resign' | 'draw') => {
    if (manualEnd || liveState.isGameOver) return;
    setManualEnd(kind);
    setIsThinking(false);
    setHintArrow(null);
  };

  /** Clear the finished game. `keepSetup` starts the next one straight away. */
  const resetGame = (keepSetup: boolean) => {
    gameGenRef.current += 1;
    setTimeline([CheckersEngine.newGame()]);
    setViewIndex(0);
    if (!keepSetup) setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setHintArrow(null);
    setHintsUsed(0);
    setRatingResult(null);
    setGameSaved(false);
  };

  /**
   * Back to the setup form (header New Game, result card Change setup). A game
   * left unfinished stays saved, and the Continue card reads it back.
   */
  const handleNewGame = () => {
    resetGame(false);
    unfinished.refresh();
  };

  /** The next rated game, matched to the rating the last one wrote. */
  const handleRematch = () => resetGame(true);

  const handleStartGame = () => {
    setGameStarted(true);
  };
  // `?start=1`: start once it is known no unfinished game is waiting.
  const awaitingStart = useStartLink(unfinished, handleStartGame);

  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;
  const counts = CheckersEngine.getPieceCounts(displayState);
  const isPlayerTurn = isAtLive && !isThinking && !liveState.isGameOver && !manualEnd && liveState.currentTurn === playerColor;

  // ── Loading / auth states ─────────────────────────────────────────────────

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-svh flex items-center justify-center">
        <div className="text-fg-muted">Loading…</div>
      </div>
    );
  }

  // ── Setup screen ──────────────────────────────────────────────────────────

  if (!gameStarted && (awaitingResume || pendingResume || awaitingStart)) {
    return <div className="min-h-svh" />;
  }

  if (!gameStarted) {
    return (
      <div className="min-h-svh">
        <div className="container mx-auto px-4 pt-4">
          <ShellNav backHref="/checkers" />
        </div>

        <div className="container mx-auto px-4 pt-2 pb-10 max-w-2xl">
          <h1 className="text-2xl font-bold text-fg mb-1">
            {MODE_COPY.training.label}
          </h1>
          <p className="text-fg-muted mb-4">
            Play rated games against a bot matched to your skill level
          </p>

          {unfinished.saved && (
            <ContinueCard
              saved={unfinished.saved}
              onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
              onSettle={unfinished.settle}
              settling={unfinished.settling}
            />
          )}

          {/* Rating card */}
          <div className="rounded-xl border border-white/10 bg-surface-alt surface-raised p-5 mb-4">
            <h2 className="text-lg font-semibold text-fg-muted mb-4 uppercase tracking-wide text-center">
              Your Rating
            </h2>
            {ratingLoading ? (
              <div className="text-center text-fg-muted animate-pulse py-4">Loading…</div>
            ) : (
              <div className="text-center">
                <div className="font-display text-5xl font-bold tabular-nums text-fg leading-none mb-2">
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
            <div className="font-semibold mb-1 flex items-center gap-1.5"><Icon name="lightbulb" /> Hints available — with a cost</div>
            Each hint shows the best move for 3 seconds but applies a <strong>−2 rating penalty</strong> to your result.
          </div>

          {/* Color selector */}
          <div className="rounded-xl border border-white/10 bg-surface-alt surface-raised p-5 mb-4">
            <h2 className="text-xl font-semibold text-fg mb-4">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {(['white', 'black'] as const).map(color => (
                <button
                  key={color}
                  onClick={() => update({ color })}
                  className={`p-6 rounded-lg transition-all ${
                    playerColor === color
                      ? 'border border-accent bg-accent-muted text-fg'
                      : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
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
                  <div className={`text-sm ${playerColor === color ? 'text-fg-muted' : 'text-fg-muted'}`}>
                    {color === 'white' ? 'You move first' : 'Bot moves first'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <SetupStartBar>
            <GuardedStartButton
              onStart={handleStartGame}
              disabled={ratingLoading}
              saved={unfinished.saved}
              onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
              onSettle={unfinished.settle}
              settling={unfinished.settling}
            >
              Start Rated Game
            </GuardedStartButton>
          </SetupStartBar>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────

  const gameOverMsg = manualEnd === 'resign'
    ? 'You resigned'
    : manualEnd === 'draw' ? 'Draw by agreement'
    : liveState.isGameOver
    ? liveState.winner === null
      ? 'Draw — 40 moves without capture'
      : liveState.winner === playerColor
        ? 'You win!'
        : 'Bot wins'
    : null;

  // Player-relative result for the celebration screen.
  const myResult: GameResult = manualEnd === 'resign'
    ? 'loss'
    : manualEnd === 'draw' ? 'draw'
    : liveState.winner === null ? 'draw' : liveState.winner === playerColor ? 'win' : 'loss';

  return (
    <>
      <GameScreenLayout
        backHref="/checkers"
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
                className="touch-target motion-control motion-safe:active:scale-[0.98] text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-on-accent rounded-lg font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="touch-target motion-control motion-safe:active:scale-[0.98] px-4 py-2 border border-border-strong text-fg hover:bg-surface-muted font-semibold rounded-lg text-sm"
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
        board={
          <CheckersBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            orientation={orientation}
            showCoordinates
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
          />
        }
        actions={
          <GameActions
            className="shrink-0"
            onDraw={() => endManually('draw')}
            onResign={() => endManually('resign')}
            onFlip={() => setFlipped(f => !f)}
            disabled={!!gameOverMsg}
          />
        }
        moveStrip={
          <MoveStrip
            items={numberedStripItems(liveState.moveHistory.map(formatMove))}
            current={viewIndex}
            onJump={setViewIndex}
            fullListId={GAME_SIDEBAR_ID}
          />
        }
        sidebar={
          <>
              {/* Turn / result status — the accent banner from the design. */}
              <StatusBanner
                accent="checkers"
                title={
                  gameOverMsg ?? (isThinking ? 'Bot is thinking…' : isPlayerTurn ? 'Your move' : 'Reviewing history')
                }
                description={gameOverMsg ? undefined : isPlayerTurn ? 'Rated game — hints cost 2 points each.' : undefined}
              />

              {/* Info card */}
              <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg">
                      {botElo}
                      <span className="text-xs font-normal text-fg-muted ml-1">({eloLabel(botElo)})</span>
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
                    <span className="text-fg-muted">Hints:</span>
                    <span className="font-semibold text-fg">
                      {hintsUsed}
                      {hintsUsed > 0 && (
                        <span className="text-xs font-normal text-warning-hover ml-1">(−{hintsUsed * 2} pts)</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Piece counts */}
                <div className="mt-2 pt-2 border-t border-white/10 flex justify-around text-xs">
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="var(--gx-checkers-piece-white-2, #f4d270)" stroke="var(--gx-checkers-piece-white-3, #8a6a1f)" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg">{counts.white}</span>
                  </div>
                  <div className="text-fg-muted">vs</div>
                  <div className="flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 45 45">
                      <circle cx="22.5" cy="22" r="17" fill="var(--gx-checkers-piece-black-2, #3b82f6)" stroke="var(--gx-checkers-piece-black-3, #1e40af)" strokeWidth="2" />
                    </svg>
                    <span className="font-semibold text-fg">{counts.black}</span>
                  </div>
                </div>

              </div>

              {/* Hint button */}
              {!gameOverMsg && (
                <button
                  onClick={handleHint}
                  disabled={!isPlayerTurn || isHinting}
                  className={`touch-target motion-control motion-safe:active:scale-[0.98] shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm border ${ isPlayerTurn && !isHinting ? 'bg-warning/15 border-warning/40 text-warning-hover hover:bg-warning/25' : 'bg-white/5 border-white/10 text-fg-subtle cursor-not-allowed' }`}
                >
                  <Icon name="lightbulb" />
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
                                  ? 'bg-[color-mix(in_srgb,var(--c-accent)_18%,transparent)] text-[var(--c-accent-text)] font-semibold'
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

          </>
        }
      />

      <GameResultScreen
        open={!!ratingResult}
        result={myResult}
        subtitle={myResult === 'win' ? undefined : gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        hintsUsed={ratingResult?.hintsUsed}
        actions={
          <ResultActions
            onRematch={handleRematch}
            onChangeSetup={handleNewGame}
            backHref="/checkers"
            backLabel="Back to Checkers"
          />
        }
      />
    </>
  );
}
