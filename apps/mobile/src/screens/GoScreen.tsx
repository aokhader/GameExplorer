import { useEffect, useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import {
  GoEngine,
  detectDeadStones,
  goBoardWithoutStones,
  goOwnershipMap,
  moveHistoryToGo,
  toGoPoint,
  stateToSgf,
  toggleDeadChain,
  type GoColor,
  type GoGameState,
  type GoScoring,
} from '@gameexplorer/shared';
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
import { COLORS, GAME_ACCENTS, GO_STONE_STYLE, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Toggle } from '@/components/ui';
import { GoBoard } from '@/board/GoBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { BackToHomeButton } from '@/game/resultDismiss';
import { OpponentPicker, type SetupMode } from '@/game/OpponentPicker';
import { PuzzlesCard } from '@/game/PuzzlesCard';
import { SetupHero } from '@/game/SetupHero';
import { LearnLink } from '@/game/LearnLink';
import { AnalysisCard } from '@/game/AnalysisCard';
import { MoveBand } from '@/game/MoveBand';
import { GameBar } from '@/game/GameBar';
import { GoReviewBar } from '@/game/GoReviewBar';
import { GoRulesCard } from '@/game/GoRulesCard';
import { TrainingSetup } from '@/game/TrainingSetup';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';

/**
 * Modes Go offers. No online — the socket protocol seats two known game types
 * and Go is not one of them yet.
 */
const GO_MODES: readonly SetupMode[] = ['bot', 'training', 'pass-and-play', 'puzzles'];

/** "black" → "Black" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}

function InfoCell({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <View style={{ width: '50%', flexDirection: 'row', gap: 6, paddingVertical: 3 }}>
      <Text style={{ color: COLORS.fgMuted, fontSize: 12 }}>{label}:</Text>
      <Text
        style={{
          color: COLORS.fg,
          fontSize: 12,
          fontFamily: FONTS.bodyBold,
          textTransform: capitalize ? 'capitalize' : 'none',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/**
 * Go vs bot, training, or pass-and-play — the tap-only board flow, built on the
 * same `useLocalGame` loop as the other three games and the same one web's Go
 * screen now runs.
 *
 * Two things are Go's own. **Passing is a button**, because it is an ordinary
 * move and two in a row are how every game ends — the other games' passes are
 * either forced (reversi) or impossible (chess, checkers). And the **score is a
 * running estimate**, not a fact: a disc count IS reversi's score, whereas Go's
 * area only settles once both players pass, so the sidebar shows it as a
 * projection and the result screen shows the count that decided it.
 */
export function GoScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [mode, setMode] = useState<SetupMode>('bot');
  const [targetElo, setTargetElo] = useState(1100);
  const [playerColor, setPlayerColor] = useState<GoColor>('black');
  const [rated, setRated] = useState(true);
  const [started, setStarted] = useState(false);
  const [size, setSize] = useState(GO_RATED_SIZE);
  const [komi, setKomi] = useState(GO_RATED_KOMI);
  const [scoring, setScoring] = useState<GoScoring>('area');

  const online = useIsOnline();
  const router = useRouter();
  const isPuzzles = mode === 'puzzles';
  const isPassAndPlay = mode === 'pass-and-play';
  const isTraining = mode === 'training';
  const isBotSetup = mode === 'bot';
  const picksColor = mode === 'bot' || mode === 'training';

  /**
   * What makes a game count, in one shared place — see `goRatedEligibility`.
   * Board size and komi both move the goalposts, and the bot's ladder was only
   * ever measured on one setting of each.
   */
  const eligibility = goRatedEligibility({ size, komi });

  // Rated needs connectivity at game start (the offline semantics every mobile
  // game screen follows). Training is rated by definition, so it has no toggle.
  const ratedEffective =
    (isTraining ? !!userId && online : rated && !!userId && !isPassAndPlay && online) &&
    eligibility.rated;

  const gameMode: LocalGameMode = isPassAndPlay ? 'pass-and-play' : isTraining ? 'training' : 'bot';

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
    mode: gameMode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    eloBounds: GO_TRAINING_ELO_BOUNDS,
    // Puzzles are their own screen behind their own route; keeping the loop out
    // of them is what stops a game being set up behind the setup screen.
    started: started && !isPuzzles,
  });

  const botElo = game.botElo;
  const canStart = isTraining ? ratedEffective && !game.ratingLoading : true;

  // ── The end-of-game review ──────────────────────────────────────────────────

  /**
   * Marks held here rather than on the game state: they are a proposal until the
   * player accepts, and `finalize` is what commits them to the timeline.
   */
  const [dead, setDead] = useState<string[]>([]);
  const awaitingReview = game.awaitingReview;

  const handleNewGame = () => {
    game.newGame();
    setDead([]);
    setStarted(false);
  };

  // Seeded the moment the second pass lands, and cleared on the way out so a
  // resumed game that reaches a second review starts from a fresh proof.
  useEffect(() => {
    setDead(awaitingReview ? detectDeadStones(game.liveState) : []);
    // Only when the phase flips — recomputing per render would re-run the solver.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingReview]);

  const reviewScore = useMemo(
    () => (awaitingReview ? GoEngine.scoreWith(game.liveState, dead) : null),
    [awaitingReview, game.liveState, dead],
  );

  /**
   * Shading stays on once the score is accepted. The player has just agreed to a
   * number, and being able to see where it came from is the whole reason the
   * review exists.
   */
  const showTerritory = awaitingReview || game.displayState.phase === 'scored';

  const ownership = useMemo(
    () =>
      showTerritory
        ? goOwnershipMap(goBoardWithoutStones(game.displayState.board, dead), game.displayState.size)
        : null,
    [showTerritory, game.displayState, dead],
  );

  /**
   * The move ribbon, and the position each chip jumps to.
   *
   * Above the setup-screen early return: hooks can't be called conditionally.
   * Read off the timeline rather than counted off the move history — leaving the
   * dead-stone review appends a position that is not a move, and the count and
   * the timeline disagree from there on. See `goTimelineRows`.
   */
  const rows = useMemo(() => goTimelineRows(game.timeline), [game.timeline]);
  const goMoves = useMemo(() => moveHistoryToGo(rows.map((row) => row.move)), [rows]);
  const movePositions = useMemo(() => rows.map((row) => row.index), [rows]);
  const score = useMemo(
    () => (awaitingReview && reviewScore ? reviewScore : GoEngine.score(game.displayState)),
    [awaitingReview, reviewScore, game.displayState],
  );

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <Screen>
        <GlowBackdrop
          blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: GAME_ACCENTS.go.base, opacity: 0.16 }]}
        />
        <BackHeader fallbackHref="/" />
        <SetupHero game="go" />

        <LearnLink game="go" label="New to Go? How to play →" />

        <OpponentPicker
          value={mode}
          onChange={setMode}
          accent={GAME_ACCENTS.go.base}
          tint={GAME_ACCENTS.go.tintBg}
          modes={GO_MODES}
        />

        {/*
          * SGF is the format every other Go program writes, so this is how a
          * game from OGS or a book gets looked at here. It sits under the mode
          * grid rather than in it: nothing is played, an existing game is
          * studied.
          */}
        <AnalysisCard game="go" />

        {isPuzzles ? (
          <PuzzlesCard game="go" />
        ) : (
          <Text style={{ color: COLORS.fgSubtle, fontSize: 12, marginBottom: 20 }}>
            {goRulesetSummary(size, komi, scoring)}
          </Text>
        )}

        {!isPuzzles && (
        <GoRulesCard
          size={size}
          onSizeChange={setSize}
          komi={komi}
          onKomiChange={setKomi}
          scoring={scoring}
          onScoringChange={setScoring}
          showRatedNote={!isPassAndPlay}
        />
        )}

        {isTraining && (
          <TrainingSetup
            game="go"
            rating={game.userRating}
            loading={game.ratingLoading}
            botElo={botElo}
            signedIn={!!userId}
            online={online}
          />
        )}

        {isBotSetup && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
              Bot strength
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {GO_DIFFICULTY_LEVELS.map((level) => {
                const selected = targetElo === level.elo;
                return (
                  <Pressable
                    key={level.elo}
                    onPress={() => setTargetElo(level.elo)}
                    accessibilityRole="button"
                    accessibilityLabel={`${level.label} bot — ${level.description}`}
                    accessibilityState={{ selected }}
                    style={{
                      flexGrow: 1,
                      flexBasis: '47%',
                      borderRadius: 14,
                      borderWidth: 2,
                      padding: 12,
                      backgroundColor: selected ? GAME_ACCENTS.go.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.go.base : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                    <Text style={{ color: selected ? GAME_ACCENTS.go.base : COLORS.fg, fontSize: 14, fontFamily: FONTS.bodyBold }}>
                      {level.label}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {picksColor && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
              Your color
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {(['black', 'white'] as const).map((color) => {
                const selected = playerColor === color;
                const stone = GO_STONE_STYLE[color];
                return (
                  <Pressable
                    key={color}
                    onPress={() => setPlayerColor(color)}
                    accessibilityRole="button"
                    accessibilityLabel={`Play as ${color}`}
                    accessibilityState={{ selected }}
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      borderWidth: 2,
                      padding: 16,
                      alignItems: 'center',
                      backgroundColor: selected ? GAME_ACCENTS.go.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.go.base : COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        marginBottom: 8,
                        backgroundColor: stone.body[1].color,
                        borderWidth: 2,
                        borderColor: stone.border,
                      }}
                    />
                    <Text
                      style={{
                        color: selected ? GAME_ACCENTS.go.base : COLORS.fg,
                        fontSize: 15,
                        fontFamily: FONTS.bodyBold,
                        textTransform: 'capitalize',
                      }}
                    >
                      {color}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
                      {color === 'black'
                        ? 'You move first'
                        : komi === 0
                          ? 'Moves second, no komi'
                          : `Gets ${komi} komi`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {isBotSetup && eligibility.rated && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>Rated</Text>
              <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
                {!userId
                  ? 'Sign in to play rated games'
                  : !online
                    ? 'Offline — rated games need a connection'
                    : 'Updates your Go rating'}
              </Text>
            </View>
            <Toggle value={ratedEffective} onValueChange={setRated} label="Rated" disabled={!userId || !online} />
          </View>
        )}

        {isPassAndPlay && (
          <Text style={{ color: COLORS.fgSubtle, fontSize: 12, marginBottom: 24 }}>
            Two players share this device — Black moves first, and the board stays put between
            turns.
          </Text>
        )}

        <Button
          label={isPuzzles ? 'Start Puzzles' : isTraining ? 'Start Rated Game' : 'Start Game'}
          onPress={() => (isPuzzles ? router.push('/puzzles/go' as never) : setStarted(true))}
          disabled={!canStart}
          glow
        />
      </Screen>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const { liveState, displayState, isAtLive, isThinking, manualEnd, ratingResult } = game;

  const mover = liveState.currentTurn;
  const moverOther: GoColor = mover === 'black' ? 'white' : 'black';
  const pnpWinner = manualEnd === 'resign' ? moverOther : liveState.winner;

  const finalScore = GoEngine.score(liveState);
  // A level game is real Go (jigo), and reachable at the integer komi presets.
  const margin =
    finalScore.lead === 0
      ? 'a level game'
      : `${finalScore.lead > 0 ? 'Black' : 'White'} by ${Math.abs(finalScore.lead)}`;
  const removed = liveState.deadStones.length;
  const removedNote = removed > 0 ? ` · ${removed} stone${removed === 1 ? '' : 's'} removed` : '';

  let gameOverMsg: string | null = null;
  if (manualEnd === 'resign') {
    gameOverMsg = isPassAndPlay ? `${cap(mover)} resigned — ${cap(moverOther)} wins` : 'You resigned';
  } else if (liveState.isGameOver) {
    gameOverMsg = isPassAndPlay
      ? `${margin}${removedNote}`
      : liveState.winner === playerColor
        ? `You win — ${margin} 🎉`
        : liveState.winner === null
          ? `Level — ${margin}`
          : `Bot wins — ${margin}`;
  }

  const myResult: GameResult = isPassAndPlay
    ? pnpWinner
      ? 'win'
      : 'draw'
    : manualEnd === 'resign'
      ? 'loss'
      : liveState.winner === null
        ? 'draw'
        : liveState.winner === playerColor
          ? 'win'
          : 'loss';

  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;
  const moverTurn = isAtLive && !gameOverMsg;
  const lastPlaced = liveState.moveHistory[liveState.moveHistory.length - 1]?.position ?? null;
  const botLabel = isTraining ? `${botElo} · ${goEloLabel(botElo)}` : goEloLabel(targetElo);
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd && !awaitingReview;

  /**
   * Only two people sharing a phone may change the marks. Against the bot they
   * are what the solver could prove and nothing else — otherwise a rated game
   * could be won by declaring the opponent's living groups dead. Disagreeing
   * with the bot works the way it does over a real board: resume and play on.
   */
  const canMark = awaitingReview && isAtLive && isPassAndPlay;
  const acceptScore = () => game.handleMove(goFinalizeMove(dead), '');

  /**
   * Hand the finished game to any other Go app, as SGF.
   *
   * Go is the one game here with an interchange format its players actually
   * use, so this is the difference between a game that can be shown to a
   * teacher or run through a stronger engine and one that only exists inside
   * this app. The share sheet rather than a file: on a phone the destination is
   * a message or another app, not the filesystem.
   */
  const shareSgf = () => {
    const sgf = stateToSgf(liveState);
    Share.share({ message: sgf, title: 'Go game (SGF)' }).catch(() => {
      // The user dismissing the sheet rejects on some platforms. Nothing to
      // report and nothing to recover.
    });
  };
  const resumePlay = () => game.handleMove(GO_RESUME, '');
  // The Go board never flips; in pass-and-play `playerColor` is the tap gate, so
  // it follows whoever is to move.
  const boardColor: GoColor = isPassAndPlay ? mover : playerColor;
  // A hint of "pass" has no point to ring — the info card names it instead.
  const hintIsPass = game.hintMove?.from === GO_PASS;
  const hintPos = game.hintMove && !hintIsPass ? game.hintMove.to : null;

  return (
    <>
      <GameScreenLayout
        accent="go"
        backHref="/"
        title="Go"
        topCard={
          isPassAndPlay ? (
            <PlayerCard
              name="White"
              initial="W"
              active={moverTurn && mover === 'white'}
              subline={`White stones${moverTurn && mover === 'white' ? ' · to move' : ''}`}
            />
          ) : (
            <PlayerCard
              name="Bot"
              initial="B"
              active={isThinking}
              subline={`${botLabel}${isThinking ? ' · thinking…' : ''}`}
            />
          )
        }
        board={
          <GoBoard
            gameState={displayState}
            onMove={(pos) => game.handleMove(pos, pos)}
            playerColor={boardColor}
            highlightPos={isAtLive && !awaitingReview ? lastPlaced : null}
            hintPos={isAtLive ? hintPos : null}
            interactive={interactive || canMark}
            deadStones={awaitingReview ? dead : undefined}
            ownership={ownership}
            onMarkToggle={
              canMark ? (pos) => setDead((prev) => toggleDeadChain(liveState, prev, pos)) : undefined
            }
          />
        }
        bottomCard={
          isPassAndPlay ? (
            <PlayerCard
              name="Black"
              initial="B"
              active={moverTurn && mover === 'black'}
              subline={`Black stones${moverTurn && mover === 'black' ? ' · to move' : ''}`}
            />
          ) : (
            <PlayerCard
              name="You"
              initial="Y"
              isYou
              active={yourTurn}
              subline={`Playing ${playerColor}${yourTurn ? ' · your move' : ''}`}
            />
          )
        }
        sidebar={
          <>
            <MoveBand
              moves={goMoves}
              positions={movePositions}
              viewIndex={game.viewIndex}
              onSeek={game.setViewIndex}
              accent="go"
            />

            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {isPassAndPlay ? (
                  <InfoCell label="Mode" value="Pass & Play" />
                ) : (
                  <>
                    <InfoCell label="Bot" value={botLabel} />
                    <InfoCell label="Playing" value={playerColor} capitalize />
                  </>
                )}
                <InfoCell
                  label="Turn"
                  value={gameOverMsg || awaitingReview ? '—' : liveState.currentTurn}
                  capitalize
                />
                <InfoCell label="Komi" value={liveState.komi === 0 ? 'none' : String(liveState.komi)} />
                <InfoCell label="Scoring" value={liveState.scoring} capitalize />
                {isTraining && (
                  <InfoCell
                    label="Hints"
                    // The ring is a visual cue only; naming the point here is what
                    // makes the paid-for advice reachable without sight.
                    value={
                      game.hintMove
                        ? `${game.hintsUsed} · ${hintIsPass ? 'pass' : `play ${toGoPoint(game.hintMove.to)}`}`
                        : String(game.hintsUsed)
                    }
                  />
                )}
              </View>

              {/* Running area, not a settled score — and the one thing area
                  scoring demands of the player, said before they pass. */}
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 16,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.fg, fontSize: 13, fontFamily: FONTS.bodyBold }}>
                  Black {score.black}
                </Text>
                <Text style={{ color: COLORS.fgMuted, fontSize: 12 }}>vs</Text>
                <Text style={{ color: COLORS.fg, fontSize: 13, fontFamily: FONTS.bodyBold }}>
                  White {score.white}
                </Text>
              </View>
              {/* How many stones the number above assumes are gone — the player
                  is being asked to check the marks, so say how many there are. */}
              {awaitingReview && dead.length > 0 && (
                <Text style={{ color: COLORS.fgMuted, fontSize: 11, textAlign: 'center' }}>
                  {dead.length} stone{dead.length === 1 ? '' : 's'} removed
                </Text>
              )}
              <Text style={{ color: COLORS.fgSubtle, fontSize: 11, lineHeight: 15 }}>
                {awaitingReview
                  ? canMark
                    ? 'Both players passed. Tap a group to mark it dead or bring it back — groups with two eyes cannot be marked.'
                    : dead.length > 0
                      ? 'Both players passed. Dead groups have been taken off; if you disagree, resume and settle it on the board.'
                      : 'Both players passed. Nothing could be proved dead — if a group should come off, resume and capture it.'
                  : 'Two passes end the game. You then agree which groups are dead before the board is counted.'}
              </Text>
            </View>
          </>
        }
        bottomBar={
          awaitingReview ? (
            <GoReviewBar onAccept={acceptScore} onResume={resumePlay} />
          ) : (
          <GameBar
            viewIndex={game.viewIndex}
            total={game.timeline.length}
            onSeek={game.setViewIndex}
            accent="go"
            // No flip (playerColor is also the pass-and-play tap gate) and no
            // draw offers — a .5 komi means a scored board can never tie.
            onNewGame={handleNewGame}
            onResign={game.resign}
            onPass={game.pass}
            passDisabled={!interactive || (!isPassAndPlay && !yourTurn)}
            gameOver={!!gameOverMsg}
            onHint={isTraining ? game.requestHint : undefined}
            hintDisabled={!yourTurn}
            hintPending={game.isHinting}
            hintsUsed={game.hintsUsed}
          />
          )
        }
      />

      <GameResultScreen
        open={!!gameOverMsg}
        result={myResult}
        title={isPassAndPlay && pnpWinner ? `${cap(pnpWinner)} Wins!` : undefined}
        subtitle={
          manualEnd === 'resign'
            ? gameOverMsg ?? undefined
            : `${gameOverMsg ?? ''} · Black ${finalScore.black}, White ${finalScore.white}`.trim()
        }
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        hintsUsed={ratingResult?.hintsUsed}
        saveError={game.saveError}
        onRetrySave={game.retrySave}
        actions={
          <>
            <Button label="Play Again" onPress={handleNewGame} glow />
            <Button label="Share as SGF" onPress={shareSgf} variant="secondary" />
            <BackToHomeButton />
          </>
        }
      />
    </>
  );
}
