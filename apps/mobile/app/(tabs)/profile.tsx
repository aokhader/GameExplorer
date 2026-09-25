import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  getPublicProfile,
  getGames,
  getPracticeRatings,
  getUserRatings,
  supabase,
  type Profile,
  type GameListItem,
  type UserRating,
  type GameType,
} from '@gameexplorer/db';
import { endReasonLabel, GAME_CATALOG, RATING_COPY } from '@gameexplorer/shared';
import { RATED_GAME_TYPES, ratingDelta, summarizePlayer } from '@gameexplorer/client/game/playerStats';
import { useAuth } from '@gameexplorer/client';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, Card, Button, Icon } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { BlockedPlayers } from '@/multiplayer/BlockedPlayers';
import { FONTS } from '@/theme/typography';
import { REVIEWABLE } from '@/analysis/reviewable';

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const GAME_META: Record<GameType, { label: string }> = {
  chess: { label: 'Chess' },
  checkers: { label: 'Checkers' },
  reversi: { label: 'Reversi' },
  go: { label: 'Go' },
};

// Imported rather than declared: this list and the review route's own gate used
// to be two copies of the same fact. See `analysis/reviewable.ts`.


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

function StatTile({ label, value, valueColor }: { label: string; value: string | number; valueColor?: string }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        borderRadius: RADIUS['2xl'],
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
      }}
    >
      <Text style={{ color: valueColor ?? COLORS.fg, fontSize: FONT_SIZES.display, fontFamily: FONTS.display }}>{value}</Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 2, fontFamily: FONTS.body }}>{label}</Text>
    </View>
  );
}

/** A last change: ▲/▼ and its size, or nothing when there was none. */
function DeltaMark({ delta, size }: { delta: number | null; size: number }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  if (delta === null || delta === 0) return null;
  return (
    <Text
      style={{
        color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
        fontSize: size,
        fontFamily: FONTS.bodyBold,
      }}
    >
      {delta > 0 ? '▲' : '▼'} {Math.abs(delta)}
    </Text>
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
      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES['2xl'], fontFamily: FONTS.display }}>You</Text>
      <Pressable
        onPress={onSettings}
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={10}
        style={{
          width: 38,
          height: 38,
          borderRadius: RADIUS.full,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceMuted,
        }}
      >
        <Icon name="gear" size={FONT_SIZES.lg} color={COLORS.fgMuted} />
      </Pressable>
    </View>
  );
}

/**
 * The "You" tab. Guests get an inline sign-in prompt (a tab must not redirect
 * away on focus); signed-in users get the profile: identity, summary stats,
 * each game's practice level and online rating, recent games. Data refreshes on
 * tab focus so a just-played game shows up without an app restart.
 */
export default function YouScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Pick<Profile, 'id' | 'username' | 'created_at'> | null>(null);
  const [games, setGames] = useState<GameListItem[]>([]);
  // Two numbers per game: the Practice level (bots, rated practice) and the
  // online Rating. See RATING_COPY for why they are kept apart.
  const [practice, setPractice] = useState<Record<GameType, UserRating> | null>(null);
  const [online, setOnline] = useState<Record<GameType, UserRating> | null>(null);
  // The last load failed. Only shown when there is nothing loaded to fall back
  // on — the readers reject now, and a first load that failed used to leave
  // the tab on its spinner for good.
  const [loadError, setLoadError] = useState(false);
  // Bumped by *Try again* to re-run the focus load without a refocus.
  const [attempt, setAttempt] = useState(0);
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
        // One query per ladder for every rated game type, not a round-trip each.
        getPracticeRatings(userId, [...RATED_GAME_TYPES]),
        getUserRatings(userId, [...RATED_GAME_TYPES]),
      ])
        .then(([profileData, gamesData, practiceRows, onlineRows]) => {
          if (!active) return;
          setProfile(profileData);
          setGames(gamesData);
          setPractice(practiceRows);
          setOnline(onlineRows);
          setLoadError(false);
        })
        .catch(() => {
          // Keep whatever data is showing; a retry happens on next focus.
          if (active) setLoadError(true);
        });
      return () => {
        active = false;
      };
      // `attempt` is read by nobody: it is here so *Try again* re-runs the load.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, attempt]),
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setGames([]);
    setPractice(null);
    setOnline(null);
    setLoadError(false);
    router.replace('/' as never);
  }, [router]);

  const goSettings = () => router.push('/settings' as never);

  // Guest state — invite to sign in, keep settings reachable.
  if (!authLoading && !user) {
    return (
      <Screen inTabs scroll={false}>
        <YouHeader onSettings={goSettings} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING[3], paddingBottom: 60 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: RADIUS['3xl'],
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.surfaceAlt,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Icon name="user" size={FONT_SIZES['3xl']} color={COLORS.fgMuted} />
          </View>
          <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES['2xl'], fontFamily: FONTS.display }}>
            Playing as guest
          </Text>
          <Text
            style={{
              color: COLORS.fgMuted,
              fontSize: FONT_SIZES.body,
              fontFamily: FONTS.body,
              textAlign: 'center',
              lineHeight: 22,
              maxWidth: 300,
              marginBottom: 8,
            }}
          >
            Sign in to save your games, climb the ratings, and carry your streaks across devices.
          </Text>
          <View style={{ alignSelf: 'stretch', gap: SPACING['2.5'] }}>
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

  if (!authLoading && loadError && (!profile || !practice || !online)) {
    return (
      <Screen inTabs scroll={false}>
        <YouHeader onSettings={goSettings} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 }}>
          <Pressable
            onPress={() => {
              setLoadError(false);
              setAttempt((n) => n + 1);
            }}
            accessibilityRole="button"
            hitSlop={8}
            style={{ paddingVertical: 6 }}
          >
            <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.body, fontFamily: FONTS.body, textAlign: 'center' }}>
              Couldn&apos;t load your profile.{' '}
              <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodySemi }}>Try again</Text>
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (authLoading || !profile || !practice || !online) {
    return (
      <Screen inTabs scroll={false}>
        <YouHeader onSettings={goSettings} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      </Screen>
    );
  }

  // One implementation of these numbers for Profile, web's Profile and the
  // launcher — see `playerStats.ts`.
  const { winRate, currentStreak, bestStreak, topPracticeLevel, perGame } = summarizePlayer(games, practice, online);

  const filtered = tab === 'all' ? games : games.filter((g) => (g.game_type ?? 'chess') === tab);
  const recent = filtered.slice(0, 10);

  return (
    <Screen inTabs>
      <YouHeader onSettings={goSettings} />

      {/* Identity */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[4], marginBottom: 24 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: RADIUS['3xl'],
            backgroundColor: COLORS.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORS.onAccent, fontSize: FONT_SIZES['4xl'], fontFamily: FONTS.display }}>
            {profile.username[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES['2xl'], fontFamily: FONTS.display }}>{profile.username}</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 2, fontFamily: FONTS.body }}>
            Member since {formatDate(profile.created_at)}
            {currentStreak >= 2 ? ` · ${currentStreak}-game streak` : ''}
          </Text>
        </View>
      </View>

      {/* Summary stats */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING[3], marginBottom: 20 }}>
        <StatTile label="Games played" value={games.length} />
        <StatTile label="Win rate" value={`${winRate}%`} valueColor={COLORS.successHover} />
        <StatTile label="Best streak" value={bestStreak} />
        <StatTile
          label="Top practice level"
          value={topPracticeLevel > 0 ? topPracticeLevel : '—'}
          valueColor={COLORS.accentHover}
        />
      </View>

      {/* Per-game numbers. The Practice level leads: it is the number bot and
          practice games move, which is most players' only one. The online
          Rating sits under it, one line, for the games that have online play. */}
      <View style={{ gap: SPACING[3], marginBottom: 20 }}>
        {RATED_GAME_TYPES.map((type) => {
          const meta = GAME_META[type];
          const row = practice[type];
          const delta = perGame[type].practice.lastDelta;
          const played = row.games_played > 0;
          const hasOnline = GAME_CATALOG[type].modes.includes('online');
          const onlineRow = online[type];
          const onlineDelta = perGame[type].online.lastDelta;
          return (
            <Card key={type} style={{ padding: 16, borderLeftColor: GAME_ACCENTS[type].base, borderLeftWidth: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING['2.5'], marginBottom: 8 }}>
                <GamePieceIcon game={type} size={26} />
                <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.base, fontFamily: FONTS.displaySemi }}>{meta.label}</Text>
              </View>
              <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, fontFamily: FONTS.body }}>
                {RATING_COPY.practice.label}
              </Text>
              {played ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: SPACING[2] }}>
                    <Text style={{ color: GAME_ACCENTS[type].base, fontSize: FONT_SIZES.display, fontFamily: FONTS.display }}>{row.rating}</Text>
                    <DeltaMark delta={delta} size={FONT_SIZES.sm} />
                  </View>
                  <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 4, fontFamily: FONTS.body }}>
                    {row.games_played} game{row.games_played !== 1 ? 's' : ''} · {row.wins}W / {row.losses}L / {row.draws}D
                  </Text>
                  <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.xs, marginTop: 2, fontFamily: FONTS.body }}>
                    Peak {row.peak_rating}
                    {row.games_played < 30 ? ` · Provisional (${30 - row.games_played} left)` : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: GAME_ACCENTS[type].base, fontSize: FONT_SIZES.display, fontFamily: FONTS.display, opacity: 0.5 }}>—</Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 4, fontFamily: FONTS.body }}>No practice games yet</Text>
                </>
              )}
              {hasOnline && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: SPACING['1.5'],
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: COLORS.border,
                  }}
                >
                  <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, fontFamily: FONTS.body }}>
                    {RATING_COPY.online.label}
                  </Text>
                  {onlineRow.games_played > 0 ? (
                    <>
                      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodyBold }}>{onlineRow.rating}</Text>
                      <DeltaMark delta={onlineDelta} size={FONT_SIZES.xs} />
                      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, fontFamily: FONTS.body }}>
                        · {onlineRow.games_played} game{onlineRow.games_played !== 1 ? 's' : ''}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodyBold }}>—</Text>
                      <Pressable
                        onPress={() => router.push({ pathname: '/play/[game]', params: { game: type, online: '1' } } as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`Play ${meta.label} online`}
                        hitSlop={8}
                      >
                        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodySemi }}>Play online</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              )}
            </Card>
          );
        })}
      </View>

      {/* Recent games */}
      <Card style={{ padding: 16, marginBottom: 20 }}>
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.base, fontFamily: FONTS.displaySemi, marginBottom: 8 }}>Recent games</Text>

        <View style={{ flexDirection: 'row', gap: SPACING['1.5'], marginBottom: 4, flexWrap: 'wrap' }}>
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
                  borderRadius: RADIUS.full,
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
                    fontSize: FONT_SIZES.xs,
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
            <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, fontFamily: FONTS.body }}>
              {tab === 'all' ? 'No games played yet' : `No ${GAME_META[tab].label.toLowerCase()} games yet`}
            </Text>
            <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.label, fontFamily: FONTS.body, marginTop: 2 }}>
              Finish a bot or online game while signed in and it lands here.
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
                  gap: SPACING[3],
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: COLORS.border,
                }}
              >
                <View
                  style={{
                    width: 52,
                    borderRadius: RADIUS.lg,
                    paddingVertical: 4,
                    alignItems: 'center',
                    backgroundColor: COLORS.surfaceMuted,
                  }}
                >
                  <Text style={{ color, fontSize: FONT_SIZES.caption, fontFamily: FONTS.bodyBold, textTransform: 'uppercase' }}>{label}</Text>
                </View>
                <GamePieceIcon game={type} size={22} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodySemi }} numberOfLines={1}>
                    vs {game.opponent}
                  </Text>
                  <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, fontFamily: FONTS.body }} numberOfLines={1}>
                    {meta.label}
                    {game.difficulty ? ` · ${game.difficulty}` : ''} · as {game.player_color === 'white' ? 'White' : 'Black'}
                    {endReasonLabel(game.end_reason) ? ` · ${endReasonLabel(game.end_reason)}` : ''}
                  </Text>
                </View>
                {delta !== null && delta !== 0 && (
                  <Text
                    style={{
                      color: delta > 0 ? COLORS.successHover : COLORS.dangerHover,
                      fontSize: FONT_SIZES.label,
                      fontFamily: FONTS.bodyBold,
                    }}
                  >
                    {delta > 0 ? '+' : '−'}{Math.abs(delta)}
                  </Text>
                )}
                <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.caption, fontFamily: FONTS.body }}>{relativeTime(game.created_at)}</Text>
              </Pressable>
            );
          })
        )}
      </Card>

      {/* Renders nothing unless there is a block to manage. */}
      <BlockedPlayers />

      <Pressable onPress={signOut} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodySemi }}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}
