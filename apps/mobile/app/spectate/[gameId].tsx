import { useEffect, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth, useGameStore, useSocket } from '@gameexplorer/client';
import { formatClockLong, formatClockShort } from '@gameexplorer/shared';
import type {
  ChessGameState,
  CheckersGameState,
  ReversiGameState,
} from '@gameexplorer/shared';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Button } from '@/components/ui';
import { ChessBoard } from '@/board/ChessBoard';
import { CheckersBoard } from '@/board/CheckersBoard';
import { ReversiBoard } from '@/board/ReversiBoard';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { PlayerCard } from '@/game/PlayerCard';
import { SpectateClock } from '@/multiplayer/SpectateClock';
import { useReconnectOnForeground } from '@/multiplayer/useReconnectOnForeground';
import { FONTS } from '@/theme/typography';

// Stable no-op for the read-only boards: an inline `() => {}` would hand the
// memoized boards a new `onMove` identity on every clock tick.
const noop = () => {};

/**
 * Read-only viewer for a live game — the native counterpart to web's
 * `/spectate/[gameId]`.
 *
 * The socket work is the server's existing `spectate` / `leave_spectate` pair,
 * which replies with the same `game_started` payload a player gets, so the
 * shared `useSocket` handlers fill the same store. Everything below is the
 * read-only view of it: boards with `interactive={false}`, and clocks that
 * count down but cannot be affected.
 *
 * The server tells a spectator only the *black* player's identity (it reuses
 * the two-seat `game_started` shape, with the viewer standing in for white), so
 * the lobby passes both names through as route params. Arriving from a shared
 * link instead leaves the white card generically labelled, which is why the
 * fallbacks below exist.
 */
export default function SpectateGame() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { gameId, white, black } = useLocalSearchParams<{
    gameId: string;
    white?: string;
    black?: string;
  }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { emit, connected } = useSocket();

  // Field-level selectors: this screen re-renders on every clock sync, so it
  // subscribes only to what it draws.
  const gameType = useGameStore((s) => s.gameType);
  const gameState = useGameStore((s) => s.gameState);
  const opponent = useGameStore((s) => s.opponent);
  const clocks = useGameStore((s) => s.clocks);
  const clockSyncedAt = useGameStore((s) => s.clockSyncedAt);
  const status = useGameStore((s) => s.status);
  const endData = useGameStore((s) => s.gameEndData);

  const joinedRef = useRef(false);
  useReconnectOnForeground();

  useEffect(() => {
    if (!connected || !gameId || joinedRef.current) return;
    joinedRef.current = true;
    // The store is shared with play screens, so a stale game must not bleed in.
    useGameStore.getState().reset();
    emit('spectate', { gameId });
    return () => {
      emit('leave_spectate', { gameId });
      useGameStore.getState().reset();
      joinedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, gameId]);

  if (loading) return null;

  if (!user) {
    return (
      <Screen>
        <BackHeader title="Spectate" fallbackHref="/spectate" />
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
          Watching a live game runs over the same authenticated connection as
          playing, so it needs an account.
        </Text>
        <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in' as never)} />
      </Screen>
    );
  }

  if (!gameState || !gameType) {
    return (
      <Screen>
        <BackHeader title="Spectate" fallbackHref="/spectate" />
        <View style={{ paddingVertical: 60, alignItems: 'center', gap: 14 }}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15 }}
          >
            {connected ? 'Loading game…' : 'Connecting…'}
          </Text>
        </View>
      </Screen>
    );
  }

  const running = status === 'active';
  // Chess clocks run for the whole game and are shown as m:ss; the per-move
  // games count a handful of seconds and are shown as Ns.
  const isChess = gameType === 'chess';
  const clockFormat = isChess ? formatClockLong : formatClockShort;
  const lowClockMs = isChess ? 30_000 : 10_000;

  const blackName = black ?? opponent?.username ?? 'Black';
  const whiteName = white ?? 'White';

  return (
    <GameScreenLayout
      accent={gameType}
      backHref="/spectate"
      title="Spectating"
      topCard={
        <PlayerCard
          name={blackName}
          initial={(blackName.trim()[0] ?? 'B').toUpperCase()}
          subline={opponent?.rating != null ? String(opponent.rating) : 'Black'}
          active={running && clocks?.active_color === 'black'}
          right={
            <SpectateClock
              color="black"
              clocks={clocks}
              clockSyncedAt={clockSyncedAt}
              running={running}
              format={clockFormat}
              lowClockMs={lowClockMs}
            />
          }
        />
      }
      board={
        gameType === 'chess' ? (
          <ChessBoard
            gameState={gameState as ChessGameState}
            onMove={noop}
            playerColor="white"
            interactive={false}
          />
        ) : gameType === 'checkers' ? (
          <CheckersBoard
            gameState={gameState as CheckersGameState}
            onMove={noop}
            playerColor="white"
            interactive={false}
          />
        ) : (
          <ReversiBoard
            gameState={gameState as ReversiGameState}
            onMove={noop}
            playerColor="black"
            interactive={false}
          />
        )
      }
      bottomCard={
        <PlayerCard
          name={whiteName}
          initial={(whiteName.trim()[0] ?? 'W').toUpperCase()}
          subline="White"
          active={running && clocks?.active_color === 'white'}
          right={
            <SpectateClock
              color="white"
              clocks={clocks}
              clockSyncedAt={clockSyncedAt}
              running={running}
              format={clockFormat}
              lowClockMs={lowClockMs}
            />
          }
        />
      }
      sidebar={
        status === 'ended' &&
        endData && (
          <View
            accessibilityLiveRegion="polite"
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceAlt,
              padding: 16,
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 18 }}>
              {endData.result === 'draw'
                ? 'Draw'
                : endData.result === 'white_wins'
                  ? `${whiteName} wins`
                  : `${blackName} wins`}
            </Text>
            <Text
              style={{
                color: COLORS.fgMuted,
                fontFamily: FONTS.body,
                fontSize: 13,
                textTransform: 'capitalize',
              }}
            >
              {endData.reason.replace(/_/g, ' ')}
            </Text>
          </View>
        )
      }
    />
  );
}
