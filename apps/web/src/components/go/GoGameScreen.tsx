'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  GoEngine,
  detectDeadStones,
  goBoardWithoutStones,
  goOwnershipMap,
  moveHistoryToGo,
  toggleDeadChain,
  type GoColor,
  type GoGameState,
  type GoScoring,
} from '@gameexplorer/shared';
import { useLocalGame, type LocalGameMode } from '@gameexplorer/client/hooks/useLocalGame';
import {
  GO_DIFFICULTY_LEVELS,
  GO_PASS,
  GO_RATED_KOMI,
  GO_RATED_SIZE,
  GO_RESUME,
  GO_TRAINING_ELO_BOUNDS,
  goEloLabel,
  goFinalizeMove,
  goRatedEligibility,
  goRulesetSummary,
  goTimelineRows,
  makeGoAdapter,
} from '@gameexplorer/client/game/goAdapter';
import { HINT_PENALTY } from '@gameexplorer/client/trainingRules';
import { useAuth } from '@/hooks/useAuth';
import { GoBoard } from '@/components/go/GoBoard';
import { GoMarkingPanel } from '@/components/go/GoMarkingPanel';
import { GoRulesCard } from '@/components/go/GoRulesCard';
import { GoSgfButton } from '@/components/go/GoSgfButton';
import { GoScoreBar } from '@/components/go/GoScoreBar';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { PlayerCard } from '@/components/game/PlayerCard';
import { GameActions } from '@/components/game/GameActions';
import { RatedToggle } from '@/components/game/RatedToggle';
import { Button } from '@/components/ui';
import { ResultActions } from '@/components/game/ResultActions';
import { SetupStartBar } from '@/components/game/SetupStartBar';
import { DifficultyMeter } from '@/components/game/DifficultyMeter';
import { ShellNav } from '@/components/game/ShellNav';

// Only rendered at game end, and it pulls in confetti + a framer-motion tree —
// keep it out of the route's initial chunk, as every other game screen does.
const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then(m => m.GameResultScreen),
  { ssr: false },
);

export interface GoGameScreenProps {
  /**
   * `bot` plays the engine at a chosen tier, `training` at your own rating with
   * hints for sale, `local` is two people sharing one screen.
   *
   * Like reversi the board never flips between turns: `playerColor` is the tap
   * gate rather than a viewpoint, and a Go position reads the same from both
   * sides. Unlike reversi, all three modes come from one screen — this is the
   * first game to drive web from the shared `useLocalGame` loop instead of a
   * hand-rolled copy per mode.
   */
  mode: 'bot' | 'training' | 'local';
}

function capitalize(color: string): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

/**
 * "White by 7.5" / "Black by 2.5" — how a Go result is actually spoken. A level
 * game is real Go (jigo) and reachable at the integer komi presets.
 */
function describeMargin(state: GoGameState): string {
  const score = GoEngine.score(state);
  if (score.lead === 0) return 'A level game';
  const margin = Math.abs(score.lead);
  const winner = score.lead > 0 ? 'Black' : 'White';
  return `${winner} by ${margin}`;
}

export function GoGameScreen({ mode }: GoGameScreenProps) {
  const isLocal = mode === 'local';
  const isTraining = mode === 'training';

  const [targetElo, setTargetElo] = useState(1100);
  const [playerColor, setPlayerColor] = useState<GoColor>('black');
  const [rated, setRated] = useState(true);
  const [started, setStarted] = useState(false);
  const [size, setSize] = useState(GO_RATED_SIZE);
  const [komi, setKomi] = useState(GO_RATED_KOMI);
  const [scoring, setScoring] = useState<GoScoring>('area');

  const { user } = useAuth();
  const userId = user?.id ?? null;

  /**
   * What makes a game count, in one shared place — see `goRatedEligibility`.
   * Board size and komi both move the goalposts, and the bot’s ladder was only
   * ever measured on one setting of each.
   */
  const eligibility = goRatedEligibility({ size, komi });

  // Training is rated by definition; the other two ask.
  const ratedEffective =
    (isTraining ? !!userId : rated && !!userId && !isLocal) && eligibility.rated;
  const loopMode: LocalGameMode = isLocal ? 'pass-and-play' : isTraining ? 'training' : 'bot';

  /**
   * Memoized on the two rules it carries. The loop treats the adapter as an
   * identity — it is a dependency of the bot turn, `handleMove`, `pass`, the
   * hint and the rating effect — so rebuilding it every render would re-fire
   * all of them.
   */
  const adapter = useMemo(
    () => makeGoAdapter({ size, komi, scoring }),
    [size, komi, scoring],
  );

  const game = useLocalGame<GoGameState>({
    adapter,
    mode: loopMode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    eloBounds: GO_TRAINING_ELO_BOUNDS,
    started,
  });

  const {
    timeline, viewIndex, setViewIndex, liveState, displayState, isAtLive,
    isThinking, manualEnd, ratingResult, saveError, retrySave,
    handleMove, pass, canPass, awaitingReview, resign, newGame, canGoBack, canGoForward,
    botElo, userRating, ratingLoading, hintsUsed, hintMove, isHinting, requestHint,
  } = game;

  // ── The end-of-game review ──────────────────────────────────────────────────

  /**
   * Marks held here rather than on the game state: they are a proposal until
   * the player accepts, and `finalize` is what commits them to the timeline.
   */
  const [dead, setDead] = useState<string[]>([]);

  // Seeded the moment the second pass lands, and cleared on the way out so a
  // resumed game that reaches a second review starts from a fresh proof.
  useEffect(() => {
    setDead(awaitingReview ? detectDeadStones(liveState) : []);
    // Only when the phase flips — recomputing per render would re-run the solver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingReview]);

  const reviewScore = useMemo(
    () => (awaitingReview ? GoEngine.scoreWith(liveState, dead) : null),
    [awaitingReview, liveState, dead],
  );

  /**
   * Shading stays on once the score is accepted. The player has just agreed to
   * a number; being able to see where it came from is the whole reason the
   * review exists, and it would be perverse to take the picture away at the
   * moment it becomes the final answer.
   */
  const showTerritory = awaitingReview || displayState.phase === 'scored';

  /**
   * Who each empty point counts for, with the marked stones already taken off —
   * the same function the tutorial's counting diagram is pinned against.
   */
  const ownership = useMemo(
    () =>
      showTerritory
        ? goOwnershipMap(goBoardWithoutStones(displayState.board, dead), displayState.size)
        : null,
    [showTerritory, displayState, dead],
  );

  const score = useMemo(
    () => (awaitingReview && reviewScore ? reviewScore : GoEngine.score(displayState)),
    [awaitingReview, reviewScore, displayState],
  );
  /**
   * The move list, and the position each entry jumps to.
   *
   * Read off the timeline rather than counted off the move history: leaving the
   * dead-stone review appends a position that is not a move, so `timeline[i+1]`
   * — which every other game's list can assume — is off by one for the rest of
   * a Go game that went through it. See `goTimelineRows`.
   */
  const rows = useMemo(() => goTimelineRows(timeline), [timeline]);
  const notation = useMemo(
    () => moveHistoryToGo(rows.map((row) => row.move)),
    [rows],
  );

  const lastMove = liveState.moveHistory[liveState.moveHistory.length - 1];
  const lastPlacedPos = lastMove?.position ?? null;

  // A hint of "pass" has no square to ring — it is spelled out in the sidebar
  // instead. That is a real answer in Go: knowing the game is over is a skill.
  const hintIsPass = hintMove?.from === GO_PASS;
  const hintPos = hintMove && !hintIsPass ? hintMove.to : null;

  const handleStart = () => setStarted(true);
  /** Back to the setup form (header New Game, result card Change setup). */
  const handleNewGame = () => {
    newGame();
    setDead([]);
    setStarted(false);
  };

  /**
   * Same size, komi, colour and strength, straight onto a fresh board.
   * `newGame` aborts any search still running for the finished one.
   */
  const handleRematch = () => {
    newGame();
    setDead([]);
  };

  // ── Setup screen ────────────────────────────────────────────────────────────

  if (!started) {
    const guestBlocked = isTraining && !userId;

    return (
      <div className="min-h-svh page-glow-go">
        <div className="container mx-auto px-4 pt-8">
          <ShellNav backHref="/go" />
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg mb-2 text-center">
            {isLocal ? 'Pass & Play' : isTraining ? 'Training' : 'Play vs Bot'}
          </h1>
          <p className="text-center text-fg-muted mb-8">
            {goRulesetSummary(size, komi, scoring)}
          </p>

          {/* Training matches the bot to you, so there is no tier to pick. */}
          {isTraining && (
            <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
              <h2 className="text-2xl font-semibold text-fg mb-2">Matched to your rating</h2>
              {guestBlocked ? (
                <p className="text-fg-muted">
                  Training is always rated, so it needs an account.{' '}
                  <Link href="/auth/signin" className="text-accent hover:underline">Sign in</Link> to play.
                </p>
              ) : (
                <p className="text-fg-muted">
                  {ratingLoading
                    ? 'Reading your rating…'
                    : `Your Go rating is ${userRating?.rating ?? 1200}. The bot will play there.`}
                  {' '}Hints cost {HINT_PENALTY} rating each.
                </p>
              )}
            </div>
          )}

          {mode === 'bot' && (
            <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
              <h2 className="text-2xl font-semibold text-fg mb-6">Bot Strength</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {GO_DIFFICULTY_LEVELS.map((level, i) => {
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
                      <DifficultyMeter
                        level={i + 1}
                        of={GO_DIFFICULTY_LEVELS.length}
                        className={`mb-2 ${selected ? 'text-accent' : 'text-fg-muted'}`}
                      />
                      <div className={`font-bold text-sm mb-0.5 ${selected ? 'text-accent' : 'text-fg'}`}>
                        {level.label}
                      </div>
                      <div className="text-xs text-fg-muted leading-snug">{level.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* SGF lives on the analysis page: a file is a whole game, and what
              you want with someone else's game is to walk it, not to take it
              over halfway through. */}
          <Link
            href="/go/analysis"
            className="mb-6 flex w-full items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-sm font-semibold text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
          >
            Have an SGF? Analyse it move by move →
          </Link>

          <GoRulesCard
            size={size}
            onSizeChange={setSize}
            komi={komi}
            onKomiChange={setKomi}
            scoring={scoring}
            onScoringChange={setScoring}
            showRatedNote={!isLocal}
          />

          {/* Nothing to choose in pass-and-play: the board never flips and black starts. */}
          {!isLocal && (
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
                        <circle
                          cx="20" cy="20" r="17"
                          fill={color === 'black' ? '#1b2130' : '#eae3d6'}
                          stroke={color === 'black' ? '#4a5468' : '#c3bbab'}
                          strokeWidth="1"
                        />
                        <ellipse
                          cx="15" cy="14" rx="5" ry="3.5"
                          fill={color === 'black' ? '#5a6478' : '#fff'}
                          opacity="0.5"
                        />
                      </svg>
                    </div>
                    <div className="font-semibold capitalize">{color}</div>
                    <div className={`text-sm ${playerColor === color ? 'text-on-accent/80' : 'text-fg-muted'}`}>
                      {color === 'black'
                        ? 'You move first'
                        : komi === 0
                          ? 'Moves second, no komi'
                          : `Gets ${komi} komi`}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === 'bot' && eligibility.rated && (
            <RatedToggle checked={rated} onChange={setRated} gameLabel="Go" userId={userId} />
          )}

          <SetupStartBar>
            <button
              onClick={handleStart}
              disabled={guestBlocked || (isTraining && ratingLoading)}
              className="w-full px-8 py-4 rounded-xl bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-lg [box-shadow:var(--shadow-glow-accent)] hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTraining ? 'Start Rated Game' : 'Start Game'}
            </button>
          </SetupStartBar>

          <p className="mt-6 text-center text-sm text-fg-subtle">
            New to Go?{' '}
            <Link href="/go/learn" className="text-accent hover:underline">Learn the rules</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────

  const gameOver = liveState.isGameOver || !!manualEnd;

  const gameOverMsg = manualEnd === 'resign'
    ? (isLocal ? `${capitalize(liveState.currentTurn)} resigned` : 'You resigned')
    : liveState.isGameOver
      ? `${describeMargin(liveState)}${liveState.deadStones.length > 0
          ? ` · ${liveState.deadStones.length} stone${liveState.deadStones.length === 1 ? '' : 's'} removed`
          : ''}`
      : null;

  const myResult: GameResult = manualEnd === 'resign'
    ? (isLocal ? 'win' : 'loss')
    : liveState.winner === null ? 'draw'
      : isLocal ? 'win'
      : liveState.winner === playerColor ? 'win' : 'loss';

  const localResultTitle = !isLocal || myResult === 'draw'
    ? undefined
    : manualEnd === 'resign'
      ? `${capitalize(liveState.currentTurn === 'black' ? 'white' : 'black')} wins`
      : liveState.winner
        ? `${capitalize(liveState.winner)} wins`
        : undefined;

  const yourTurn = isAtLive && !isThinking && !gameOver && liveState.currentTurn === playerColor;
  const bottomColor = isLocal ? 'black' : playerColor;
  const topColor: GoColor = bottomColor === 'black' ? 'white' : 'black';
  const boardColor = isLocal ? liveState.currentTurn : playerColor;
  const canAct = isAtLive && !gameOver && !awaitingReview && (isLocal || yourTurn);

  /**
   * Only two people sharing a screen may change the marks. Against the bot they
   * are what the solver could prove and nothing else — otherwise a rated game
   * could be won by declaring the opponent's living groups dead. Disagreeing
   * with the bot works the way it does over a real board: resume and play on.
   */
  const canMark = awaitingReview && isAtLive && isLocal;
  const acceptScore = () => handleMove(goFinalizeMove(dead), '');
  const resumePlay = () => handleMove(GO_RESUME, '');

  return (
    <>
      <GameScreenLayout
        accent="go"
        backHref="/go"
        headerActions={
          <>
            {saveError && (
              <button
                onClick={retrySave}
                className="text-xs px-2.5 py-1 bg-danger/15 text-danger-hover border border-danger/40 rounded-full hover:bg-danger/25 transition-colors"
              >
                Save failed — retry
              </button>
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
          <PlayerCard
            name={isLocal ? capitalize(topColor) : 'Bot'}
            initial={isLocal ? capitalize(topColor)[0] : 'B'}
            active={isLocal ? liveState.currentTurn === topColor && !gameOver : isThinking}
            subline={
              isLocal
                ? (liveState.currentTurn === topColor && !gameOver ? 'to move' : `Playing ${topColor}`)
                : isThinking ? `${goEloLabel(botElo)} · thinking…` : goEloLabel(botElo)
            }
          />
        }
        topExtras={<GoScoreBar score={score} captured={displayState.captured} />}
        board={
          <GoBoard
            gameState={displayState}
            // A placement has no origin, so `from === to` — the convention
            // reversi's board already uses for the same reason.
            onMove={position => handleMove(position, position)}
            playerColor={boardColor}
            showCoordinates
            highlightPos={isAtLive && !awaitingReview ? lastPlacedPos : null}
            hintPos={hintPos}
            interactive={canAct || canMark}
            deadStones={awaitingReview ? dead : undefined}
            ownership={ownership}
            onMarkToggle={
              canMark
                ? position => setDead(prev => toggleDeadChain(liveState, prev, position))
                : undefined
            }
          />
        }
        bottomCard={
          <PlayerCard
            name={isLocal ? capitalize(bottomColor) : 'You'}
            initial={isLocal ? capitalize(bottomColor)[0] : 'Y'}
            isYou={!isLocal}
            active={isLocal ? liveState.currentTurn === bottomColor && !gameOver : yourTurn}
            subline={
              isLocal
                ? (liveState.currentTurn === bottomColor && !gameOver ? 'to move' : `Playing ${bottomColor}`)
                : `Playing ${playerColor}${yourTurn ? ' · your move' : ''}`
            }
          />
        }
        sidebar={
          <>
            <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {!isLocal && (
                  <div className="flex gap-1.5">
                    <span className="text-fg-muted">Bot:</span>
                    <span className="font-semibold text-fg">{goEloLabel(botElo)}</span>
                  </div>
                )}
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Playing:</span>
                  <span className="font-semibold text-fg capitalize">{isLocal ? 'both' : playerColor}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Turn:</span>
                  <span className="font-semibold text-fg capitalize">
                    {gameOver || awaitingReview ? '—' : liveState.currentTurn}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Komi:</span>
                  <span className="font-semibold text-fg">{liveState.komi || 'none'}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Scoring:</span>
                  <span className="font-semibold text-fg capitalize">{liveState.scoring}</span>
                </div>
              </div>

              <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-fg-subtle">
                Two passes end the game. You then agree which groups are dead
                before the board is counted.
              </p>

              <div className="mt-3">
                <GoSgfButton state={liveState} />
              </div>
            </div>

            {isTraining && (
              <div className="shrink-0 flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-fg">Hint</p>
                  <p className="text-xs text-fg-muted">
                    {hintsUsed > 0 ? `${hintsUsed} used · −${hintsUsed * HINT_PENALTY} rating` : `Costs ${HINT_PENALTY} rating`}
                  </p>
                  {/* Spelled out as well as ringed: a screen reader gets nothing
                      from a coloured circle, and "pass" has no square at all. */}
                  {hintMove && (
                    <p className="mt-1 text-xs font-semibold text-warning-hover" role="status">
                      {hintIsPass ? 'Best move: pass' : `Best move: ${notationFor(hintMove.to)}`}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={requestHint}
                  disabled={!canAct || isHinting}
                >
                  {isHinting ? 'Thinking…' : 'Hint'}
                </Button>
              </div>
            )}

            {/* Move list */}
            <div className="flex-1 min-h-0 bg-white/[0.04] rounded-xl border border-white/10 flex flex-col">
              <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/10">
                <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Moves</span>
                <div className="flex gap-1">
                  {[
                    { label: '⇤', action: () => setViewIndex(0), disabled: !canGoBack },
                    { label: '←', action: () => setViewIndex(Math.max(0, viewIndex - 1)), disabled: !canGoBack },
                    { label: '→', action: () => setViewIndex(Math.min(timeline.length - 1, viewIndex + 1)), disabled: !canGoForward },
                    { label: '⇥', action: () => setViewIndex(timeline.length - 1), disabled: !canGoForward },
                  ].map(({ label, action, disabled }) => (
                    <button key={label} onClick={action} disabled={disabled}
                      className="w-7 h-7 flex items-center justify-center rounded text-xs font-mono bg-white/5 border border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 text-sm font-mono">
                {rows.length === 0 ? (
                  <p className="text-fg-subtle text-xs text-center py-4">No moves yet</p>
                ) : (
                  <div className="space-y-0.5">
                    {rows.map(({ index, move }, i) => {
                      const moveNum = Math.floor(i / 2) + 1;
                      const isBlack = move.color === 'black';
                      const isActive = viewIndex === index;
                      return (
                        <div key={index} className="flex items-center gap-1">
                          {isBlack
                            ? <span className="text-fg-subtle w-6 shrink-0 text-right pr-0.5 text-xs">{moveNum}.</span>
                            : <span className="w-6 shrink-0" />}
                          <button
                            onClick={() => setViewIndex(index)}
                            className={`flex-1 text-left px-2 py-0.5 rounded transition-colors text-xs ${
                              isActive
                                ? 'bg-[color-mix(in_srgb,var(--c-accent)_18%,transparent)] text-[var(--c-accent-text)] font-semibold'
                                : 'text-fg-muted hover:bg-white/5'
                            }`}
                          >
                            <span className="mr-1 opacity-60">{move.color === 'black' ? '⬤' : '○'}</span>
                            {notation[i]}
                            {move.captures.length > 0 && (
                              <span className="ml-1 opacity-50 text-2xs">×{move.captures.length}</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* The review takes the Pass button's place: while it is open there
                is nothing to pass, and these are the only two moves left. */}
            {awaitingReview && reviewScore ? (
              <GoMarkingPanel
                score={reviewScore}
                deadCount={dead.length}
                editable={canMark}
                onAccept={acceptScore}
                onResume={resumePlay}
              />
            ) : (
              /* Pass sits with the other turn-ending actions rather than on the
                 board, because it IS a move — and it is how every game ends. */
              <Button
                className="shrink-0"
                variant="secondary"
                fullWidth
                onClick={pass}
                disabled={!canAct || !canPass}
              >
                Pass
              </Button>
            )}

            {/* Go has no draw offers — the players agree a score, not a draw. */}
            <GameActions
              className="shrink-0"
              onResign={resign}
              disabled={gameOver || awaitingReview}
            />
          </>
        }
      />

      <GameResultScreen
        open={gameOver}
        result={myResult}
        title={localResultTitle}
        subtitle={gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        actions={
          <>
            {/* The full count, because an area score is not self-evident from
                the board the way a disc count is. */}
            <p className="text-sm text-fg-muted text-center">
              Black {GoEngine.score(liveState).black} · White {GoEngine.score(liveState).white}
              <span className="text-fg-subtle">
                {liveState.komi > 0 ? ` (incl. ${liveState.komi} komi)` : ' (no komi)'}
              </span>
            </p>
            <ResultActions
              onRematch={handleRematch}
              onChangeSetup={handleNewGame}
              backHref="/go"
              backLabel="Back to Go"
            />
          </>
        }
      />
    </>
  );
}

/** Engine position → the coordinate a player reads (I is skipped). */
function notationFor(position: string): string {
  return moveHistoryToGo([{ position, color: 'black', captures: [] }])[0];
}
