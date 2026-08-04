import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import {
  CheckersEngine,
  moveHistoryToPdn,
  type CheckersGameState,
} from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Toggle } from '@/components/ui';
import { CheckersBoard } from '@/board/CheckersBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { OpponentPicker, FlipBoardCard } from '@/game/OpponentPicker';
import { SetupHero } from '@/game/SetupHero';
import { MoveBand } from '@/game/MoveBand';
import { GameBar } from '@/game/GameBar';
import { TrainingSetup } from '@/game/TrainingSetup';
import { eloLabel } from '@/game/eloLabel';
import { ReviewScreen } from '@/analysis/ReviewScreen';
import { checkersAnalysis } from '@/analysis/adapters';
import { useGameAnalysis } from '@/analysis/useGameAnalysis';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { checkersAdapter } from '@/engine/checkersAdapter';
import { useSettings } from '@/providers/SettingsProvider';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';


const DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Misses captures, blunders pieces', icon: '🟢' },
  { elo: 800, label: 'Casual', description: 'Somewhat random, misses jump chains', icon: '🔵' },
  { elo: 1100, label: 'Club', description: 'Consistent, catches forced captures', icon: '🟡' },
  { elo: 1400, label: 'Strong', description: 'Strong tactically', icon: '🟠' },
  { elo: 1700, label: 'Expert', description: 'Very difficult to beat', icon: '🔴' },
  { elo: 2000, label: 'Master', description: 'Near-optimal play', icon: '⚫' },
] as const;

function labelForElo(elo: number): string {
  return DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

/**
 * Range the rating-matched training bot is clamped into — the span the checkers
 * bot is actually calibrated across (same bounds web's training page uses).
 */
const TRAINING_ELO_BOUNDS = { min: 400, max: 2000 };

/** "white" → "White" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}


/**
 * Checkers vs bot or pass-and-play. A setup screen (opponent + strength + color +
 * rated toggle) hands off to the in-game shell driven by `useLocalGame`. Bot mode
 * mirrors web's `checkers/bot/page.tsx`, reusing the same shared engine, bot,
 * rating math, and `saveCheckersGame` writer so results match web exactly.
 * Pass-and-play (M4) runs the same loop with no bot and no save — two humans
 * alternate on one device, optionally flipping the board between turns.
 */
export function CheckersScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useSettings();

  const [mode, setMode] = useState<LocalGameMode>('bot');
  const [targetElo, setTargetElo] = useState(1100);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [rated, setRated] = useState(true);
  const [started, setStarted] = useState(false);
  // Manual board flip from the game menu — inverts whatever orientation the
  // mode would otherwise pick (see boardColor below).
  const [flipped, setFlipped] = useState(false);
  // Post-game review. Only reachable once the game is over — see the GameBar
  // handler below.
  const [reviewing, setReviewing] = useState(false);

  const online = useIsOnline();
  const isPassAndPlay = mode === 'pass-and-play';
  const isTraining = mode === 'training';
  // Rated needs connectivity at game start (offline semantics — mobile plan).
  // Training is rated by definition, so it has no toggle — signed in + online
  // is exactly what it requires, and the setup panel says so when it's missing.
  const ratedEffective = isTraining
    ? !!userId && online
    : rated && !!userId && !isPassAndPlay && online;

  const game = useLocalGame<CheckersGameState>({
    adapter: checkersAdapter,
    mode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    eloBounds: TRAINING_ELO_BOUNDS,
    started,
  });

  // Training matches the bot to the player; every other mode uses the picked tier.
  const botElo = game.botElo;
  const canStart = isTraining ? ratedEffective && !game.ratingLoading : true;

  const handleNewGame = () => {
    game.newGame();
    setStarted(false);
    setFlipped(false);
    setReviewing(false);
  };

  // Portable Draughts Notation — the numbered-square form tournaments use.
  // Above the setup-screen early return: hooks can't be called conditionally.
  const pdnMoves = useMemo(
    () => moveHistoryToPdn(game.timeline[game.timeline.length - 1].moveHistory),
    [game.timeline],
  );

  const analysis = useGameAnalysis({
    adapter: checkersAnalysis,
    timeline: game.timeline,
    viewIndex: game.viewIndex,
    currentTurn: (s) => s.currentTurn,
    enabled: reviewing,
  });

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <Screen>
        <GlowBackdrop
          blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: GAME_ACCENTS.checkers.base, opacity: 0.16 }]}
        />
        <BackHeader fallbackHref="/" />
        <SetupHero game="checkers" />

        <Pressable
          onPress={() => router.push('/learn/checkers' as never)}
          accessibilityRole="link"
          accessibilityLabel="How to play checkers"
          hitSlop={8}
          style={{ alignSelf: 'center', marginTop: -12, marginBottom: 22 }}
        >
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: GAME_ACCENTS.checkers.base }}>
            New to checkers? How to play →
          </Text>
        </Pressable>

        <OpponentPicker value={mode} onChange={setMode} accent={GAME_ACCENTS.checkers.base} tint={GAME_ACCENTS.checkers.tintBg} />

        {isTraining && (
          <TrainingSetup
            game="checkers"
            rating={game.userRating}
            loading={game.ratingLoading}
            botElo={botElo}
            signedIn={!!userId}
            online={online}
          />
        )}

        {!isPassAndPlay && !isTraining && (
          <>
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15, marginBottom: 10 }}>
              Bot strength
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
              {DIFFICULTY_LEVELS.map((level) => {
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
                      backgroundColor: selected ? GAME_ACCENTS.checkers.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.checkers.base : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                    <Text style={{ color: selected ? GAME_ACCENTS.checkers.base : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
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

        {/* Colour is picked in both bot modes — training just doesn't choose the
            bot's strength. */}
        {!isPassAndPlay && (
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
                      backgroundColor: selected ? GAME_ACCENTS.checkers.tintBg : COLORS.surfaceAlt,
                      borderColor: selected ? GAME_ACCENTS.checkers.base : COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        marginBottom: 8,
                        backgroundColor: color === 'white' ? '#f4d270' : '#3b82f6',
                        borderWidth: 2,
                        borderColor: color === 'white' ? '#8a6a1f' : '#1e40af',
                      }}
                    />
                    <Text style={{ color: selected ? GAME_ACCENTS.checkers.base : COLORS.fg, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' }}>
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
        {!isPassAndPlay && !isTraining && (
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
                    : 'Updates your checkers rating'}
              </Text>
            </View>
            <Toggle
              value={ratedEffective}
              onValueChange={setRated}
              label="Rated"
              disabled={!userId || !online}
            />
          </View>
        )}

        {/* Pass-and-play is casual (no rating) — the only option is board flipping. */}
        {isPassAndPlay && <FlipBoardCard />}

        <Button
          label={isTraining ? 'Start Rated Game' : 'Start Game'}
          onPress={() => setStarted(true)}
          disabled={!canStart}
          glow
        />
      </Screen>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const { liveState, displayState, isAtLive, isThinking, manualEnd, ratingResult } = game;

  // Pass-and-play: "the mover" replaces "you". Resign concedes for the player to
  // move (currentTurn is stable after a manual end — no moves append past it).
  const mover = liveState.currentTurn;
  const moverOther: 'white' | 'black' = mover === 'white' ? 'black' : 'white';
  const pnpWinner = manualEnd === 'resign' ? moverOther : manualEnd === 'draw' ? null : liveState.winner;

  let gameOverMsg: string | null = null;
  if (manualEnd === 'resign') {
    gameOverMsg = isPassAndPlay ? `${cap(mover)} resigned — ${cap(moverOther)} wins` : 'You resigned';
  } else if (manualEnd === 'draw') {
    gameOverMsg = 'Draw by agreement';
  } else if (liveState.isGameOver) {
    gameOverMsg =
      liveState.winner === null
        ? 'Draw — 40 moves without capture'
        : isPassAndPlay
          ? `${cap(liveState.winner)} wins! 🎉`
          : liveState.winner === playerColor
            ? 'You win! 🎉'
            : 'Bot wins';
  }

  const myResult: GameResult = isPassAndPlay
    ? pnpWinner
      ? 'win'
      : 'draw'
    : manualEnd === 'resign'
      ? 'loss'
      : manualEnd === 'draw'
        ? 'draw'
        : liveState.winner === null
          ? 'draw'
          : liveState.winner === playerColor
            ? 'win'
            : 'loss';

  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;
  const moverTurn = isAtLive && !gameOverMsg;
  const counts = CheckersEngine.getPieceCounts(displayState);
  // Training's bot has no tier name — it's whatever the rating ladder calls the
  // player's own level.
  const botLabel = isTraining ? `${botElo} · ${eloLabel('checkers', botElo)}` : labelForElo(targetElo);
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd;
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
        accent="checkers"
        title="Review"
        adapter={checkersAnalysis}
        moves={pdnMoves}
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
          <CheckersBoard
            gameState={displayState}
            onMove={() => {}}
            playerColor={boardColor}
            // The engine's choice reuses the training hint's ring — same meaning
            // ("play this move"), so it should look the same.
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
        accent="checkers"
        backHref="/"
        title="Checkers"
        // Jump-to-live and New Game both used to sit up here; they're on the game
        // bar now, which is always in reach (and clear of the dev-menu bubble).
        topCard={
          isPassAndPlay ? (
            <PlayerCard
              name="Black"
              initial="B"
              active={moverTurn && mover === 'black'}
              subline={`Black pieces${moverTurn && mover === 'black' ? ' · to move' : ''}`}
            />
          ) : (
            <PlayerCard
              name="Bot"
              initial="B"
              active={isThinking}
              subline={isThinking ? `${botLabel} · thinking…` : botLabel}
            />
          )
        }
        board={
          <CheckersBoard
            gameState={displayState}
            onMove={game.handleMove}
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
            {/* Where the status banner used to sit — it repeated what the player
                cards already say, so the space carries the move ribbon instead. */}
            <MoveBand
              moves={pdnMoves}
              viewIndex={game.viewIndex}
              onSeek={game.setViewIndex}
              accent="checkers"
            />

            {/* Info card */}
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
                <InfoCell label="Turn" value={gameOverMsg ? '—' : liveState.currentTurn} capitalize />
                <InfoCell label="Move" value={String(liveState.moveHistory.length)} />
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
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 20,
                  paddingTop: 8,
                  borderTopWidth: 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <PieceCount color="#f4d270" border="#8a6a1f" count={counts.white} />
                <Text style={{ color: COLORS.fgMuted, fontSize: 12 }}>vs</Text>
                <PieceCount color="#3b82f6" border="#1e40af" count={counts.black} />
              </View>
            </View>

          </>
        }
        bottomBar={
          <GameBar
            viewIndex={game.viewIndex}
            total={game.timeline.length}
            onSeek={game.setViewIndex}
            accent="checkers"
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
                  ? undefined
                  : '40 moves without capture'
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

function PieceCount({ color, border, count }: { color: string; border: string; count: number }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: border }} />
      <Text style={{ color: COLORS.fg, fontSize: 13, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

