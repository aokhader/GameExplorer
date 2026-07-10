import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  getPublicProfile,
  getGames,
  getUserRatings,
  supabase,
  type Profile,
  type GameListItem,
  type UserRating,
  type GameType,
} from '@gameexplorer/db';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen, BackHeader, Card, Button } from '@/components/ui';

const GAME_META: Record<GameType, { label: string; icon: string; accent: string }> = {
  chess: { label: 'Chess', icon: '♞', accent: GAME_ACCENTS.chess.base },
  checkers: { label: 'Checkers', icon: '⛃', accent: GAME_ACCENTS.checkers.base },
  reversi: { label: 'Reversi', icon: '⚫', accent: GAME_ACCENTS.reversi.base },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relativeTime(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

function ratingDelta(g: GameListItem): number | null {
  if (g.rating_before == null || g.rating_after == null) return null;
  return g.rating_after - g.rating_before;
}

function StatTile({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
      }}
    >
      <Text style={{ color: valueColor ?? COLORS.fg, fontSize: 26, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Pick<Profile, 'id' | 'username' | 'created_at'> | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [ratings, setRatings] = useState<Record<GameType, UserRating> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      // getSession() reads local storage (no network). Queries are RLS-protected,
      // so a stale token simply falls through to the sign-in redirect.
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        router.replace('/(auth)/sign-in?next=/profile' as never);
        return;
      }

      const [profileData, gamesData, ratingData] = await Promise.all([
        getPublicProfile(user.id),
        getGames(user.id),
        getUserRatings(user.id, ['chess', 'checkers', 'reversi']),
      ]);
      if (!active) return;
      setProfile(profileData);
      setGames(gamesData);
      setRatings(ratingData);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [router]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace('/' as never);
  }, [router]);

  if (loading || !profile || !ratings) {
    return (
      <Screen scroll={false}>
        <BackHeader fallbackHref="/" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </Screen>
    );
  }

  const wins = games.filter((g) => g.result === g.player_color).length;
  const winRate = games.length > 0 ? Math.round((wins / games.length) * 100) : 0;

  let currentStreak = 0;
  for (const g of games) {
    if (g.result === g.player_color) currentStreak++;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const g of games) {
    run = g.result === g.player_color ? run + 1 : 0;
    if (run > bestStreak) bestStreak = run;
  }

  const orderedRatings: { type: GameType; rating: UserRating }[] = [
    { type: 'chess', rating: ratings.chess },
    { type: 'checkers', rating: ratings.checkers },
    { type: 'reversi', rating: ratings.reversi },
  ];
  const topRating = Math.max(0, ...orderedRatings.map((r) => r.rating.peak_rating));

  const deltaFor = (type: GameType): number | null => {
    const g = games.find((g) => (g.game_type ?? 'chess') === type && ratingDelta(g) !== null);
    return g ? ratingDelta(g) : null;
  };

  const recent = games.slice(0, 10);

  return (
    <Screen>
      <BackHeader fallbackHref="/" />

      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: COLORS.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORS.onAccent, fontSize: 34, fontWeight: '800' }}>
            {profile.username[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontSize: 24, fontWeight: '800' }}>{profile.username}</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2 }}>
            Member since {formatDate(profile.created_at)}
            {currentStreak >= 2 ? ` · 🔥 ${currentStreak}-game streak` : ''}
          </Text>
        </View>
      </View>

      {/* Summary stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <StatTile label="Games played" value={games.length} />
        <StatTile label="Win rate" value={`${winRate}%`} valueColor={COLORS.successHover} />
        <StatTile label="Best streak" value={bestStreak} />
        <StatTile label="Top rating" value={topRating > 0 ? topRating : '—'} valueColor={COLORS.accentHover} />
      </View>

      {/* Per-game ratings */}
      <View style={{ gap: 12, marginBottom: 20 }}>
        {orderedRatings.map(({ type, rating }) => {
          const meta = GAME_META[type];
          const delta = deltaFor(type);
          const rated = rating.games_played > 0;
          return (
            <Card key={type} style={{ padding: 16, borderLeftColor: meta.accent, borderLeftWidth: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Text style={{ fontSize: 22 }}>{meta.icon}</Text>
                <Text style={{ color: COLORS.fg, fontSize: 16, fontWeight: '700' }}>{meta.label}</Text>
              </View>
              {rated ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ color: meta.accent, fontSize: 28, fontWeight: '800' }}>{rating.rating}</Text>
                    {delta !== null && delta !== 0 && (
                      <Text
                        style={{
                          color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
                          fontSize: 14,
                          fontWeight: '700',
                        }}
                      >
                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 4 }}>
                    {rating.games_played} game{rating.games_played !== 1 ? 's' : ''} · {rating.wins}W / {rating.losses}L / {rating.draws}D
                  </Text>
                  <Text style={{ color: COLORS.fgSubtle, fontSize: 12, marginTop: 2 }}>
                    Peak {rating.peak_rating}
                    {rating.games_played < 30 ? ` · Provisional (${30 - rating.games_played} left)` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: meta.accent, fontSize: 28, fontWeight: '800', opacity: 0.5 }}>—</Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 4 }}>No rated games yet</Text>
                </>
              )}
            </Card>
          );
        })}
      </View>

      {/* Recent games */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <Text style={{ color: COLORS.fg, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Recent games</Text>
        {recent.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Text style={{ fontSize: 28, marginBottom: 6 }}>♞</Text>
            <Text style={{ color: COLORS.fgMuted, fontSize: 14 }}>No games played yet</Text>
          </View>
        ) : (
          recent.map((game, i) => {
            const type = (game.game_type ?? 'chess') as GameType;
            const meta = GAME_META[type];
            const won = game.result === game.player_color;
            const isDraw = game.result === 'draw';
            const label = isDraw ? 'Draw' : won ? 'Win' : 'Loss';
            const color = isDraw ? COLORS.fgMuted : won ? COLORS.successHover : COLORS.dangerHover;
            const delta = ratingDelta(game);
            return (
              <View
                key={game.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <View
                  style={{
                    width: 52,
                    borderRadius: 8,
                    paddingVertical: 4,
                    alignItems: 'center',
                    backgroundColor: COLORS.surfaceMuted,
                  }}
                >
                  <Text style={{ color, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{label}</Text>
                </View>
                <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.fg, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>
                    vs {game.opponent}
                  </Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 12 }} numberOfLines={1}>
                    {meta.label}
                    {game.difficulty ? ` · ${game.difficulty}` : ''} · as {game.player_color === 'white' ? 'White' : 'Black'}
                  </Text>
                </View>
                {delta !== null && delta !== 0 && (
                  <Text
                    style={{
                      color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
                      fontSize: 13,
                      fontWeight: '700',
                    }}
                  >
                    {delta > 0 ? '+' : '−'}{Math.abs(delta)}
                  </Text>
                )}
                <Text style={{ color: COLORS.fgSubtle, fontSize: 11 }}>{relativeTime(game.created_at)}</Text>
              </View>
            );
          })
        )}
      </Card>

      <View style={{ gap: 12 }}>
        <Button label="Settings" variant="secondary" onPress={() => router.push('/settings' as never)} />
        <Pressable onPress={signOut} style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
