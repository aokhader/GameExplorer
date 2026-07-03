'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { ReversiEngine, ReversiGameState, ReversiColor, getBestReversiMove, calculateNewRating, GameOutcome } from '@gameexplorer/shared';
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

// ── Difficulty levels ─────────────────────────────────────────────────────────

const DIFFICULTY_LEVELS = [
  { elo: 500,  label: 'Beginner', description: 'Plays randomly, ignores corners',          depth: 1, icon: '🟢' },
  { elo: 800,  label: 'Casual',   description: 'Spots basic flips, misses strategy',        depth: 2, icon: '🔵' },
  { elo: 1100, label: 'Club',     description: 'Uses positional heuristics consistently',   depth: 3, icon: '🟡' },
  { elo: 1400, label: 'Strong',   description: 'Controls corners and mobility well',        depth: 4, icon: '🟠' },
  { elo: 1700, label: 'Expert',   description: 'Deep tactical and positional play',         depth: 5, icon: '🔴' },
  { elo: 2000, label: 'Master',   description: 'Near-optimal — very hard to beat',          depth: 5, icon: '⚫' },
] as const;

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

interface RatingResult {
  before: number;
  after: number;
  delta: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReversiBotPage() {
  const [timeline, setTimeline]       = useState<ReversiGameState[]>(() => [ReversiEngine.newGame()]);
  const [viewIndex, setViewIndex]     = useState(0);
  const [targetElo, setTargetElo]     = useState(1100);
  const [playerColor, setPlayerColor] = useState<ReversiColor>('black');
  const [isThinking, setIsThinking]   = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [userId, setUserId]           = useState<string | null>(null);
  const [passMsg, setPassMsg]         = useState<string | null>(null);
  const [userRating, setUserRating]   = useState<UserRating | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved]     = useState(false);
  // Player-initiated end — reversi has no draw offers, so resign only.
  const [manualEnd, setManualEnd]     = useState<'resign' | null>(null);

  const { user } = useAuth();

  const timelineRef    = useRef(timeline);
  timelineRef.current  = timeline;
  const viewIndexRef   = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const targetEloRef   = useRef(targetElo);
  targetEloRef.current = targetElo;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const userRatingRef  = useRef(userRating);
  userRatingRef.current = userRating;
  const manualEndRef   = useRef(manualEnd);
  manualEndRef.current = manualEnd;

  const liveState    = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive     = viewIndex === timeline.length - 1;

  const lastMove = liveState.moveHistory[liveState.moveHistory.length - 1];
  const lastPlacedPos = lastMove?.position ?? null;

  useEffect(() => { setUserId(user?.id ?? null); }, [user]);

  // Load rating when user is available
  useEffect(() => {
    if (!user) return;
    getUserRating(user.id, 'reversi').then(setUserRating);
  }, [user]);

  const appendState = useCallback((next: ReversiGameState) => {
    setTimeline(prev => {
      const wasAtLive = viewIndexRef.current === prev.length - 1;
      const updated = [...prev, next];
      if (wasAtLive) setViewIndex(updated.length - 1);
      return updated;
    });
  }, []);

  const makeBotMove = useCallback(async () => {
    const currentLive = timelineRef.current[timelineRef.current.length - 1];
    const elo = targetEloRef.current;

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

  // Main turn effect — handles bot moves and auto-passes
  useEffect(() => {
    if (!gameStarted || liveState.isGameOver || isThinking || manualEnd) return;

    const isBotTurn    = liveState.currentTurn !== playerColor;
    const currentMoves = ReversiEngine.getAllLegalMoves(liveState);
    const mustPass     = currentMoves.length === 0;

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

  // Save game and update rating on completion
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
    const uid = userId;

    if (current && uid) {
      const rawDelta = calculateNewRating(current.rating, targetEloRef.current, outcome, current.games_played) - current.rating;
      const newRating = Math.max(100, current.rating + rawDelta);

      Promise.all([
        upsertUserRating(uid, newRating, outcome, 'reversi'),
        saveReversiGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid, {
          mode: 'rated',
          rating_before: current.rating,
          rating_after: newRating,
        }),
      ]).then(([updatedRating]) => {
        setUserRating(updatedRating);
        setRatingResult({ before: current.rating, after: newRating, delta: rawDelta });
      });
    } else {
      saveReversiGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isGameOver, manualEnd]);

  const handleMove = (position: string) => {
    if (!isAtLive || isThinking || liveState.isGameOver || manualEnd) return;
    if (liveState.currentTurn !== playerColor) return;
    const result = ReversiEngine.validateMove(liveState, position);
    if (result.valid && result.resultingState) {
      appendState(result.resultingState);
    }
  };

  // Resign — ends the game now; the save effect applies the rated outcome.
  const handleResign = () => {
    if (manualEnd || liveState.isGameOver) return;
    setManualEnd('resign');
    setIsThinking(false);
    setPassMsg(null);
  };

  const handleNewGame = () => {
    setTimeline([ReversiEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setPassMsg(null);
    setRatingResult(null);
    setGameSaved(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
    // If player is white, black (bot) moves first
    if (playerColor === 'white') setTimeout(makeBotMove, 500);
  };

  const canGoBack    = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;
  const counts       = ReversiEngine.getDiscCounts(displayState);

  // ── Setup screen ──────────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen pt-16 page-glow-reversi">
        <div className="container mx-auto px-4 pt-8">
          <Link href="/reversi" className="inline-flex items-center text-fg-muted hover:text-fg transition-colors">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg mb-8 text-center">Play vs Bot</h1>

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
                    <div className="text-xs text-fg-muted leading-snug">{level.description}</div>
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
            <h2 className="text-2xl font-semibold text-fg mb-6">Choose Your Colour</h2>
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

  const botLabel = DIFFICULTY_LEVELS.find(l => l.elo === targetElo)?.label ?? String(targetElo);
  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;

  return (
    <>
      <GameScreenLayout
        accent="reversi"
        backHref="/reversi"
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
            <button onClick={handleNewGame} className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm">
              New Game
            </button>
          </>
        }
        topCard={
          <>
            <PlayerCard
              name="Bot"
              initial="B"
              active={isThinking}
              subline={isThinking ? `${botLabel} · thinking…` : botLabel}
            />
            {/* Live disc-count bar above the board, per the design. */}
            <DiscCountBar black={counts.black} white={counts.white} />
          </>
        }
        board={
          <ReversiBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            showCoordinates
            highlightPos={isAtLive ? lastPlacedPos : null}
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
                  gameOverMsg ?? (isThinking ? 'Bot is thinking…' : yourTurn ? 'Your move' : 'Reviewing history')
                }
                description={
                  gameOverMsg ? undefined : yourTurn ? 'Glowing dots mark every legal square.' : undefined
                }
              />

              {/* Info card */}
              <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg">
                      {DIFFICULTY_LEVELS.find(l => l.elo === targetElo)?.label}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Playing:</span>
                    <span className="font-semibold text-fg capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5 col-span-2">
                    <span className="text-fg-muted">Turn:</span>
                    <span className="font-semibold text-fg capitalize">
                      {liveState.isGameOver ? '—' : liveState.currentTurn}
                    </span>
                  </div>
                </div>
              </div>

              {/* Move history */}
              <div className="flex-1 min-h-0 bg-white/[0.04] rounded-xl border border-white/10 flex flex-col">
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
                  <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Moves</span>
                  <div className="flex gap-1">
                    {[
                      { label: '⇤', action: () => setViewIndex(0),                                      disabled: !canGoBack },
                      { label: '←', action: () => setViewIndex(i => Math.max(0, i - 1)),               disabled: !canGoBack },
                      { label: '→', action: () => setViewIndex(i => Math.min(timeline.length - 1, i + 1)), disabled: !canGoForward },
                      { label: '⇥', action: () => setViewIndex(timeline.length - 1),                   disabled: !canGoForward },
                    ].map(({ label, action, disabled }) => (
                      <button key={label} onClick={action} disabled={disabled}
                        className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-white/5 border border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
                        const moveNum   = Math.floor(i / 2) + 1;
                        const isBlack   = i % 2 === 0;
                        const stateIdx  = i + 1;
                        const isActive  = viewIndex === stateIdx;
                        const colorDot  = move.color === 'black' ? '⬤' : '○';
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
                                  ? 'bg-[rgba(205,164,63,0.18)] text-[#f0d589] font-semibold'
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
