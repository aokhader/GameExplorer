import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import {
  ENGINE_MIN_ELO,
  chessBotConfig,
  summarizeMaterial,
  timelineToSan,
  type ChessGameState,
} from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, ChessPiece, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Icon, Toggle } from '@/components/ui';
import { DifficultyMeter } from '@/game/DifficultyMeter';
import { ChessBoard } from '@/board/ChessBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { BackToHomeButton, ChangeSetupButton } from '@/game/resultDismiss';
import { OpponentPicker, FlipBoardCard } from '@/game/OpponentPicker';
import { PuzzlesCard } from '@/game/PuzzlesCard';
import { SetupHeading } from '@/game/SetupHeading';
import { LearnLink } from '@/game/LearnLink';
import { LessonsCard } from '@/game/LessonsCard';
import { AnalysisCard } from '@/game/AnalysisCard';
import { CustomEloPicker } from '@/game/CustomEloPicker';
import { CapturedTray } from '@/game/CapturedTray';
import { GameBar } from '@/game/GameBar';
import { MoveBand } from '@/game/MoveBand';
import { TrainingSetup } from '@/game/TrainingSetup';
import { eloLabel } from '@/game/eloLabel';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { chessAnalysis } from '@/analysis/adapters';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { ChessOnline } from '@/multiplayer/ChessOnline';
import { OnlineSetupCard } from '@/multiplayer/OnlineSetupCard';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { chessAdapter } from '@/engine/chessAdapter';
import { useEngineNative } from '@/engine/useEngineNative';
import { useSetupDeepLink } from '@/game/useSetupDeepLink';
import { useGameSetup, useUnfinishedGame } from '@/game/useGameSetup';
import { ContinueCard, SetupStartFooter } from '@/game/ContinueCard';
import { nativeLocalStore } from '@/lib/localStore';
import type { UnfinishedGame } from '@gameexplorer/client/game/unfinishedGame';
import { useSettings } from '@/providers/SettingsProvider';
import { useIsOnline } from '@/lib/useIsOnline';
import { useOnceTip } from '@/game/useOnceTip';
import { BoardTip } from '@/game/BoardTip';
import { FONTS } from '@/theme/typography';


// The same six-preset ladder as web's chess/bot page. Which engine plays each
// tier is decided by `chessBotConfig` in packages/shared: the three below 1400
// run the in-house engine, the three above it run native Arasan. Tiles at 1400+
// only show when the engine is linked into this binary (isEngineAvailable).
const DIFFICULTY_LEVELS = [
  { elo: 600, label: 'Beginner', description: 'Hangs pieces, random-looking play' },
  { elo: 900, label: 'Novice', description: 'Spots one-move threats, misses combos' },
  { elo: 1200, label: 'Club', description: 'Consistent, beatable with tactics' },
  { elo: 1500, label: 'Intermediate', description: 'Strong tactically, rarely blunders' },
  { elo: 2000, label: 'Advanced', description: 'Finds deep combinations reliably' },
  { elo: 2800, label: 'Master', description: 'Elite — extremely strong' },
] as const;

/**
 * Bounds for the Custom tier. The floor is the bottom of the in-house engine's
 * measured bands; the ceiling matches the Master preset, and drops below
 * `ENGINE_MIN_ELO` on a build without the native engine, where only the
 * in-house TS engine is available.
 */
const CUSTOM_ELO_MIN = 400;
const CUSTOM_ELO_MAX = 2800;

function labelForElo(elo: number, custom: boolean): string {
  if (custom) return `Custom ${elo}`;
  return DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

/** "white" → "White" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}

/**
 * Chess vs bot or pass-and-play — the drag/tap board flow with a promotion picker
 * and check-ring. Setup (opponent + strength + color + rated) hands off to the
 * in-game shell driven by `useLocalGame`. Bot tiers play through the ladder in
 * `chessBotConfig` (the in-house engine below 1400, native Arasan above),
 * reusing the same shared rating math and `saveGame` writer so results match web. Pass-and-play
 * (M4) runs the same loop with no bot and no save — two humans alternate on one
 * device, optionally flipping the board.
 */
export function ChessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useSettings();

  // ?elo=&start=1 from the welcome tour, ?resume=1 from the launcher. Read once.
  const deepLink = useSetupDeepLink(DIFFICULTY_LEVELS.map((l) => l.elo));

  // The form remembers what was chosen last time; a started game keeps the setup
  // it began with. See `useGameSetup`.
  const setup = useGameSetup('chess', deepLink);
  const unfinished = useUnfinishedGame('chess');
  const { mode, setMode, started } = setup;
  const selectedElo = setup.setup.elo;
  // Custom tier — the exact-rating picker replaces the preset tiles. Its starting
  // value is whatever preset was highlighted, so the slider opens where you were.
  const isCustomTier = setup.setup.custom;
  const playerColor = setup.setup.color;
  const rated = setup.setup.rated;
  // Manual board flip from the game menu — inverts whatever orientation the mode
  // would otherwise pick (see boardColor below).
  const [flipped, setFlipped] = useState(false);
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

  // Training plays a bot too, so it warms the same engine. Online never does —
  // the opponent is a person and the engine would be a 60MB no-op.
  const isBotMode = !isPassAndPlay && !isPuzzles && !isOnlineMode;
  // Warm the engine once any bot game starts (the NNUE load is heavy); it then
  // stays up for the app session. Every tier now plays through Arasan. Review
  // needs it too — including after a pass-and-play game, which never used it.
  const engine = useEngineNative({ enabled: (started && isBotMode) || reviewing });
  // The engine gates the bot turn only when it's actually linked; a stale dev
  // client without it falls back to the in-house engine (sub-1400 tiles only)
  // and must not wait on a handshake that never completes.
  const engineActive = isBotMode && engine.isAvailable;
  const levels = engine.isAvailable
    ? DIFFICULTY_LEVELS
    : DIFFICULTY_LEVELS.filter((l) => l.elo < ENGINE_MIN_ELO);

  // Same ceiling the preset tiles are filtered by: without the native engine the
  // in-house one tops out just under ENGINE_MIN_ELO.
  const maxElo = engine.isAvailable ? CUSTOM_ELO_MAX : ENGINE_MIN_ELO - 1;
  // Clamped here too, not just in the picker, so a value chosen in one build can
  // never outrun what this binary's engine can actually play.
  const targetElo = Math.max(CUSTOM_ELO_MIN, Math.min(maxElo, selectedElo));

  // Neither puzzles nor online is a `LocalGameMode` — puzzles leave through the
  // router, and online is driven by the server session. 'bot' is the inert
  // stand-in while the picker sits on either, and `started` is withheld so this
  // hook never actually runs a game underneath one of them.
  const isLocalMode = !isPuzzles && !isOnlineMode;
  const gameMode: LocalGameMode = isLocalMode ? mode : 'bot';

  const game = useLocalGame<ChessGameState>({
    adapter: chessAdapter,
    mode: gameMode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    // Training matches the bot to the player's rating; clamp it to what this
    // binary's engine can actually play (same ceiling the preset tiles use).
    eloBounds: { min: CUSTOM_ELO_MIN, max: maxElo },
    started: started && isLocalMode,
    botReady: !engineActive || engine.isReady,
    persistence: { store: nativeLocalStore, game: 'chess', setup: setup.setup },
  });

  // The tier picked on setup, or — in training — the player's own rating.
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
  const handleNewGame = () => {
    game.newGame();
    setup.stop();
    unfinished.refresh();
    setFlipped(false);
    setReviewing(false);
  };

  /** Pick a saved game up where it was left — its moves first, then the board. */
  const resumeSaved = (saved: UnfinishedGame) => {
    setFlipped(false);
    setReviewing(false);
    if (game.restore(saved)) setup.resume(saved);
    // Moves these rules reject describe no position anyone can play or score.
    else void unfinished.settle({ resign: true }).catch(() => {});
  };

  // The launcher's Continue opens this screen with `?resume=1`. State, not a
  // ref: with nothing to resume, the blank screen below must still re-render.
  const [awaitingResume, setAwaitingResume] = useState(deepLink.resume);
  useEffect(() => {
    if (!awaitingResume || !setup.ready || !unfinished.hydrated) return;
    setAwaitingResume(false);
    if (unfinished.saved && !unfinished.saved.end && !started) resumeSaved(unfinished.saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingResume, setup.ready, unfinished.hydrated]);

  /**
   * The next game with the same setup, on the same board. `newGame` aborts any
   * search still running and resets the result, so the card closes by itself;
   * a rated rematch reads the rating the last game just wrote.
   */
  const handleRematch = () => {
    game.newGame();
    setReviewing(false);
  };

  // SAN costs a legal-move scan per move (for disambiguation), so it's derived
  // only when a move is added rather than on every render. Must sit above the
  // setup-screen early return — hooks can't be called conditionally.
  const sanMoves = useMemo(() => timelineToSan(game.timeline), [game.timeline]);

  const analysis = useGameAnalysis({
    adapter: chessAnalysis,
    timeline: game.timeline,
    viewIndex: game.viewIndex,
    // The engine handshake has to finish before any search is sent, or every
    // position would fail with "Engine not ready".
    enabled: reviewing && engine.isReady,
  });

  // The first time the player is in check, one line on the board says what it
  // means (`ux-fix-ideas.md` §4.4). The next move retires it, which is why that
  // effect runs first.
  const { tip, offer: offerTip, dismiss: dismissTip } = useOnceTip();
  const tipState = game.liveState;
  const tipMoveCount = tipState.moveHistory.length;
  useEffect(() => {
    dismissTip();
  }, [tipMoveCount, dismissTip]);
  useEffect(() => {
    if (!started || !isLocalMode || !tipState.isCheck || tipState.isCheckmate) return;
    // In pass-and-play whoever is to move is a player in check.
    if (isPassAndPlay || tipState.currentTurn === playerColor) offerTip('check');
  }, [started, isLocalMode, tipState, isPassAndPlay, playerColor, offerTip]);

  // ── Online ──────────────────────────────────────────────────────────────────
  // Mounted only once online play has started, so a bot game never opens a
  // websocket it has no use for. Sits after every hook above it, so the hook
  // order is the same on every render.
  if (started && isOnlineMode) {
    return <ChessOnline inviteId={deepLink.inviteId} onExit={setup.stop} />;
  }

  // Nothing to show until the remembered setup is known, or while a link is about
  // to replace the form with a game.
  if (!started && (!setup.ready || setup.awaitingAutoStart || awaitingResume)) {
    return <Screen scroll={false}>{null}</Screen>;
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    // Pinned under the scrolling form rather than at its end, where it sat about
    // a screen-height down on a phone.
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
        onStart={isPuzzles ? () => router.push('/puzzles/chess' as never) : setup.start}
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
        <SetupHeading game="chess" />

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

        <LearnLink game="chess" label="New to chess? How to play →" />
        <LessonsCard game="chess" />

        <OpponentPicker value={mode} onChange={setMode} accent={GAME_ACCENTS.chess.base} tint={GAME_ACCENTS.chess.tintBg} />

        {/* Chess and Go only: the analysis board is a position editor with an
            engine behind it, and the other three games have no engine to ask. */}
        <AnalysisCard game="chess" />

        {isPuzzles && <PuzzlesCard game="chess" />}

        {isOnlineMode && <OnlineSetupCard signedIn={!!userId} connected={online} />}

        {isTraining && (
          <TrainingSetup
            game="chess"
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
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING['2.5'], marginBottom: 10 }}>
              {levels.map((level) => {
                const selected = !isCustomTier && targetElo === level.elo;
                // Rank on the full ladder, not in `levels`: the Arasan tiers hide
                // when the engine is absent, and Beginner is still one bar either way.
                const rank = DIFFICULTY_LEVELS.findIndex((l) => l.elo === level.elo) + 1;
                return (
                  <Pressable
                    key={level.elo}
                    onPress={() => setup.update({ custom: false, elo: level.elo })}
                    accessibilityRole="button"
                    accessibilityLabel={`${level.label} bot — ${level.description}`}
                    accessibilityState={{ selected }}
                    style={{
                      flexGrow: 1,
                      flexBasis: '47%',
                      borderRadius: RADIUS['2xl'],
                      borderWidth: 2,
                      padding: 12,
                      backgroundColor: selected ? GAME_ACCENTS.chess.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.chess.base : COLORS.border,
                    }}
                  >
                    <DifficultyMeter
                      level={rank}
                      of={DIFFICULTY_LEVELS.length}
                      color={selected ? GAME_ACCENTS.chess.base : COLORS.fgMuted}
                    />
                    <Text style={{ color: selected ? GAME_ACCENTS.chess.base : COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
                      {level.label} · {level.elo}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.caption, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Custom — pick the exact rating instead of a preset rung. */}
              <Pressable
                onPress={() => setup.update({ custom: true })}
                accessibilityRole="button"
                accessibilityLabel={`Custom bot rating — set an exact rating between ${CUSTOM_ELO_MIN} and ${maxElo}`}
                accessibilityState={{ selected: isCustomTier }}
                style={{
                  flexGrow: 1,
                  flexBasis: '47%',
                  borderRadius: RADIUS['2xl'],
                  borderWidth: 2,
                  padding: 12,
                  backgroundColor: isCustomTier ? GAME_ACCENTS.chess.tintBg : COLORS.surfaceAlt,
                  borderColor: isCustomTier ? GAME_ACCENTS.chess.base : COLORS.border,
                }}
              >
                <Icon
                  name="sliders-horizontal"
                  size={FONT_SIZES.xl}
                  color={isCustomTier ? GAME_ACCENTS.chess.base : COLORS.fgMuted}
                  style={{ marginBottom: 2 }}
                />
                <Text style={{ color: isCustomTier ? GAME_ACCENTS.chess.base : COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>
                  Custom{isCustomTier ? ` · ${targetElo}` : ''}
                </Text>
                <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.caption, marginTop: 2 }}>
                  {`Any rating from ${CUSTOM_ELO_MIN} to ${maxElo}`}
                </Text>
              </Pressable>
            </View>

            {isCustomTier && (
              <CustomEloPicker
                value={targetElo}
                onChange={(elo) => setup.update({ elo })}
                min={CUSTOM_ELO_MIN}
                max={maxElo}
                accent={GAME_ACCENTS.chess.base}
                tint={GAME_ACCENTS.chess.tintBg}
              />
            )}

            <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.caption, marginBottom: 24 }}>
              {!engine.isAvailable
                ? 'Stronger bots (1400+ ELO) need an updated app build.'
                : chessBotConfig(targetElo).engine === 'arasan'
                  ? 'This bot is powered by the Arasan chess engine.'
                  : 'This bot is powered by our own chess engine.'}
            </Text>
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
              {(['white', 'black'] as const).map((color) => {
                const selected = playerColor === color;
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
                      backgroundColor: selected ? GAME_ACCENTS.chess.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.chess.base : COLORS.border,
                    }}
                  >
                    <View style={{ marginBottom: 8 }}>
                      <ChessPiece type="king" color={color} size={34} />
                    </View>
                    <Text
                      style={{
                        color: selected ? GAME_ACCENTS.chess.base : COLORS.fg,
                        fontSize: FONT_SIZES.body,
                        fontFamily: FONTS.bodyBold,
                        textTransform: 'capitalize',
                      }}
                    >
                      {color}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, marginTop: 2 }}>
                      {color === 'white' ? 'You move first' : 'Bot moves first'}
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
                    : 'Updates your chess rating'}
              </Text>
            </View>
            <Toggle value={ratedEffective} onValueChange={(value) => setup.update({ rated: value })} label="Rated" disabled={!userId || !online} />
          </View>
        )}

        {/* Pass-and-play is casual (no rating) — the only option is board flipping. */}
        {isPassAndPlay && <FlipBoardCard />}
      </Screen>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const { liveState, displayState, isAtLive, isThinking, manualEnd, ratingResult } = game;

  // First bot game of the session: the engine is still doing its UCI handshake
  // (network install + NNUE load). The bot turn is gated on it (botReady above),
  // so tell the player what the wait is.
  const engineWarming = engineActive && !engine.isReady;

  const winner = liveState.isCheckmate
    ? liveState.currentTurn === 'white'
      ? 'black'
      : 'white'
    : null;

  // Pass-and-play: "the mover" replaces "you". Resign concedes for the player to
  // move (currentTurn is stable after a manual end — no moves append past it).
  const mover = liveState.currentTurn;
  const moverOther: 'white' | 'black' = mover === 'white' ? 'black' : 'white';
  const pnpWinner = manualEnd === 'resign' ? moverOther : manualEnd === 'draw' ? null : winner;

  let gameOverMsg: string | null = null;
  if (manualEnd === 'resign') {
    gameOverMsg = isPassAndPlay ? `${cap(mover)} resigned — ${cap(moverOther)} wins` : 'You resigned';
  } else if (manualEnd === 'draw') {
    gameOverMsg = 'Draw by agreement';
  } else if (liveState.isCheckmate) {
    gameOverMsg = isPassAndPlay
      ? `Checkmate — ${cap(winner!)} wins!`
      : winner === playerColor
        ? 'Checkmate! You win'
        : 'Checkmate — bot wins';
  } else if (liveState.isStalemate) {
    gameOverMsg = 'Draw — stalemate';
  } else if (liveState.isDraw) {
    gameOverMsg = 'Draw';
  }

  const myResult: GameResult = isPassAndPlay
    ? pnpWinner
      ? 'win'
      : 'draw'
    : manualEnd === 'resign'
      ? 'loss'
      : winner === null
        ? 'draw'
        : winner === playerColor
          ? 'win'
          : 'loss';

  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;
  const moverTurn = isAtLive && !gameOverMsg;
  // Training's bot has no tier name — it's whatever the rating ladder calls the
  // player's own level.
  const botLabel = isTraining
    ? `${botElo} · ${eloLabel('chess', botElo)}`
    : labelForElo(targetElo, isCustomTier);

  // Captures follow the position on the board, so scrubbing back through the
  // history rewinds the trays with it.
  const material = summarizeMaterial(displayState);
  const opponentColor: 'white' | 'black' = playerColor === 'white' ? 'black' : 'white';
  // `advantage` is signed from White's side; each tray shows its own lead.
  const leadFor = (color: 'white' | 'black') =>
    color === 'white' ? material.advantage : -material.advantage;
  const interactive = isAtLive && !gameOverMsg;
  // Check needs no caption: ChessBoard already rings the king in check.
  // Pass-and-play orientation: face the mover when the flip setting is on,
  // otherwise stay white-side-down. Follows the LIVE turn so reviewing history
  // never spins the board. The menu's "Flip board" inverts whichever side that
  // lands on, so in pass-and-play it flips the pair rather than fighting the
  // per-turn rotation.
  const autoBoardColor: 'white' | 'black' = isPassAndPlay
    ? settings.flipBoardPassAndPlay
      ? mover
      : 'white'
    : playerColor;
  const boardColor: 'white' | 'black' = flipped
    ? autoBoardColor === 'white'
      ? 'black'
      : 'white'
    : autoBoardColor;

  // ── Review ──────────────────────────────────────────────────────────────────
  if (reviewing) {
    return (
      <ReviewScreen
        accent="chess"
        title="Review"
        adapter={chessAnalysis}
        moves={sanMoves}
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
        // The NNUE load can take a moment on the first review of a session;
        // showing it as "busy" is closer to the truth than an empty eval.
        liveBusy={analysis.liveBusy || !engine.isReady}
        error={
          engine.isAvailable
            ? analysis.error
            : 'Review needs the chess engine, which this build does not include.'
        }
        onScan={analysis.scan}
        onStopScan={analysis.stopScan}
        onExit={() => setReviewing(false)}
        board={
          <ChessBoard
            gameState={displayState}
            onMove={() => {}}
            playerColor={boardColor}
            // The engine's choice reuses the training hint's rings — same
            // meaning ("play this move"), so it should look the same.
            hintMove={analysis.current?.bestMove ?? null}
            interactive={false}
          />
        }
      />
    );
  }

  return (
    <>
      <GameScreenLayout
        accent="chess"
        backHref="/"
        title="Chess"
        // Jump-to-live and New Game both used to sit up here; they're on the game
        // bar now, which is always in reach (and clear of the dev-menu bubble).
        topCard={
          isPassAndPlay ? (
            <PlayerCard
              name="Black"
              initial="B"
              active={moverTurn && mover === 'black'}
              subline={`Black pieces${moverTurn && mover === 'black' ? ' · to move' : ''}`}
              footer={
                <CapturedTray
                  pieces={material.black}
                  color="white"
                  advantage={leadFor('black')}
                  ownerLabel="Black"
                />
              }
            />
          ) : (
            <PlayerCard
              name="Bot"
              initial="B"
              active={isThinking || engineWarming}
              // The first bot game of the session waits on the engine's NNUE
              // load. That used to be a banner; it belongs on the bot's own card,
              // next to "thinking…", so the player knows why nothing is moving.
              subline={
                engineWarming
                  ? `${botLabel} · warming up…`
                  : isThinking
                    ? `${botLabel} · thinking…`
                    : botLabel
              }
              footer={
                <CapturedTray
                  pieces={material[opponentColor]}
                  color={playerColor}
                  advantage={leadFor(opponentColor)}
                  ownerLabel="Bot"
                />
              }
            />
          )
        }
        board={
          <View>
            <ChessBoard
              gameState={displayState}
              onMove={(from, to, promotion) => game.handleMove(from, to, promotion)}
              playerColor={boardColor}
              interactive={interactive}
              hintMove={isAtLive ? game.hintMove : null}
              // Line up a reply while the bot thinks. Pass-and-play has no
              // "opponent's turn" to queue against — both sides are this device.
              // Note this is the player's SIDE, not `boardColor` (orientation).
              premoveColor={isPassAndPlay ? undefined : playerColor}
            />
            {tip && <BoardTip message={tip.message} onDismiss={dismissTip} />}
          </View>
        }
        bottomCard={
          isPassAndPlay ? (
            <PlayerCard
              name="White"
              initial="W"
              active={moverTurn && mover === 'white'}
              subline={`White pieces${moverTurn && mover === 'white' ? ' · to move' : ''}`}
              footer={
                <CapturedTray
                  pieces={material.white}
                  color="black"
                  advantage={leadFor('white')}
                  ownerLabel="White"
                />
              }
            />
          ) : (
            <PlayerCard
              name="You"
              initial="Y"
              isYou
              active={yourTurn}
              subline={`Playing ${playerColor}${yourTurn ? ' · your move' : ''}`}
              footer={
                <CapturedTray
                  pieces={material[playerColor]}
                  color={opponentColor}
                  advantage={leadFor(playerColor)}
                  ownerLabel="You"
                />
              }
            />
          )
        }
        sidebar={
          <>
            {/* Where the status banner used to sit. It spent the game repeating
                what the player cards already say, so the space now carries the
                move ribbon instead — the Lichess/chess.com treatment. */}
            <MoveBand
              moves={sanMoves}
              viewIndex={game.viewIndex}
              onSeek={game.setViewIndex}
              accent="chess"
            />

            {/* Info card */}
            <View
              style={{
                borderRadius: RADIUS.xl,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                padding: 12,
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
                <InfoCell label="Move" value={String(liveState.fullMoveNumber)} />
                {isTraining && (
                  <InfoCell
                    label="Hints"
                    // The hint outline is a visual cue only; spelling the move
                    // out here is what makes the paid-for advice reachable
                    // without sight.
                    value={
                      game.hintMove
                        ? `${game.hintsUsed} · ${game.hintMove.from}→${game.hintMove.to}`
                        : String(game.hintsUsed)
                    }
                  />
                )}
              </View>
            </View>

          </>
        }
        bottomBar={
          <GameBar
            viewIndex={game.viewIndex}
            total={game.timeline.length}
            onSeek={game.setViewIndex}
            accent="chess"
            onFlipBoard={() => setFlipped((f) => !f)}
            onAgreeDraw={game.agreeDraw}
            onNewGame={handleNewGame}
            onResign={game.resign}
            gameOver={!!gameOverMsg}
            onHint={isTraining ? game.requestHint : undefined}
            // Hints come only from Arasan, at any rating. A binary without it, or
            // an engine that failed to start, gets no hint rather than a weaker one.
            hintDisabled={!yourTurn || !engine.isAvailable}
            hintPending={game.isHinting}
            hintsUsed={game.hintsUsed}
            // Gated on the game being over: mid-game this is an unlimited free
            // hint, which is exactly what training charges rating for.
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
              : manualEnd === 'draw'
                ? 'Draw by agreement'
                : pnpWinner
                  ? 'By checkmate'
                  : gameOverMsg ?? undefined
            : myResult === 'win'
              ? undefined
              : gameOverMsg ?? undefined
        }
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
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

