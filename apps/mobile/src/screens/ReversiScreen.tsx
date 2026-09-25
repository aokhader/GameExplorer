import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import {
  ReversiEngine,
  moveHistoryToReversi,
  type ReversiGameState,
  type ReversiColor,
  ABORT_MOVE_LIMIT,
} from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, REVERSI_DISC_COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Toggle } from '@/components/ui';
import { DifficultyMeter } from '@/game/DifficultyMeter';
import { ReversiBoard } from '@/board/ReversiBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { BackToHomeButton, ChangeSetupButton } from '@/game/resultDismiss';
import { OpponentPicker } from '@/game/OpponentPicker';
import { PuzzlesCard } from '@/game/PuzzlesCard';
import { SetupHeading } from '@/game/SetupHeading';
import { LearnLink } from '@/game/LearnLink';
import { LessonsCard } from '@/game/LessonsCard';
import { MoveBand } from '@/game/MoveBand';
import { GameBar } from '@/game/GameBar';
import { TrainingSetup } from '@/game/TrainingSetup';
import { eloLabel } from '@/game/eloLabel';
import { useSetupDeepLink } from '@/game/useSetupDeepLink';
import { useGameSetup, useUnfinishedGame } from '@/game/useGameSetup';
import { ContinueCard, SetupStartFooter } from '@/game/ContinueCard';
import { nativeLocalStore } from '@/lib/localStore';
import type { UnfinishedGame } from '@gameexplorer/client/game/unfinishedGame';
import { ReversiOnline } from '@/multiplayer/ReversiOnline';
import { OnlineSetupCard } from '@/multiplayer/OnlineSetupCard';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { reversiAnalysis } from '@/analysis/adapters';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { reversiAdapter } from '@/engine/reversiAdapter';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';


const DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Plays randomly, ignores corners' },
  { elo: 800, label: 'Casual', description: 'Spots basic flips, misses strategy' },
  { elo: 1100, label: 'Club', description: 'Uses positional heuristics' },
  { elo: 1400, label: 'Strong', description: 'Controls corners and mobility' },
  { elo: 1700, label: 'Expert', description: 'Deep tactical and positional play' },
  { elo: 2000, label: 'Master', description: 'Near-optimal — very hard to beat' },
] as const;

function labelForElo(elo: number): string {
  return DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

/**
 * Range the rating-matched training bot is clamped into — the span the reversi
 * bot is actually calibrated across (same bounds web's training page uses).
 */
const TRAINING_ELO_BOUNDS = { min: 400, max: 2000 };

/** "black" → "Black" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}


/**
 * Reversi vs bot or pass-and-play — the tap-only board flow. A setup screen
 * (opponent + strength + color + rated toggle) hands off to the in-game shell
 * driven by `useLocalGame`, which auto-passes for either side (reversi's one
 * special turn rule) via the adapter in both modes. Bot mode mirrors web's
 * `reversi/bot/page.tsx`, reusing the same shared engine, bot, rating math, and
 * `saveReversiGame` writer so results match web exactly. Pass-and-play (M4) runs
 * the same loop with no bot and no save; the board never flips, so the only
 * per-turn change is which color may tap.
 */
export function ReversiScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // ?elo=&start=1 from the welcome tour, ?online=1&invite= from an invite link,
  // ?resume=1 from the launcher. Read once.
  const deepLink = useSetupDeepLink(DIFFICULTY_LEVELS.map((l) => l.elo));
  // The form remembers what was chosen last time; a started game keeps the setup
  // it began with. See `useGameSetup`.
  const setup = useGameSetup('reversi', deepLink);
  const unfinished = useUnfinishedGame('reversi');
  const { mode, setMode, started } = setup;
  const targetElo = setup.setup.elo;
  const playerColor = setup.setup.color;
  const rated = setup.setup.rated;
  // Post-game review. Only reachable once the game is over — see the GameBar
  // handler below.
  const [reviewing, setReviewing] = useState(false);

  const online = useIsOnline();
  const isPassAndPlay = mode === 'pass-and-play';
  const isTraining = mode === 'training';
  // Puzzles configure nothing and start no game — the whole setup below collapses
  // to one card and the Start button becomes a link.
  const isPuzzles = mode === 'puzzles';
  // Online is configured on its own screen (time control, rated, invite), so the
  // setup below collapses to one explanatory card, like puzzles.
  const isOnlineMode = mode === 'online';
  // The plain-bot knobs: training picks strength and rating for you, and none of
  // pass-and-play, puzzles or online has either.
  const isBotSetup = mode === 'bot';
  // Colour is picked in both bot modes.
  const picksColor = mode === 'bot' || mode === 'training';
  // Rated needs connectivity at game start (offline semantics — mobile plan).
  // Training is rated by definition, so it has no toggle — signed in + online
  // is exactly what it requires, and the setup panel says so when it's missing.
  const ratedEffective = isTraining
    ? !!userId && online
    : rated && !!userId && !isPassAndPlay && online;

  // Neither puzzles nor online is a `LocalGameMode` — puzzles leave through the
  // router, and online is driven by the server session. 'bot' is the inert
  // stand-in while the picker sits on either, and `started` is withheld below so
  // this hook never actually runs a game underneath one of them.
  const isLocalMode = !isPuzzles && !isOnlineMode;
  const gameMode: LocalGameMode = isLocalMode ? mode : 'bot';

  const game = useLocalGame<ReversiGameState>({
    adapter: reversiAdapter,
    mode: gameMode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    eloBounds: TRAINING_ELO_BOUNDS,
    started: started && isLocalMode,
    persistence: { store: nativeLocalStore, game: 'reversi', setup: setup.setup },
  });

  // Training matches the bot to the player; every other mode uses the picked tier.
  const botElo = game.botElo;
  const canStart = isTraining
    ? ratedEffective && !game.ratingLoading
    : isOnlineMode
      ? !!userId && online
      : true;

  /**
   * Back to the setup screen (game bar New Game, result card Change setup). A game
   * left unfinished stays saved, and the Continue card reads it back.
   */
  /**
   * Cancel a game nobody has really started yet: no rating, no saved row, no
   * slot to come back to. Offered instead of Resign for the opening moves
   * (`ABORT_MOVE_LIMIT`), the rule multiplayer already enforces.
   */
  const handleAbort = () => {
    game.abort();
    setup.stop();
    unfinished.refresh();
  };

  const handleNewGame = () => {
    game.newGame();
    setup.stop();
    unfinished.refresh();
    setReviewing(false);
  };

  /** Pick a saved game up where it was left — its moves first, then the board. */
  const resumeSaved = (saved: UnfinishedGame) => {
    setReviewing(false);
    if (game.restore(saved)) setup.resume(saved);
    // Moves these rules reject describe no position anyone can play or score.
    else void unfinished.settle({ resign: true }).catch(() => {});
  };

  // The launcher's Continue opens this screen with `?resume=1`.
  const [awaitingResume, setAwaitingResume] = useState(deepLink.resume);
  useEffect(() => {
    if (!awaitingResume || !setup.ready || !unfinished.hydrated) return;
    setAwaitingResume(false);
    if (unfinished.saved && !unfinished.saved.end && !started) resumeSaved(unfinished.saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingResume, setup.ready, unfinished.hydrated]);

  /** The next game with the same setup, on the same board — see ChessScreen. */
  const handleRematch = () => {
    game.newGame();
    setReviewing(false);
  };

  // Standard reversi notation — just the square each disc went on.
  // Above the setup-screen early return: hooks can't be called conditionally.
  const reversiMoves = useMemo(
    () => moveHistoryToReversi(game.timeline[game.timeline.length - 1].moveHistory),
    [game.timeline],
  );

  const analysis = useGameAnalysis({
    adapter: reversiAnalysis,
    timeline: game.timeline,
    viewIndex: game.viewIndex,
    enabled: reviewing,
  });

  // ── Online ──────────────────────────────────────────────────────────────────
  // Mounted only once online play has started, so a bot game never opens a
  // websocket it has no use for. Sits after every hook above it, so the hook
  // order is the same on every render.
  if (started && isOnlineMode) {
    return <ReversiOnline inviteId={deepLink.inviteId} onExit={setup.stop} />;
  }

  // Nothing to show until the remembered setup is known, or while a link is about
  // to replace the form with a game.
  if (!started && (!setup.ready || setup.awaitingAutoStart || awaitingResume)) {
    return <Screen scroll={false}>{null}</Screen>;
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    // Pinned under the scrolling form rather than at its end.
    const startButton = (
      <SetupStartFooter
        label={
          isPuzzles
            ? 'Start Puzzles'
            : isOnlineMode
              ? 'Find an Opponent'
              : isTraining
                ? 'Start Rated Game'
                : 'Start Game'
        }
        onStart={isPuzzles ? () => router.push('/puzzles/reversi' as never) : setup.start}
        disabled={!canStart}
        saved={unfinished.saved}
        onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
        onSettle={unfinished.settle}
        settling={unfinished.settling}
        leavesGame={isPuzzles || isOnlineMode}
      />
    );

    return (
      <Screen footer={startButton}>
        <BackHeader fallbackHref="/" />
        <SetupHeading game="reversi" />

        {unfinished.saved && (
          <View style={{ marginBottom: 24 }}>
            <ContinueCard
              saved={unfinished.saved}
              onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
              onSettle={unfinished.settle}
              settling={unfinished.settling}
            />
          </View>
        )}

        <LearnLink game="reversi" label="New to Reversi? How to play →" />
        <LessonsCard game="reversi" />

        <OpponentPicker value={mode} onChange={setMode} accent={GAME_ACCENTS.reversi.base} tint={GAME_ACCENTS.reversi.tintBg} />

        {isPuzzles && <PuzzlesCard game="reversi" />}

        {isOnlineMode && <OnlineSetupCard signedIn={!!userId} connected={online} />}

        {isTraining && (
          <TrainingSetup
            game="reversi"
            rating={game.userRating}
            loading={game.ratingLoading}
            botElo={botElo}
            signedIn={!!userId}
            online={online}
          />
        )}

        {isBotSetup && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, marginBottom: 10 }}>
              Bot strength
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING['2.5'], marginBottom: 24 }}>
              {DIFFICULTY_LEVELS.map((level, i) => {
                const selected = targetElo === level.elo;
                return (
                  <Pressable
                    key={level.elo}
                    onPress={() => setup.update({ elo: level.elo })}
                    accessibilityRole="button"
                    accessibilityLabel={`${level.label} bot — ${level.description}`}
                    accessibilityState={{ selected }}
                    style={{
                      flexGrow: 1,
                      flexBasis: '47%',
                      borderRadius: RADIUS['2xl'],
                      borderWidth: 2,
                      padding: 12,
                      backgroundColor: selected ? GAME_ACCENTS.reversi.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.reversi.base : COLORS.border,
                    }}
                  >
                    <DifficultyMeter
                      level={i + 1}
                      of={DIFFICULTY_LEVELS.length}
                      color={selected ? GAME_ACCENTS.reversi.base : COLORS.fgMuted}
                    />
                    <Text style={{ color: selected ? GAME_ACCENTS.reversi.base : COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
                      {level.label}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.caption, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Colour is picked in both bot modes — training just doesn't choose the
            bot's strength. */}
        {picksColor && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, marginBottom: 10 }}>
              Your color
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING[3], marginBottom: 24 }}>
              {(['black', 'white'] as const).map((color) => {
                const selected = playerColor === color;
                const disc = REVERSI_DISC_COLORS[color];
                return (
                  <Pressable
                    key={color}
                    onPress={() => setup.update({ color })}
                    accessibilityRole="button"
                    accessibilityLabel={`Play as ${color}`}
                    accessibilityState={{ selected }}
                    style={{
                      flex: 1,
                      borderRadius: RADIUS['2xl'],
                      borderWidth: 2,
                      padding: 16,
                      alignItems: 'center',
                      backgroundColor: selected ? GAME_ACCENTS.reversi.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.reversi.base : COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: RADIUS.full,
                        marginBottom: 8,
                        backgroundColor: disc.fill,
                        borderWidth: 2,
                        borderColor: disc.stroke,
                      }}
                    />
                    <Text
                      style={{
                        color: selected ? GAME_ACCENTS.reversi.base : COLORS.fg,
                        fontSize: FONT_SIZES.body,
                        fontFamily: FONTS.bodyBold,
                        textTransform: 'capitalize',
                      }}
                    >
                      {color}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, marginTop: 2 }}>
                      {color === 'black' ? 'You move first' : 'Bot moves first'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

        {/* Rated toggle — needs a signed-in account (rating reads/writes).
            Training has no toggle: it's always rated. */}
        {isBotSetup && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: SPACING[3],
              borderRadius: RADIUS['2xl'],
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body }}>Rated</Text>
              <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, marginTop: 2 }}>
                {!userId
                  ? 'Sign in to play rated games'
                  : !online
                    ? 'Offline — rated games need a connection'
                    : 'Updates your reversi practice level'}
              </Text>
            </View>
            <Toggle value={ratedEffective} onValueChange={(value) => setup.update({ rated: value })} label="Rated" disabled={!userId || !online} />
          </View>
        )}

        {/* Pass-and-play is casual (no rating); the reversi board never flips, so
            there's no flip toggle either — black plays first, as always. */}
        {isPassAndPlay && (
          <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.xs, marginBottom: 24 }}>
            Two players share this device — Black moves first, and the board stays put between
            turns.
          </Text>
        )}
      </Screen>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const { liveState, displayState, isAtLive, isThinking, manualEnd, ratingResult } = game;

  const counts = ReversiEngine.getDiscCounts(displayState);
  const otherColor: ReversiColor = playerColor === 'black' ? 'white' : 'black';

  // Pass-and-play: "the mover" replaces "you". Resign concedes for the player to
  // move (currentTurn is stable after a manual end — no moves append past it).
  const mover = liveState.currentTurn;
  const moverOther: ReversiColor = mover === 'black' ? 'white' : 'black';
  const pnpWinner = manualEnd === 'resign' ? moverOther : liveState.winner;

  let gameOverMsg: string | null = null;
  if (manualEnd === 'resign') {
    gameOverMsg = isPassAndPlay ? `${cap(mover)} resigned — ${cap(moverOther)} wins` : 'You resigned';
  } else if (liveState.isGameOver) {
    gameOverMsg =
      liveState.winner === null
        ? `Draw ${counts.black}–${counts.white}`
        : isPassAndPlay
          ? `${cap(liveState.winner)} wins ${counts[liveState.winner]}–${counts[liveState.winner === 'black' ? 'white' : 'black']}!`
          : liveState.winner === playerColor
            ? `You win! ${counts[playerColor]}–${counts[otherColor]}`
            : `Bot wins ${counts[otherColor]}–${counts[playerColor]}`;
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
  const mustPass = !gameOverMsg && isAtLive && ReversiEngine.mustPass(liveState);
  const lastPlaced = liveState.moveHistory[liveState.moveHistory.length - 1]?.position ?? null;
  // Training's bot has no tier name — it's whatever the rating ladder calls the
  // player's own level.
  const botLabel = isTraining ? `${botElo} · ${eloLabel('reversi', botElo)}` : labelForElo(targetElo);
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd;
  // The reversi board never flips; in pass-and-play its `playerColor` is the tap
  // gate, so it follows whoever is to move.
  const boardColor: ReversiColor = isPassAndPlay ? mover : playerColor;


  // Reversi's one turn rule the board can't show by itself: a player with no
  // legal move is skipped automatically. That used to be a status banner; it now
  // rides on the card of whoever is being passed, next to "thinking…".
  const passSuffix = (isMover: boolean) => (isMover && mustPass ? ' · no legal moves, passing…' : '');

  // ── Review ──────────────────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <ReviewScreen
        accent="reversi"
        title="Review"
        adapter={reversiAnalysis}
        moves={reversiMoves}
        viewIndex={game.viewIndex}
        onSeek={game.setViewIndex}
        total={game.timeline.length}
        playerColor={playerColor}
        showBothSides={isPassAndPlay}
        evaluation={analysis.current}
        grades={analysis.grades}
        summary={analysis.summary}
        scanning={analysis.scanning}
        progress={analysis.progress}
        complete={analysis.complete}
        liveBusy={analysis.liveBusy}
        error={analysis.error}
        onScan={analysis.scan}
        onStopScan={analysis.stopScan}
        onExit={() => setReviewing(false)}
        board={
          <ReversiBoard
            gameState={displayState}
            onMove={() => {}}
            playerColor={playerColor}
            // The engine's choice reuses the training hint's ring — same meaning
            // ("play here"), so it should look the same.
            hintPos={analysis.current?.bestMove?.to ?? null}
            interactive={false}
          />
        }
      />
    );
  }

  return (
    <>
      <GameScreenLayout
        accent="reversi"
        backHref="/"
        title="Reversi"
        // Jump-to-live and New Game both used to sit up here; they're on the game
        // bar now, which is always in reach (and clear of the dev-menu bubble).
        topCard={
          isPassAndPlay ? (
            <PlayerCard
              name="White"
              initial="W"
              active={moverTurn && mover === 'white'}
              subline={`White discs${moverTurn && mover === 'white' ? ' · to move' : ''}${passSuffix(mover === 'white')}`}
            />
          ) : (
            <PlayerCard
              name="Bot"
              initial="B"
              active={isThinking || (mustPass && !yourTurn)}
              subline={`${botLabel}${isThinking ? ' · thinking…' : ''}${passSuffix(liveState.currentTurn !== playerColor)}`}
            />
          )
        }
        board={
          <ReversiBoard
            gameState={displayState}
            onMove={(pos) => game.handleMove(pos, pos)}
            playerColor={boardColor}
            highlightPos={isAtLive ? lastPlaced : null}
            hintPos={isAtLive ? game.hintMove?.to ?? null : null}
            interactive={interactive}
          />
        }
        bottomCard={
          isPassAndPlay ? (
            <PlayerCard
              name="Black"
              initial="B"
              active={moverTurn && mover === 'black'}
              subline={`Black discs${moverTurn && mover === 'black' ? ' · to move' : ''}${passSuffix(mover === 'black')}`}
            />
          ) : (
            <PlayerCard
              name="You"
              initial="Y"
              isYou
              // The rating is the tell that the game is rated; it is absent
              // from a casual one.
              rating={ratedEffective ? game.userRating?.rating : undefined}
              active={yourTurn || (mustPass && liveState.currentTurn === playerColor)}
              subline={`Playing ${playerColor}${yourTurn ? ' · your move' : ''}${passSuffix(liveState.currentTurn === playerColor)}`}
            />
          )
        }
        sidebar={
          <>
            {/* Where the status banner used to sit — it repeated what the player
                cards already say, so the space carries the move ribbon instead. */}
            <MoveBand
              moves={reversiMoves}
              viewIndex={game.viewIndex}
              onSeek={game.setViewIndex}
              accent="reversi"
            />

            {/* Info card */}
            <View
              style={{
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                padding: 12,
                gap: SPACING[2],
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
                <InfoCell label="Turn" value={gameOverMsg ? '—' : liveState.currentTurn} capitalize />
                <InfoCell label="Move" value={String(liveState.moveHistory.length)} />
                {isTraining && (
                  <InfoCell
                    label="Hints"
                    // The hint square is a visual cue only; naming it here is
                    // what makes the paid-for advice reachable without sight.
                    value={
                      game.hintMove
                        ? `${game.hintsUsed} · play ${game.hintMove.to}`
                        : String(game.hintsUsed)
                    }
                  />
                )}
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: SPACING[5],
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <DiscCount color={REVERSI_DISC_COLORS.black.fill} border={REVERSI_DISC_COLORS.black.stroke} count={counts.black} />
                <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs }}>vs</Text>
                <DiscCount color={REVERSI_DISC_COLORS.white.fill} border={REVERSI_DISC_COLORS.white.stroke} count={counts.white} />
              </View>
            </View>

          </>
        }
        bottomBar={
          <GameBar
            viewIndex={game.viewIndex}
            total={game.timeline.length}
            onSeek={game.setViewIndex}
            accent="reversi"
            // No flip (playerColor is also the pass-and-play tap gate) and no
            // draw offers — reversi always ends on a disc count.
            onNewGame={handleNewGame}
            onAbort={game.liveState.moveHistory.length < ABORT_MOVE_LIMIT ? handleAbort : undefined}
            onResign={game.resign}
            gameOver={!!gameOverMsg}
            onHint={isTraining ? game.requestHint : undefined}
            hintDisabled={!yourTurn}
            hintPending={game.isHinting}
            hintsUsed={game.hintsUsed}
            // Gated on the game being over: mid-game this is an unlimited free
            // hint, which is exactly what training charges points for.
            onAnalysis={gameOverMsg ? () => setReviewing(true) : undefined}
          />
        }
      />

      <GameResultScreen
        open={!!gameOverMsg}
        result={myResult}
        title={isPassAndPlay && pnpWinner ? `${cap(pnpWinner)} Wins!` : undefined}
        subtitle={
          isPassAndPlay
            ? manualEnd === 'resign'
              ? `${cap(mover)} resigned`
              : `Final score ${counts.black}–${counts.white}`
            : gameOverMsg ?? undefined
        }
        // Bot and training games move the Practice level, never the online Rating.
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta, ladder: 'practice' }
            : undefined
        }
        hintsUsed={ratingResult?.hintsUsed}
        saveError={game.saveError}
        onRetrySave={game.retrySave}
        onReview={() => setReviewing(true)}
        actions={<Button label="Rematch" onPress={handleRematch} />}
        secondaryActions={
          <>
            <ChangeSetupButton onPress={handleNewGame} />
            <BackToHomeButton />
          </>
        }
      />
    </>
  );
}

function InfoCell({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View style={{ flexDirection: 'row', gap: SPACING['1.5'], width: '50%', paddingVertical: 2 }}>
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label }}>{label}:</Text>
      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodyBold, textTransform: capitalize ? 'capitalize' : 'none' }}>
        {value}
      </Text>
    </View>
  );
}

function DiscCount({ color, border, count }: { color: string; border: string; count: number }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING['1.5'] }}>
      <View style={{ width: 14, height: 14, borderRadius: RADIUS.full, backgroundColor: color, borderWidth: 2, borderColor: border }} />
      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodyBold }}>{count}</Text>
    </View>
  );
}

