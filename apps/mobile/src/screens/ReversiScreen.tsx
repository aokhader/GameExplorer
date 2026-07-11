import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@gameexplorer/client';
import { ReversiEngine, type ReversiGameState, type ReversiColor } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, REVERSI_DISC_COLORS } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Toggle } from '@/components/ui';
import { ReversiBoard } from '@/board/ReversiBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { StatusBanner } from '@/game/StatusBanner';
import { GameActions } from '@/game/GameActions';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { useLocalGame } from '@/engine/useLocalGame';
import { reversiAdapter } from '@/engine/reversiAdapter';

const LIME = GAME_ACCENTS.reversi.base;
const LIME_TINT = 'rgba(163,230,53,0.12)';

const DIFFICULTY_LEVELS = [
  { elo: 500, label: 'Beginner', description: 'Plays randomly, ignores corners', icon: '🟢' },
  { elo: 800, label: 'Casual', description: 'Spots basic flips, misses strategy', icon: '🔵' },
  { elo: 1100, label: 'Club', description: 'Uses positional heuristics', icon: '🟡' },
  { elo: 1400, label: 'Strong', description: 'Controls corners and mobility', icon: '🟠' },
  { elo: 1700, label: 'Expert', description: 'Deep tactical and positional play', icon: '🔴' },
  { elo: 2000, label: 'Master', description: 'Near-optimal — very hard to beat', icon: '⚫' },
] as const;

function labelForElo(elo: number): string {
  return DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

function formatMove(move: ReversiGameState['moveHistory'][number]): string {
  if (!move.position) return 'pass';
  return move.flipped.length > 0 ? `${move.position} +${move.flipped.length}` : move.position;
}

/**
 * Reversi vs bot — the M3 tap-only board flow. A setup screen (strength + color +
 * rated toggle) hands off to the in-game shell driven by `useLocalGame`, which
 * auto-passes for either side (reversi's one special turn rule) via the adapter.
 * Mirrors web's `reversi/bot/page.tsx`, reusing the same shared engine, bot,
 * rating math, and `saveReversiGame` writer so results match web exactly.
 */
export function ReversiScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [targetElo, setTargetElo] = useState(1100);
  const [playerColor, setPlayerColor] = useState<ReversiColor>('black');
  const [rated, setRated] = useState(true);
  const [started, setStarted] = useState(false);

  const ratedEffective = rated && !!userId;

  const game = useLocalGame<ReversiGameState>({
    adapter: reversiAdapter,
    mode: 'bot',
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
        <BackHeader title="Play vs Bot" fallbackHref="/" />

        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
          Bot strength
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
          {DIFFICULTY_LEVELS.map((level) => {
            const selected = targetElo === level.elo;
            return (
              <Pressable
                key={level.elo}
                onPress={() => setTargetElo(level.elo)}
                style={{
                  flexGrow: 1,
                  flexBasis: '47%',
                  borderRadius: 14,
                  borderWidth: 2,
                  padding: 12,
                  backgroundColor: selected ? LIME_TINT : COLORS.surfaceAlt,
                  borderColor: selected ? LIME : COLORS.border,
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                <Text style={{ color: selected ? LIME : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
                  {level.label}
                </Text>
                <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                  {level.description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
          Your color
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          {(['black', 'white'] as const).map((color) => {
            const selected = playerColor === color;
            const disc = REVERSI_DISC_COLORS[color];
            return (
              <Pressable
                key={color}
                onPress={() => setPlayerColor(color)}
                style={{
                  flex: 1,
                  borderRadius: 14,
                  borderWidth: 2,
                  padding: 16,
                  alignItems: 'center',
                  backgroundColor: selected ? LIME_TINT : COLORS.surfaceAlt,
                  borderColor: selected ? LIME : COLORS.border,
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    marginBottom: 8,
                    backgroundColor: disc.fill,
                    borderWidth: 2,
                    borderColor: disc.stroke,
                  }}
                />
                <Text
                  style={{
                    color: selected ? LIME : COLORS.fg,
                    fontSize: 15,
                    fontWeight: '700',
                    textTransform: 'capitalize',
                  }}
                >
                  {color}
                </Text>
                <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
                  {color === 'black' ? 'You move first' : 'Bot moves first'}
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
            <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }}>Rated</Text>
            <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
              {userId ? 'Updates your reversi rating' : 'Sign in to play rated games'}
            </Text>
          </View>
          <Toggle value={ratedEffective} onValueChange={setRated} label="Rated" disabled={!userId} />
        </View>

        <Button label="Start Game" onPress={() => setStarted(true)} glow />
      </Screen>
    );
  }

  // ── Game screen ─────────────────────────────────────────────────────────────
  const { liveState, displayState, isAtLive, isThinking, manualEnd, ratingResult } = game;

  const counts = ReversiEngine.getDiscCounts(displayState);
  const otherColor: ReversiColor = playerColor === 'black' ? 'white' : 'black';

  const gameOverMsg =
    manualEnd === 'resign'
      ? 'You resigned'
      : liveState.isGameOver
        ? liveState.winner === null
          ? `Draw ${counts.black}–${counts.white}`
          : liveState.winner === playerColor
            ? `You win! ${counts[playerColor]}–${counts[otherColor]} 🎉`
            : `Bot wins ${counts[otherColor]}–${counts[playerColor]}`
        : null;

  const myResult: GameResult =
    manualEnd === 'resign'
      ? 'loss'
      : liveState.winner === null
        ? 'draw'
        : liveState.winner === playerColor
          ? 'win'
          : 'loss';

  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;
  const mustPass = !gameOverMsg && isAtLive && ReversiEngine.mustPass(liveState);
  const lastPlaced = liveState.moveHistory[liveState.moveHistory.length - 1]?.position ?? null;
  const botLabel = labelForElo(targetElo);
  const interactive = isAtLive && !liveState.isGameOver && !manualEnd;

  return (
    <>
      <GameScreenLayout
        accent="reversi"
        backHref="/"
        title="Reversi"
        headerActions={
          <>
            {!isAtLive && (
              <Pressable
                onPress={() => game.setViewIndex(game.timeline.length - 1)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.accent }}
              >
                <Text style={{ color: COLORS.onAccent, fontSize: 12, fontWeight: '700' }}>Live ⇥</Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleNewGame}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.accent }}
            >
              <Text style={{ color: COLORS.onAccent, fontSize: 13, fontWeight: '700' }}>New Game</Text>
            </Pressable>
          </>
        }
        topCard={
          <PlayerCard
            name="Bot"
            initial="B"
            active={isThinking}
            subline={isThinking ? `${botLabel} · thinking…` : botLabel}
          />
        }
        board={
          <ReversiBoard
            gameState={displayState}
            onMove={(pos) => game.handleMove(pos, pos)}
            playerColor={playerColor}
            highlightPos={isAtLive ? lastPlaced : null}
            interactive={interactive}
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
            <StatusBanner
              accent="reversi"
              title={
                gameOverMsg ??
                (mustPass
                  ? 'No legal moves — passing…'
                  : isThinking
                    ? 'Bot is thinking…'
                    : yourTurn
                      ? 'Your move'
                      : 'Reviewing history')
              }
              description={gameOverMsg ? undefined : yourTurn ? 'Glowing dots mark every legal square.' : undefined}
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
                <InfoCell label="Bot" value={botLabel} />
                <InfoCell label="Playing" value={playerColor} capitalize />
                <InfoCell label="Turn" value={liveState.isGameOver ? '—' : liveState.currentTurn} capitalize />
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
                <DiscCount color={REVERSI_DISC_COLORS.black.fill} border={REVERSI_DISC_COLORS.black.stroke} count={counts.black} />
                <Text style={{ color: COLORS.fgMuted, fontSize: 12 }}>vs</Text>
                <DiscCount color={REVERSI_DISC_COLORS.white.fill} border={REVERSI_DISC_COLORS.white.stroke} count={counts.white} />
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
                <Text style={{ color: COLORS.fgMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>MOVES</Text>
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
                    No moves yet — tap a glowing square
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
                            backgroundColor: isActive ? 'rgba(163,230,53,0.18)' : COLORS.surfaceMuted,
                          }}
                        >
                          <Text
                            style={{
                              color: isActive ? '#c7f36a' : COLORS.fgMuted,
                              fontSize: 12,
                              fontWeight: isActive ? '700' : '500',
                            }}
                          >
                            {Math.floor(i / 2) + 1}
                            {i % 2 === 0 ? '.' : '…'} {move.color === 'black' ? '⬤' : '○'} {formatMove(move)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>

            {/* Reversi has no draw offers — resign only. */}
            <GameActions onResign={game.resign} disabled={!!gameOverMsg} />
          </>
        }
      />

      <GameResultScreen
        open={!!gameOverMsg}
        result={myResult}
        subtitle={gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        actions={
          <>
            <Button label="Play Again" onPress={handleNewGame} glow />
            <Button label="Back to Home" variant="secondary" onPress={handleNewGame} />
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

function DiscCount({ color, border, count }: { color: string; border: string; count: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, borderWidth: 2, borderColor: border }} />
      <Text style={{ color: COLORS.fg, fontSize: 13, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

function NavBtn({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
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
