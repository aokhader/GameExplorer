import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import { CheckersEngine, type CheckersGameState } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, GlowBackdrop, Toggle } from '@/components/ui';
import { CheckersBoard } from '@/board/CheckersBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { StatusBanner } from '@/game/StatusBanner';
import { GameActions } from '@/game/GameActions';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { OpponentPicker, FlipBoardCard } from '@/game/OpponentPicker';
import { SetupHero } from '@/game/SetupHero';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { checkersAdapter } from '@/engine/checkersAdapter';
import { useSettings } from '@/providers/SettingsProvider';
import { useIsOnline } from '@/lib/useIsOnline';
import { FONTS } from '@/theme/typography';

const PINK = GAME_ACCENTS.checkers.base;
const PINK_TINT = 'rgba(236,72,153,0.12)';

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

/** "white" → "White" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}

function formatMove(move: CheckersGameState['moveHistory'][number]): string {
  if (move.captures.length === 0) return `${move.from}-${move.to}`;
  return move.path.reduce((acc, sq, i) => (i === 0 ? `${move.from}x${sq}` : `${acc}x${sq}`), '');
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

  const online = useIsOnline();
  const isPassAndPlay = mode === 'pass-and-play';
  // Rated needs connectivity at game start (offline semantics — mobile plan).
  const ratedEffective = rated && !!userId && !isPassAndPlay && online;

  const game = useLocalGame<CheckersGameState>({
    adapter: checkersAdapter,
    mode,
    playerColor,
    targetElo,
    rated: ratedEffective,
    userId,
    started,
  });

  const handleNewGame = () => {
    game.newGame();
    setStarted(false);
  };

  // ── Setup screen ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <Screen>
        <GlowBackdrop
          blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: PINK, opacity: 0.16 }]}
        />
        <BackHeader fallbackHref="/" />
        <SetupHero game="checkers" />

        <OpponentPicker value={mode} onChange={setMode} accent={PINK} tint={PINK_TINT} />

        {!isPassAndPlay && (
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
                      backgroundColor: selected ? PINK_TINT : COLORS.surfaceAlt,
                      borderColor: selected ? PINK : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                    <Text style={{ color: selected ? PINK : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
                      {level.label}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

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
                      backgroundColor: selected ? PINK_TINT : COLORS.surfaceAlt,
                      borderColor: selected ? PINK : COLORS.border,
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
                    <Text style={{ color: selected ? PINK : COLORS.fg, fontSize: 15, fontWeight: '700', textTransform: 'capitalize' }}>
                      {color}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
                      {color === 'white' ? 'You move first' : 'Bot moves first'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Rated toggle — needs a signed-in account (rating reads/writes). */}
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
          </>
        )}

        {/* Pass-and-play is casual (no rating) — the only option is board flipping. */}
        {isPassAndPlay && <FlipBoardCard />}

        <Button label="Start Game" onPress={() => setStarted(true)} glow />
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
  const botLabel = labelForElo(targetElo);
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd;
  // Pass-and-play orientation: face the mover when the flip setting is on,
  // otherwise stay white-side-down. Follows the LIVE turn so reviewing history
  // never spins the board.
  const boardColor: 'white' | 'black' = isPassAndPlay
    ? settings.flipBoardPassAndPlay
      ? mover
      : 'white'
    : playerColor;

  return (
    <>
      <GameScreenLayout
        accent="checkers"
        backHref="/"
        title="Checkers"
        headerActions={
          <>
            {!isAtLive && (
              <Pressable
                onPress={() => game.setViewIndex(game.timeline.length - 1)}
                accessibilityRole="button"
                accessibilityLabel="Jump to live position"
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.accent }}
              >
                <Text style={{ color: COLORS.onAccent, fontSize: 12, fontWeight: '700' }}>Live ⇥</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleNewGame}
              accessibilityRole="button"
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.accent }}
            >
              <Text style={{ color: COLORS.onAccent, fontSize: 13, fontWeight: '700' }}>New Game</Text>
            </Pressable>
          </>
        }
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
            <StatusBanner
              accent="checkers"
              title={
                gameOverMsg ??
                (isPassAndPlay
                  ? moverTurn
                    ? `${cap(mover)} to move`
                    : 'Reviewing history'
                  : isThinking
                    ? 'Bot is thinking…'
                    : yourTurn
                      ? 'Your move'
                      : 'Reviewing history')
              }
              description={
                gameOverMsg
                  ? undefined
                  : isPassAndPlay
                    ? moverTurn
                      ? 'Pass the device between turns.'
                      : undefined
                    : yourTurn
                      ? 'Captures are forced — chain your jumps.'
                      : undefined
              }
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

            {/* Move list + scrubber */}
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceAlt,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.fgMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                  MOVES
                </Text>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <NavBtn label="⇤" disabled={!game.canGoBack} onPress={() => game.setViewIndex(0)} />
                  <NavBtn label="←" disabled={!game.canGoBack} onPress={() => game.setViewIndex(Math.max(0, game.viewIndex - 1))} />
                  <NavBtn label="→" disabled={!game.canGoForward} onPress={() => game.setViewIndex(Math.min(game.timeline.length - 1, game.viewIndex + 1))} />
                  <NavBtn label="⇥" disabled={!game.canGoForward} onPress={() => game.setViewIndex(game.timeline.length - 1)} />
                </View>
              </View>
              <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ padding: 10 }}>
                {liveState.moveHistory.length === 0 ? (
                  <Text style={{ color: COLORS.fgSubtle, fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>
                    No moves yet — make your first move
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {liveState.moveHistory.map((move, i) => {
                      const stateIdx = i + 1;
                      const isActive = game.viewIndex === stateIdx;
                      return (
                        <Pressable
                          key={i}
                          onPress={() => game.setViewIndex(stateIdx)}
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: isActive ? 'rgba(205,164,63,0.18)' : COLORS.surfaceMuted,
                          }}
                        >
                          <Text
                            style={{
                              color: isActive ? '#f0d589' : COLORS.fgMuted,
                              fontSize: 12,
                              fontWeight: isActive ? '700' : '500',
                            }}
                          >
                            {Math.floor(i / 2) + 1}
                            {i % 2 === 0 ? '.' : '…'} {formatMove(move)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>

            <GameActions
              onDraw={game.agreeDraw}
              onResign={game.resign}
              disabled={!!gameOverMsg}
            />
          </>
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
        saveError={game.saveError}
        onRetrySave={game.retrySave}
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: border }} />
      <Text style={{ color: COLORS.fg, fontSize: 13, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

const NAV_LABELS: Record<string, string> = {
  '⇤': 'First move',
  '←': 'Previous move',
  '→': 'Next move',
  '⇥': 'Latest move',
};

function NavBtn({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={NAV_LABELS[label] ?? label}
      accessibilityState={{ disabled }}
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surfaceMuted,
        borderWidth: 1,
        borderColor: COLORS.border,
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Text style={{ color: COLORS.fgMuted, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
