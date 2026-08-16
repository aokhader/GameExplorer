import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { apiFetch, useAuth } from '@gameexplorer/client';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { Button, BackHeader } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';

interface LiveGame {
  gameId: string;
  gameType: 'chess' | 'checkers' | 'reversi';
  timeControl: string;
  white: { username: string; rating: number };
  black: { username: string; rating: number };
  moveCount: number;
}

/** How often the list refreshes itself, matching web's spectate lobby. */
const POLL_MS = 5000;

/**
 * The live-games lobby — `GET /api/games/live`, the same endpoint web's
 * `/spectate` polls.
 *
 * Pull-to-refresh is the phone's idiom and replaces web's ↻ button, but the 5s
 * poll is kept: the list is the point of the screen, and a stale one sends
 * people into games that already ended.
 */
export default function SpectateLobby() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [games, setGames] = useState<LiveGame[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ games: LiveGame[] }>('/games/live');
      setGames(data.games);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load live games.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [user, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!authLoading && !user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top', 'bottom']}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <BackHeader title="Watch Live" fallbackHref="/" />
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>
            Spectating runs over the same authenticated connection as playing, so
            it needs an account.
          </Text>
          <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in' as never)} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
      >
        <BackHeader title="Watch Live" fallbackHref="/" />

        {!loaded ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        ) : error ? (
          <View style={{ paddingVertical: 40, gap: 14, alignItems: 'center' }}>
            <Text
              style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 14, textAlign: 'center' }}
            >
              {error}
            </Text>
            <Button label="Try again" variant="secondary" onPress={() => void load()} />
          </View>
        ) : games.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 40 }}>🍿</Text>
            <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15 }}>
              No live games right now.
            </Text>
            <Text
              style={{
                color: COLORS.fgSubtle,
                fontFamily: FONTS.body,
                fontSize: 13,
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              Start one from any game&apos;s Online mode and it shows up here.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}
            >
              {games.length} live {games.length === 1 ? 'game' : 'games'}
            </Text>
            {games.map((g) => (
              <LiveGameRow
                key={g.gameId}
                game={g}
                onPress={() =>
                  router.push({
                    pathname: '/spectate/[gameId]',
                    // The server tells a spectator only the black player's name
                    // (see the `spectate` handler); carrying both from the list
                    // is what lets the viewer label the board properly.
                    params: {
                      gameId: g.gameId,
                      white: g.white.username,
                      black: g.black.username,
                    },
                  } as never)
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LiveGameRow({ game, onPress }: { game: LiveGame; onPress: () => void }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accent = GAME_ACCENTS[game.gameType].base;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Watch ${game.white.username} versus ${game.black.username}, ${game.gameType}, ${game.moveCount} moves played`}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 64,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: COLORS.border,
            backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
        >
          <GamePieceIcon game={game.gameType} size={28} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi, fontSize: 15 }}>
              {game.white.username} ({game.white.rating})
              <Text style={{ color: COLORS.fgMuted }}> vs </Text>
              {game.black.username} ({game.black.rating})
            </Text>
            <Text
              style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }}
            >
              {game.timeControl} · {game.moveCount} {game.moveCount === 1 ? 'move' : 'moves'}
            </Text>
          </View>
          <Text style={{ color: accent, fontFamily: FONTS.bodySemi, fontSize: 14 }}>Watch</Text>
        </View>
      )}
    </Pressable>
  );
}
