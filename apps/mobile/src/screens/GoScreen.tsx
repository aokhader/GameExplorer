import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '@gameexplorer/client';
import { GoEngine, moveHistoryToGo, toGoPoint, type GoColor, type GoGameState } from '@gameexplorer/shared';
import {
  GO_DIFFICULTY_LEVELS,
  GO_PASS,
  GO_TRAINING_ELO_BOUNDS,
  goAdapter,
  goEloLabel,
} from '@gameexplorer/client/game/goAdapter';
import { COLORS, GAME_ACCENTS, GO_STONE_STYLE, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Toggle } from '@/components/ui';
import { GoBoard } from '@/board/GoBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { BackToHomeButton } from '@/game/resultDismiss';
import { OpponentPicker, type SetupMode } from '@/game/OpponentPicker';
import { SetupHero } from '@/game/SetupHero';
import { LearnLink } from '@/game/LearnLink';
import { MoveBand } from '@/game/MoveBand';
import { GameBar } from '@/game/GameBar';
import { TrainingSetup } from '@/game/TrainingSetup';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';

/** Modes Go offers. No online (no socket protocol) and no puzzles (no gate). */
const GO_MODES: readonly SetupMode[] = ['bot', 'training', 'pass-and-play'];

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

  const online = useIsOnline();
  const isPassAndPlay = mode === 'pass-and-play';
  const isTraining = mode === 'training';
  const isBotSetup = mode === 'bot';
  const picksColor = mode === 'bot' || mode === 'training';

  // Rated needs connectivity at game start (the offline semantics every mobile
  // game screen follows). Training is rated by definition, so it has no toggle.
  const ratedEffective = isTraining
    ? !!userId && online
    : rated && !!userId && !isPassAndPlay && online;

  const gameMode: LocalGameMode = isPassAndPlay ? 'pass-and-play' : isTraining ? 'training' : 'bot';

  const game = useLocalGame<GoGameState>({
    adapter: goAdapter,
    mode: gameMode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    eloBounds: GO_TRAINING_ELO_BOUNDS,
    started,
  });

  const botElo = game.botElo;
  const canStart = isTraining ? ratedEffective && !game.ratingLoading : true;

  const handleNewGame = () => {
    game.newGame();
    setStarted(false);
  };

  // Above the setup-screen early return: hooks can't be called conditionally.
  const goMoves = useMemo(
    () => moveHistoryToGo(game.timeline[game.timeline.length - 1].moveHistory),
    [game.timeline],
  );
  const score = useMemo(() => GoEngine.score(game.displayState), [game.displayState]);

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

        <Text style={{ color: COLORS.fgSubtle, fontSize: 12, marginBottom: 20 }}>
          9×9 · area scoring · {goAdapter.newGame().komi} komi to white
        </Text>

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
                      {color === 'black' ? 'You move first' : `Gets ${goAdapter.newGame().komi} komi`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}

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

  const mover = liveState.currentTurn;
  const moverOther: GoColor = mover === 'black' ? 'white' : 'black';
  const pnpWinner = manualEnd === 'resign' ? moverOther : liveState.winner;

  const finalScore = GoEngine.score(liveState);
  const margin = `${finalScore.lead > 0 ? 'Black' : 'White'} by ${Math.abs(finalScore.lead)}`;

  let gameOverMsg: string | null = null;
  if (manualEnd === 'resign') {
    gameOverMsg = isPassAndPlay ? `${cap(mover)} resigned — ${cap(moverOther)} wins` : 'You resigned';
  } else if (liveState.isGameOver) {
    gameOverMsg = isPassAndPlay
      ? `Two passes — ${margin}`
      : liveState.winner === playerColor
        ? `You win — ${margin} 🎉`
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
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd;
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
            highlightPos={isAtLive ? lastPlaced : null}
            hintPos={isAtLive ? hintPos : null}
            interactive={interactive}
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
                <InfoCell label="Turn" value={gameOverMsg ? '—' : liveState.currentTurn} capitalize />
                <InfoCell label="Komi" value={String(liveState.komi)} />
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
              <Text style={{ color: COLORS.fgSubtle, fontSize: 11, lineHeight: 15 }}>
                Capture dead stones before passing — anything left on the board counts for its
                owner. Two passes end the game.
              </Text>
            </View>
          </>
        }
        bottomBar={
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
        }
      />

      <GameResultScreen
        open={!!gameOverMsg}
        result={myResult}
        title={isPassAndPlay && pnpWinner ? `${cap(pnpWinner)} Wins!` : undefined}
        subtitle={
          manualEnd === 'resign'
            ? gameOverMsg ?? undefined
            : `${gameOverMsg ?? ''} · Black ${finalScore.black}, White ${finalScore.white}`
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
            <BackToHomeButton />
          </>
        }
      />
    </>
  );
}
