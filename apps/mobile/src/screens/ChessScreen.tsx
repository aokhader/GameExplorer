import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@gameexplorer/client';
import { type ChessGameState } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Toggle } from '@/components/ui';
import { ChessBoard } from '@/board/ChessBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { StatusBanner } from '@/game/StatusBanner';
import { GameActions } from '@/game/GameActions';
import { GameResultScreen, type GameResult } from '@/game/GameResultScreen';
import { OpponentPicker, FlipBoardCard } from '@/game/OpponentPicker';
import { useLocalGame, type LocalGameMode } from '@/engine/useLocalGame';
import { chessAdapter } from '@/engine/chessAdapter';
import { useSettings } from '@/providers/SettingsProvider';

const BLUE = GAME_ACCENTS.chess.base;
const BLUE_TINT = 'rgba(59,130,246,0.12)';

// Chess bots ship capped below 1400 on mobile (in-house TS engine). The GPL-free
// ≥1400 engine is a documented follow-on — see mobile-app-plan "Chess engine
// decision". Keep every tile under 1400.
const DIFFICULTY_LEVELS = [
  { elo: 600, label: 'Beginner', description: 'Hangs pieces, random-looking play', icon: '🟢' },
  { elo: 800, label: 'Novice', description: 'Misses basic tactics', icon: '🔵' },
  { elo: 1000, label: 'Casual', description: 'Spots one-move threats', icon: '🟡' },
  { elo: 1200, label: 'Club', description: 'Consistent, beatable with tactics', icon: '🟠' },
  { elo: 1300, label: 'Intermediate', description: 'Solid basic play', icon: '🔴' },
] as const;

function labelForElo(elo: number): string {
  return DIFFICULTY_LEVELS.find((l) => l.elo === elo)?.label ?? String(elo);
}

/** "white" → "White" for pass-and-play messages. */
function cap(color: string): string {
  return color[0].toUpperCase() + color.slice(1);
}

function formatMove(move: ChessGameState['moveHistory'][number]): string {
  const cap = move.capturedPiece || move.isEnPassant ? 'x' : '-';
  const promo = move.promotion ? `=${move.promotion[0].toUpperCase()}` : '';
  const suffix = move.isCheckmate ? '#' : move.isCheck ? '+' : '';
  if (move.isCastling) return move.castlingSide === 'kingside' ? 'O-O' : 'O-O-O';
  return `${move.from}${cap}${move.to}${promo}${suffix}`;
}

/**
 * Chess vs bot or pass-and-play — the drag/tap board flow with a promotion picker
 * and check-ring. Setup (opponent + strength + color + rated) hands off to the
 * in-game shell driven by `useLocalGame`. Bots are capped below 1400 (in-house TS
 * engine); bot mode mirrors web's `chess/bot/page.tsx` for the sub-1400 range,
 * reusing the same shared engine, bot, rating math, and `saveGame` writer so
 * results match web. Pass-and-play (M4) runs the same loop with no bot and no
 * save — two humans alternate on one device, optionally flipping the board.
 */
export function ChessScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useSettings();

  const [mode, setMode] = useState<LocalGameMode>('bot');
  const [targetElo, setTargetElo] = useState(1000);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [rated, setRated] = useState(true);
  const [started, setStarted] = useState(false);

  const isPassAndPlay = mode === 'pass-and-play';
  const ratedEffective = rated && !!userId && !isPassAndPlay;

  const game = useLocalGame<ChessGameState>({
    adapter: chessAdapter,
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
        <BackHeader title="New Game" fallbackHref="/" />

        <OpponentPicker value={mode} onChange={setMode} accent={BLUE} tint={BLUE_TINT} />

        {!isPassAndPlay && (
          <>
            <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
              Bot strength
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
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
                      backgroundColor: selected ? BLUE_TINT : COLORS.surfaceAlt,
                      borderColor: selected ? BLUE : COLORS.border,
                    }}
                  >
                    <Text style={{ fontSize: 20, marginBottom: 4 }}>{level.icon}</Text>
                    <Text style={{ color: selected ? BLUE : COLORS.fg, fontSize: 14, fontWeight: '800' }}>
                      {level.label} · {level.elo}
                    </Text>
                    <Text style={{ color: COLORS.fgMuted, fontSize: 11, marginTop: 2 }}>
                      {level.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ color: COLORS.fgSubtle, fontSize: 11, marginBottom: 24 }}>
              Stronger bots (1400+ ELO) arrive in a future update.
            </Text>

            <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700', marginBottom: 10 }}>
              Your color
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
              {(['white', 'black'] as const).map((color) => {
                const selected = playerColor === color;
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
                      backgroundColor: selected ? BLUE_TINT : COLORS.surfaceAlt,
                      borderColor: selected ? BLUE : COLORS.border,
                    }}
                  >
                    <View
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        marginBottom: 8,
                        backgroundColor: color === 'white' ? '#faf9f7' : '#2c1b08',
                        borderWidth: 2,
                        borderColor: color === 'white' ? '#c9c2b6' : '#e8d5b5',
                      }}
                    />
                    <Text
                      style={{
                        color: selected ? BLUE : COLORS.fg,
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
                  {userId ? 'Updates your chess rating' : 'Sign in to play rated games'}
                </Text>
              </View>
              <Toggle value={ratedEffective} onValueChange={setRated} label="Rated" disabled={!userId} />
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
  const botLabel = labelForElo(targetElo);
  const interactive = isAtLive && !gameOverMsg;
  const checkNow = liveState.isCheck && !liveState.isCheckmate;
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
        accent="chess"
        backHref="/"
        title="Chess"
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
          <ChessBoard
            gameState={displayState}
            onMove={(from, to, promotion) => game.handleMove(from, to, promotion)}
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
              accent="chess"
              title={
                gameOverMsg ??
                (isPassAndPlay
                  ? moverTurn
                    ? checkNow
                      ? `Check! ${cap(mover)} to move`
                      : `${cap(mover)} to move`
                    : 'Reviewing history'
                  : isThinking
                    ? 'Bot is thinking…'
                    : checkNow && yourTurn
                      ? 'Check! Defend your king'
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
                      ? 'Drag or tap a piece to move.'
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
                            backgroundColor: isActive ? 'rgba(59,130,246,0.18)' : COLORS.surfaceMuted,
                          }}
                        >
                          <Text
                            style={{
                              color: isActive ? '#93c5fd' : COLORS.fgMuted,
                              fontSize: 12,
                              fontWeight: isActive ? '700' : '500',
                            }}
                          >
                            {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ''} {formatMove(move)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            </View>

            <GameActions onDraw={game.agreeDraw} onResign={game.resign} disabled={!!gameOverMsg} />
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
