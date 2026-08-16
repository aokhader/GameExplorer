import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import {
  ENGINE_MIN_ELO,
  summarizeMaterial,
  timelineToSan,
  type ChessGameState,
} from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, ChessPiece, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Toggle } from '@/components/ui';
import { ChessBoard } from '@/board/ChessBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { OpponentPicker, FlipBoardCard, type SetupMode } from '@/game/OpponentPicker';
import { PuzzlesCard } from '@/game/PuzzlesCard';
import { SetupHero } from '@/game/SetupHero';
import { LearnLink } from '@/game/LearnLink';
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
import { useSettings } from '@/providers/SettingsProvider';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';


// The same six-preset ladder as web's chess/bot page. Every tier now plays
// through the native Arasan service (see chessAdapter / chessEngineNative); the
// two sub-1000 tiers are weakened with random moves since Arasan's UCI_Elo
// floor is 1000. Tiles at 1400+ only show when the engine is linked into this
// binary (isEngineAvailable); without it, the in-house engine covers <1400.
const DIFFICULTY_LEVELS = [
  { elo: 600, label: 'Beginner', description: 'Hangs pieces, random-looking play', icon: '🟢' },
  { elo: 900, label: 'Novice', description: 'Spots one-move threats, misses combos', icon: '🔵' },
  { elo: 1200, label: 'Club', description: 'Consistent, beatable with tactics', icon: '🟡' },
  { elo: 1500, label: 'Intermediate', description: 'Strong tactically, rarely blunders', icon: '🟠' },
  { elo: 2000, label: 'Advanced', description: 'Finds deep combinations reliably', icon: '🔴' },
  { elo: 2800, label: 'Master', description: 'Elite — extremely strong', icon: '🟣' },
] as const;

/**
 * Bounds for the Custom tier. The floor is where random-move weakening bottoms
 * out (see chessAdapter's blunder ramp); the ceiling matches the Master preset,
 * and drops below `ENGINE_MIN_ELO` on a build without the native engine, where
 * only the in-house TS engine is available.
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
 * in-game shell driven by `useLocalGame`. Every bot tier plays through the native
 * Arasan engine (sub-1000 tiers weakened with random moves), reusing the same
 * shared rating math and `saveGame` writer so results match web. Pass-and-play
 * (M4) runs the same loop with no bot and no save — two humans alternate on one
 * device, optionally flipping the board.
 */
export function ChessScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useSettings();

  // ?elo=&start=1 from the welcome tour. Read once, as lazy initial state.
  const deepLink = useSetupDeepLink(DIFFICULTY_LEVELS.map((l) => l.elo));

  const [mode, setMode] = useState<SetupMode>(deepLink.online ? 'online' : 'bot');
  const [selectedElo, setSelectedElo] = useState(deepLink.elo ?? 1200);
  // Custom tier — the exact-rating picker replaces the preset tiles. Its starting
  // value is whatever preset was highlighted, so the slider opens where you were.
  const [isCustomTier, setIsCustomTier] = useState(false);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [rated, setRated] = useState(true);
  // An invite link skips setup entirely — the game it points at already exists.
  const [started, setStarted] = useState(deepLink.autoStart || deepLink.online);
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
  });

  // The tier picked on setup, or — in training — the player's own rating.
  const botElo = game.botElo;
  const canStart = isTraining
    ? ratedEffective && !game.ratingLoading
    : isOnlineMode
      ? !!userId && online
      : true;

  const handleNewGame = () => {
    game.newGame();
    setStarted(false);
    setFlipped(false);
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

  // ── Online ──────────────────────────────────────────────────────────────────
  // Mounted only once online play has started, so a bot game never opens a
  // websocket it has no use for. Sits after every hook above it, so the hook
  // order is the same on every render.
  if (started && isOnlineMode) {
    return <ChessOnline inviteId={deepLink.inviteId} onExit={() => setStarted(false)} />;
  }

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <Screen>
        <GlowBackdrop
          blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: GAME_ACCENTS.chess.base, opacity: 0.16 }]}
        />
        <BackHeader fallbackHref="/" />
        <SetupHero game="chess" />

        <LearnLink game="chess" label="New to chess? How to play →" />

        {/* Chess only, like web: the analysis board is a position editor with an
            engine behind it, and the other two games have no engine to ask. */}
        <Pressable
          onPress={() => router.push('/analysis' as never)}
          accessibilityRole="link"
          accessibilityLabel="Open the analysis board"
          style={{ paddingVertical: 6 }}
        >
          <Text style={{ color: GAME_ACCENTS.chess.base, fontFamily: FONTS.bodySemi, fontSize: 14 }}>
            Analysis board — set up any position →
          </Text>
        </Pressable>

        <OpponentPicker value={mode} onChange={setMode} accent={GAME_ACCENTS.chess.base} tint={GAME_ACCENTS.chess.tintBg} />

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
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
              Bot strength
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
              {levels.map((level) => {
                const selected = !isCustomTier && targetElo === level.elo;
                return (
                  <Pressable
                    key={level.elo}
                    onPress={() => {
                      setIsCustomTier(false);
                      setSelectedElo(level.elo);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${level.label} bot — ${level.description}`}
                    accessibilityState={{ selected }}
                    style={{
                      flexGrow: 1,
                      flexBasis: '47%',
                      borderRadius: 14,
                      borderWidth: 2,
                      padding: 12,
                      backgroundColor: selected ? GAME_ACCENTS.chess.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.chess.base : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                    <Text style={{ color: selected ? GAME_ACCENTS.chess.base : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
                      {level.label} · {level.elo}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}

              {/* Custom — pick the exact rating instead of a preset rung. */}
              <Pressable
                onPress={() => setIsCustomTier(true)}
                accessibilityRole="button"
                accessibilityLabel={`Custom bot rating — set an exact rating between ${CUSTOM_ELO_MIN} and ${maxElo}`}
                accessibilityState={{ selected: isCustomTier }}
                style={{
                  flexGrow: 1,
                  flexBasis: '47%',
                  borderRadius: 14,
                  borderWidth: 2,
                  padding: 12,
                  backgroundColor: isCustomTier ? GAME_ACCENTS.chess.tintBg : COLORS.surfaceAlt,
                  borderColor: isCustomTier ? GAME_ACCENTS.chess.base : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🎚️</Text>
                <Text style={{ color: isCustomTier ? GAME_ACCENTS.chess.base : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
                  Custom{isCustomTier ? ` · ${targetElo}` : ''}
                </Text>
                <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                  {`Any rating from ${CUSTOM_ELO_MIN} to ${maxElo}`}
                </Text>
              </Pressable>
            </View>

            {isCustomTier && (
              <CustomEloPicker
                value={targetElo}
                onChange={setSelectedElo}
                min={CUSTOM_ELO_MIN}
                max={maxElo}
                accent={GAME_ACCENTS.chess.base}
                tint={GAME_ACCENTS.chess.tintBg}
              />
            )}

            <Text style={{ color: COLORS.fgSubtle, fontSize: 11, marginBottom: 24 }}>
              {engine.isAvailable
                ? 'Bots are powered by the Arasan engine.'
                : 'Stronger bots (1400+ ELO) need an updated app build.'}
            </Text>
          </>
        )}

        {/* Colour is picked in both bot modes — training just doesn't choose the
            bot's strength. */}
        {picksColor && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
              Your color
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {(['white', 'black'] as const).map((color) => {
                const selected = playerColor === color;
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
                        fontSize: 15,
                        fontWeight: '700',
                        textTransform: 'capitalize',
                      }}
                    >
                      {color}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
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
                    : 'Updates your chess rating'}
              </Text>
            </View>
            <Toggle value={ratedEffective} onValueChange={setRated} label="Rated" disabled={!userId || !online} />
          </View>
        )}

        {/* Pass-and-play is casual (no rating) — the only option is board flipping. */}
        {isPassAndPlay && <FlipBoardCard />}

        <Button
          label={
            isPuzzles
              ? 'Start Puzzles'
              : isOnlineMode
                ? 'Find an Opponent'
                : isTraining
                  ? 'Start Rated Game'
                  : 'Start Game'
          }
          onPress={
            isPuzzles ? () => router.push('/puzzles/chess' as never) : () => setStarted(true)
          }
          disabled={!canStart}
          glow
        />
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
      ? `Checkmate — ${cap(winner!)} wins! 🎉`
      : winner === playerColor
        ? 'Checkmate! You win 🎉'
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
                borderRadius: 12,
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
            hintDisabled={!yourTurn}
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
        actions={
          <>
            <Button label="Play Again" onPress={handleNewGame} glow />
            <Button label="Back to Home" variant="secondary" onPress={() => router.replace('/' as never)} />
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
    <View style={{ flexDirection: 'row', gap: 6, width: '50%', paddingVertical: 2 }}>
      <Text style={{ color: COLORS.fgMuted, fontSize: 13 }}>{label}:</Text>
      <Text style={{ color: COLORS.fg, fontSize: 13, fontWeight: '700', textTransform: capitalize ? 'capitalize' : 'none' }}>
        {value}
      </Text>
    </View>
  );
}

