import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@gameexplorer/client';
import { GAME_CATALOG, type GameId } from '@gameexplorer/shared';
import { settleUnfinishedGame } from '@gameexplorer/client/game/settleUnfinishedGame';
import { unfinishedGameSummary } from '@gameexplorer/client/game/unfinishedGame';
import { COLORS, GRADIENTS_NATIVE, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';

import { hasOnboarded } from '@/lib/onboarding';
import { nativeLocalStore } from '@/lib/localStore';
import { continueRoute, type ContinueItem } from '@/lib/continueGame';
import { nativeLiquidateStore } from '@/liquidate/useLiquidateGame';
import { ContinueCard } from '@/game/ContinueCard';
import { useLauncher } from '@/home/useLauncher';
import {
  AlsoUnfinishedRow,
  FirstGameCard,
  GamesRow,
  LinkRow,
  LiquidateContinueCard,
  NumbersRow,
  PlayAgainCard,
  SectionLabel,
} from '@/home/LauncherParts';
import { Skeleton } from '@/components/ui';
import { FONTS } from '@/theme/typography';

/**
 * Home — the returning launcher (`project-docs/ux-fix-ideas.md` §4.3, §4.5).
 *
 * It used to spend its first screen on a "Game on." hero, a sentence of claims
 * and three feature chips, then five neon game cards — the same page on the
 * fiftieth visit as on the first. Now it leads with what this player can do
 * next, in this order:
 *
 * 1. **Continue** the game they were in the middle of, or **play again** with the
 *    setup they chose last time. A first visit gets *Start a game*.
 * 2. **Their numbers**: each rating with its last change, a win streak, puzzles
 *    solved.
 * 3. **Their games**, the most recently played first.
 * 4. **Something new**: one game they have not played for a month, with a first
 *    step into it.
 * 5. Watching and learning, as plain rows.
 *
 * Guest-browsable. First-run visitors are still sent to the welcome tour once;
 * replacing the tour is later work (§4.4).
 */
export default function HomeScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading } = useAuth();
  const userId = user?.id ?? null;
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const { local, stats, reload, tryNew } = useLauncher(userId, !loading);
  const [settling, setSettling] = useState(false);

  // One-time first-run redirect into the tour. Runs after auth resolves so a
  // returning signed-in user (who has clearly onboarded) is never bounced.
  useEffect(() => {
    if (loading || checkedOnboarding) return;
    let active = true;
    hasOnboarded().then((seen) => {
      if (!active) return;
      setCheckedOnboarding(true);
      if (!seen && !user) router.replace('/welcome' as never);
    });
    return () => {
      active = false;
    };
  }, [loading, user, checkedOnboarding, router]);

  const openGame = (game: GameId) => router.push({ pathname: '/play/[game]', params: { game } } as never);
  const openContinue = (item: ContinueItem) => router.push(continueRoute(item) as never);

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';
  const [primary, ...others] = local?.continueItems ?? [];

  let top: React.ReactNode;
  if (!local) {
    top = <Skeleton height={132} radius="2xl" />;
  } else if (primary?.kind === 'board') {
    top = (
      <ContinueCard
        saved={primary.saved}
        showGame
        onResume={() => openContinue(primary)}
        settling={settling}
        onSettle={async (options) => {
          setSettling(true);
          try {
            return await settleUnfinishedGame(nativeLocalStore, primary.saved, options);
          } finally {
            setSettling(false);
            reload();
          }
        }}
      />
    );
  } else if (primary?.kind === 'liquidate') {
    top = (
      <LiquidateContinueCard
        save={primary.save}
        onResume={() => openContinue(primary)}
        onDiscard={() => {
          nativeLiquidateStore.clear(primary.slot);
          reload();
        }}
      />
    );
  } else if (local.playAgain) {
    const { game, summary, quick } = local.playAgain;
    top = (
      <PlayAgainCard
        game={game}
        summary={summary}
        onPlay={() =>
          quick
            ? router.push({ pathname: '/play/[game]', params: { game, start: 'last' } } as never)
            : openGame(game)
        }
        onChange={quick ? () => openGame(game) : undefined}
      />
    );
  } else {
    top = <FirstGameCard onStart={() => openGame('chess')} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }} edges={['top']}>
      {/* App bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.border,
        }}
      >
        <Text style={{ fontFamily: FONTS.display, fontSize: FONT_SIZES.xl, color: COLORS.fg }}>
          Game
          <Text style={{ color: COLORS.accent }}>Explorer</Text>
        </Text>

        {loading ? null : user ? (
          <Pressable
            onPress={() => router.push('/profile' as never)}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
            hitSlop={8}
          >
            <LinearGradient
              {...GRADIENTS_NATIVE.accent}
              style={{
                width: 34,
                height: 34,
                borderRadius: RADIUS.full,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.onAccent, fontSize: FONT_SIZES.sm }}>
                {initial}
              </Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => router.push('/(auth)/sign-in' as never)}
            accessibilityRole="button"
            style={{
              height: 34,
              borderRadius: RADIUS.full,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.surfaceMuted,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.fg, fontSize: FONT_SIZES.label }}>
              Sign in
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 26,
          gap: SPACING[6],
          // Tablet: keep the launcher column phone-width and centered.
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        <View style={{ gap: SPACING[2] }}>
          {top}
          {others.map((item) =>
            item.kind === 'board' ? (
              <AlsoUnfinishedRow
                key={item.saved.game}
                game={item.saved.game}
                detail={unfinishedGameSummary(item.saved)}
                onPress={() => openContinue(item)}
              />
            ) : (
              <AlsoUnfinishedRow
                key={`liquidate-${item.slot}`}
                game="liquidate"
                detail={`${item.save.state.players.length} players · round ${item.save.state.round}`}
                onPress={() => openContinue(item)}
              />
            ),
          )}
        </View>

        {local && (
          <NumbersRow
            signedIn={!!userId}
            stats={stats.stats}
            loading={stats.loading}
            error={stats.error}
            onRetry={stats.refresh}
            puzzlesSolved={local.puzzlesSolved}
            finishedGame={local.finishedGame}
            onSignIn={() => router.push('/(auth)/sign-in' as never)}
          />
        )}

        <View style={{ gap: SPACING[3] }}>
          <SectionLabel>YOUR GAMES</SectionLabel>
          <GamesRow games={local?.games ?? []} onOpen={openGame} />
        </View>

        {tryNew && (
          <View style={{ gap: SPACING[3] }}>
            <SectionLabel>TRY SOMETHING NEW</SectionLabel>
            <LinkRow
              game={tryNew.game}
              title={
                tryNew.fresh
                  ? `New to ${GAME_CATALOG[tryNew.game].name}?`
                  : `Back to ${GAME_CATALOG[tryNew.game].name}?`
              }
              detail={tryNew.action}
              onPress={() => router.push(tryNew.route as never)}
            />
          </View>
        )}

        <View style={{ gap: SPACING[3] }}>
          {/* The only way into the spectate lobby outside a shared link. */}
          <LinkRow
            icon="eye"
            title="Watch live games"
            detail="See what other players are up to"
            onPress={() => router.push('/spectate' as never)}
          />
          <LinkRow
            icon="graduation-cap"
            title="Learn a game"
            detail={`Rules and lessons for ${GAME_CATALOG[local?.games[0] ?? 'chess'].name}`}
            onPress={() => router.push(`/learn/${local?.games[0] ?? 'chess'}` as never)}
          />
          <Pressable
            onPress={() => router.push('/welcome' as never)}
            accessibilityRole="button"
            style={{ alignItems: 'center', paddingVertical: 12 }}
          >
            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.sm, color: COLORS.fgMuted }}>
              Take a quick tour
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
