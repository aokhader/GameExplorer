import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getPublicProfile,
  getGames,
  getUserRatings,
  supabase,
  type Profile,
  type GameListItem,
  type UserRating,
  type GameType,
} from '@finesse/db';
import { endReasonLabel } from '@finesse/shared';
import { useAuth } from '@finesse/client';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { Screen, Card, Button } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { BlockedPlayers } from '@/multiplayer/BlockedPlayers';
import { FONTS } from '@/theme/typography';

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const GAME_META: Record<GameType, { label: string }> = {
  chess: { label: 'Chess' },
  checkers: { label: 'Checkers' },
  reversi: { label: 'Reversi' },
  go: { label: 'Go' },
};

/**
 * Game types with an analysis adapter behind `/review/[id]`. Go is absent by
 * design (v1 ships no Go review), and that screen falls back to the chess
 * replayer for unknown types — so gate on this rather than letting a Go row
 * through.
 */
const REVIEWABLE: ReadonlySet<GameType> = new Set<GameType>(['chess', 'checkers', 'reversi']);

/** History filter — "all" plus one pill per game, mirroring web's profile. */
type Tab = 'all' | GameType;
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chess', label: 'Chess' },
  { id: 'checkers', label: 'Checkers' },
  { id: 'reversi', label: 'Reversi' },
  { id: 'go', label: 'Go' },
];

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
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

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
      <Text style={{ color: valueColor ?? COLORS.fg, fontSize: 26, fontFamily: FONTS.display }}>{value}</Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2, fontFamily: FONTS.body }}>{label}</Text>
    </View>
  );
}

/** Tab header: screen title + settings entry (settings lives off the tab bar). */
function YouHeader({ onSettings }: { onSettings: () => void }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 8,
        marginBottom: 20,
      }}
    >
      <Text style={{ color: COLORS.fg, fontSize: 24, fontFamily: FONTS.display }}>You</Text>
      <Pressable
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={10}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceMuted,
        }}
      >
        <Text style={{ fontSize: 17 }}>⚙️</Text>
      </Pressable>
    </View>
  );
}

/**
 * The "You" tab. Guests get an inline sign-in prompt (a tab must not redirect
 * away on focus); signed-in users get the profile: identity, summary stats,
 * per-game ratings, recent games. Data refreshes on tab focus so a just-played
 * game shows up without an app restart.
 */
export default function YouScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Pick<Profile, 'id' | 'username' | 'created_at'> | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  const [ratings, setRatings] = useState<Record<GameType, UserRating> | null>(null);
  // Which game the history list is filtered to, matching web's filter pills.
  const [tab, setTab] = useState<Tab>('all');

  const userId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      Promise.all([
        getPublicProfile(userId),
        getGames(userId),
        getUserRatings(userId, ['chess', 'checkers', 'reversi', 'go']),
      ])
        .then(([profileData, gamesData, ratingData]) => {
          if (!active) return;
          setProfile(profileData);
          setGames(gamesData);
          setRatings(ratingData);
        })
        .catch(() => {
          /* keep whatever data is showing; a retry happens on next focus */
        });
      return () => {
        active = false;
      };
    }, [userId]),
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setGames([]);
    setRatings(null);
    router.replace('/' as never);
  }, [router]);

  const goSettings = () => router.push('/settings' as never);

  // Guest state — invite to sign in, keep settings reachable.
  if (!authLoading && !user) {
    return (
      <Screen scroll={false}>
        <YouHeader onSettings={goSettings} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.surfaceAlt,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ fontSize: 32 }}>👤</Text>
          </View>
          <Text style={{ color: COLORS.fg, fontSize: 22, fontFamily: FONTS.display }}>
            Playing as guest
          </Text>
          <Text
            style={{
              color: COLORS.fgMuted,
              fontSize: 15,
              fontFamily: FONTS.body,
              textAlign: 'center',
              lineHeight: 22,
              maxWidth: 300,
              marginBottom: 8,
            }}
          >
            Sign in to save your games, climb the ratings, and carry your streaks across devices.
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 10 }}>
            <Button label="Sign in" onPress={() => router.push('/(auth)/sign-in?next=/profile' as never)} />
            <Button
              label="Create account"
              variant="secondary"
              onPress={() => router.push('/(auth)/sign-up' as never)}
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (authLoading || !profile || !ratings) {
    return (
      <Screen scroll={false}>
        <YouHeader onSettings={goSettings} />
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
    { type: 'go', rating: ratings.go },
  ];
  const topRating = Math.max(0, ...orderedRatings.map((r) => r.rating.peak_rating));

  const deltaFor = (type: GameType): number | null => {
    const g = games.find((g) => (g.game_type ?? 'chess') === type && ratingDelta(g) !== null);
    return g ? ratingDelta(g) : null;
  };

  const filtered = tab === 'all' ? games : games.filter((g) => (g.game_type ?? 'chess') === tab);
  const recent = filtered.slice(0, 10);

  return (
    <Screen>
      <YouHeader onSettings={goSettings} />

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
          <Text style={{ color: COLORS.onAccent, fontSize: 34, fontFamily: FONTS.display }}>
            {profile.username[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontSize: 24, fontFamily: FONTS.display }}>{profile.username}</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2, fontFamily: FONTS.body }}>
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
            <Card key={type} style={{ padding: 16, borderLeftColor: GAME_ACCENTS[type].base, borderLeftWidth: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <GamePieceIcon game={type} size={26} />
                <Text style={{ color: COLORS.fg, fontSize: 16, fontFamily: FONTS.displaySemi }}>{meta.label}</Text>
              </View>
              {rated ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text style={{ color: GAME_ACCENTS[type].base, fontSize: 28, fontFamily: FONTS.display }}>{rating.rating}</Text>
                    {delta !== null && delta !== 0 && (
                      <Text
                        style={{
                          color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
                          fontSize: 14,
                          fontFamily: FONTS.bodyBold,
                        }}
                      >
                        {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
                      </Text>
                    )}
                  </View>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 4, fontFamily: FONTS.body }}>
                    {rating.games_played} game{rating.games_played !== 1 ? 's' : ''} · {rating.wins}W / {rating.losses}L / {rating.draws}D
                  </Text>
                  <Text style={{ color: COLORS.fgSubtle, fontSize: 12, marginTop: 2, fontFamily: FONTS.body }}>
                    Peak {rating.peak_rating}
                    {rating.games_played < 30 ? ` · Provisional (${30 - rating.games_played} left)` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: GAME_ACCENTS[type].base, fontSize: 28, fontFamily: FONTS.display, opacity: 0.5 }}>—</Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 4, fontFamily: FONTS.body }}>No rated games yet</Text>
                </>
              )}
            </Card>
          );
        })}
      </View>

      {/* Recent games */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <Text style={{ color: COLORS.fg, fontSize: 16, fontFamily: FONTS.displaySemi, marginBottom: 8 }}>Recent games</Text>

        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          {TABS.map((t) => {
            const selected = tab === t.id;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTab(t.id)}
                hitSlop={4}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selected ? COLORS.accent : COLORS.border,
                  backgroundColor: selected ? COLORS.accentMuted : COLORS.surfaceMuted,
                }}
              >
                <Text
                  style={{
                    // accentHover, not accent: this is 12px type, and the fill
                    // colour is tuned for buttons rather than small text — the
                    // same reason web's player card uses its accent-text slot.
                    color: selected ? COLORS.accentHover : COLORS.fgMuted,
                    fontSize: 12,
                    fontFamily: selected ? FONTS.bodyBold : FONTS.body,
                  }}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {recent.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <GamePieceIcon game={tab === 'all' ? 'chess' : tab} size={32} />
            <Text style={{ color: COLORS.fgMuted, fontSize: 14, fontFamily: FONTS.body }}>
              {tab === 'all' ? 'No games played yet' : `No ${GAME_META[tab].label.toLowerCase()} games yet`}
            </Text>
            <Text style={{ color: COLORS.fgSubtle, fontSize: 13, fontFamily: FONTS.body, marginTop: 2 }}>
              Win a rated bot game and it lands here.
            </Text>
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
            // Reviewable when an analysis adapter exists for the type: the stored
            // moves replay into the same timeline the in-game review uses. Go has
            // no adapter yet, so its rows stay inert rather than replaying Go
            // moves through the chess replayer they'd otherwise fall through to.
            const reviewable = REVIEWABLE.has(type);
            return (
              <Pressable
                key={game.id}
                onPress={
                  reviewable
                    ? () => router.push({ pathname: '/review/[id]', params: { id: game.id } } as never)
                    : undefined
                }
                disabled={!reviewable}
                accessibilityRole={reviewable ? 'button' : undefined}
                accessibilityLabel={
                  reviewable ? `Review ${meta.label} game against ${game.opponent}` : undefined
                }
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
                  <Text style={{ color, fontSize: 11, fontFamily: FONTS.bodyBold, textTransform: 'uppercase' }}>{label}</Text>
                </View>
                <GamePieceIcon game={type} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.fg, fontSize: 14, fontFamily: FONTS.bodySemi }} numberOfLines={1}>
                    vs {game.opponent}
                  </Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.body }} numberOfLines={1}>
                    {meta.label}
                    {game.difficulty ? ` · ${game.difficulty}` : ''} · as {game.player_color === 'white' ? 'White' : 'Black'}
                    {endReasonLabel(game.end_reason) ? ` · ${endReasonLabel(game.end_reason)}` : ''}
                  </Text>
                </View>
                {delta !== null && delta !== 0 && (
                  <Text
                    style={{
                      color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
                      fontSize: 13,
                      fontFamily: FONTS.bodyBold,
                    }}
                  >
                    {delta > 0 ? '+' : '−'}{Math.abs(delta)}
                  </Text>
                )}
                <Text style={{ color: COLORS.fgSubtle, fontSize: 11, fontFamily: FONTS.body }}>{relativeTime(game.created_at)}</Text>
              </Pressable>
            );
          })
        )}
      </Card>

      {/* Renders nothing unless there is a block to manage. */}
      <BlockedPlayers />

      <Pressable onPress={signOut} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: 14, fontFamily: FONTS.bodySemi }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
