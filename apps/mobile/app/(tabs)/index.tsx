import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
  TSpan,
} from 'react-native-svg';
import { useAuth } from '@gameexplorer/client';
import { COLORS, GAME_ACCENTS, GLOWS_NATIVE, GRADIENTS_NATIVE, useThemeName } from '@gameexplorer/ui';

import { GlowBackdrop } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { getLastPlayed } from '@/lib/lastPlayed';
import { hasOnboarded } from '@/lib/onboarding';
import { GAME_LIST } from '@gameexplorer/shared';
import { FONTS } from '@/theme/typography';

// The catalog is pure data, so reading it at module scope is safe — unlike a
// token: storing `accent: GAME_ACCENTS.chess` here would freeze the accent at
// import time, because the token objects are live views that have to be read
// during render. `hook` is the catalog's phone-sized register (web's home cards
// use the longer `blurb`), so the copy stays one source of truth without either
// surface having to wear the other's voice.

const FEATURES = [
  { icon: '⚡', label: 'Instant play' },
  { icon: '🤝', label: 'Play a friend' },
  { icon: '📈', label: 'Climb ranks' },
] as const;

/**
 * Home — the app's landing screen ("Deck" direction from the mobile design).
 * Guest-browsable. App bar: wordmark + auth control; hero + gold CTA; stacked
 * accent-glow game cards; feature tiles. First-run visitors are sent to the
 * welcome tour once (mirrors web's onboarding redirect).
 */
export default function HomeScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading } = useAuth();
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);

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

  const openPlay = () => {
    getLastPlayed().then((game) => {
      router.push({ pathname: '/play/[game]', params: { game } } as never);
    });
  };

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

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
        <Text style={{ fontFamily: FONTS.display, fontSize: 20, color: COLORS.fg }}>
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
                borderRadius: 17,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.onAccent, fontSize: 14 }}>
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
              borderRadius: 17,
              paddingHorizontal: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: COLORS.surfaceMuted,
              borderWidth: 1,
              borderColor: COLORS.border,
            }}
          >
            <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.fg, fontSize: 13 }}>
              Sign in
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <GlowBackdrop
          blooms={[
            { cx: '25%', cy: '0%', rx: '90%', ry: '30%', color: GAME_ACCENTS.chess.base, opacity: 0.14 },
            { cx: '100%', cy: '6%', rx: '75%', ry: '26%', color: GAME_ACCENTS.checkers.base, opacity: 0.1 },
          ]}
        />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 22,
            paddingBottom: 26,
            // Tablet: keep the landing column phone-width and centered.
            width: '100%',
            maxWidth: 560,
            alignSelf: 'center',
          }}
        >
          {/* Hero — "Game on." with the brand blue→pink gradient on "on." */}
          <Svg width="100%" height={58} accessible accessibilityLabel="Game on.">
            <Defs>
              <SvgLinearGradient id="heroBrand" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={GAME_ACCENTS.chess.base} />
                <Stop offset="1" stopColor={GAME_ACCENTS.checkers.base} />
              </SvgLinearGradient>
            </Defs>
            <SvgText x="0" y="46" fontSize="52" fontFamily={FONTS.display} fill={COLORS.fg}>
              Game <TSpan fill="url(#heroBrand)">on.</TSpan>
            </SvgText>
          </Svg>
          <Text
            style={{
              fontFamily: FONTS.body,
              fontSize: 15,
              lineHeight: 23,
              color: COLORS.fgMuted,
              marginTop: 12,
              marginBottom: 22,
            }}
          >
            Chess, checkers, reversi &amp; Liquidate with a pulse — sharp bots, pass-and-play,
            instant rematches. No sign-up to start.
          </Text>

          {/* Primary CTA */}
          <Pressable
            onPress={openPlay}
            accessibilityRole="button"
            accessibilityLabel="Play now"
            style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
          >
            <LinearGradient
              {...GRADIENTS_NATIVE.accent}
              style={{
                borderRadius: 16,
                paddingVertical: 16,
                alignItems: 'center',
                boxShadow: GLOWS_NATIVE.glowAccent,
              }}
            >
              <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 17, color: COLORS.onAccent }}>
                Play now →
              </Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={() => router.push('/welcome' as never)}
            accessibilityRole="button"
            style={{ alignItems: 'center', paddingVertical: 12, marginBottom: 16 }}
          >
            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 14, color: COLORS.fgMuted }}>
              Take a quick tour
            </Text>
          </Pressable>

          {/* Game cards */}
          <Text
            style={{
              fontFamily: FONTS.displaySemi,
              fontSize: 13,
              letterSpacing: 0.8,
              color: COLORS.fgSubtle,
              marginBottom: 14,
            }}
          >
            CHOOSE YOUR GAME
          </Text>
          <View style={{ gap: 12 }}>
            {GAME_LIST.map((g) => (
              <Pressable
                key={g.id}
                onPress={() =>
                  router.push({ pathname: '/play/[game]', params: { game: g.id } } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`Play ${g.name}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <LinearGradient
                  colors={[GAME_ACCENTS[g.id].tintBg, GAME_ACCENTS[g.id].tintBgSoft]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 15,
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: GAME_ACCENTS[g.id].tintBorder,
                    // The design's per-card bloom — tighter than GLOWS_NATIVE's
                    // shared halo, so it stays inline rather than tokenized.
                    boxShadow: `0 0 34px -16px ${GAME_ACCENTS[g.id].glow}`,
                  }}
                >
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: GAME_ACCENTS[g.id].tintBg,
                      borderWidth: 1,
                      borderColor: GAME_ACCENTS[g.id].tintBorder,
                      boxShadow: `0 0 22px -6px ${GAME_ACCENTS[g.id].glow}`,
                    }}
                  >
                    <GamePieceIcon game={g.id} size={34} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONTS.display, fontSize: 19, color: COLORS.fg }}>
                      {g.name}
                    </Text>
                    <Text
                      style={{
                        fontFamily: FONTS.body,
                        fontSize: 13,
                        lineHeight: 18,
                        color: COLORS.fgMuted,
                        marginTop: 2,
                      }}
                    >
                      {g.hook}
                    </Text>
                  </View>
                  <Text style={{ color: GAME_ACCENTS[g.id].light, fontSize: 24, fontFamily: FONTS.bodyBold }}>
                    ›
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>

          {/* Watch live games — the only way into the spectate lobby, which
              otherwise has no entry point outside a shared link. */}
          <Pressable
            onPress={() => router.push('/spectate' as never)}
            accessibilityRole="button"
            accessibilityLabel="Watch live games"
            accessibilityHint="Browse games other people are playing right now"
            style={{ marginTop: 22 }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  minHeight: 56,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                  backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
                }}
              >
                <Text style={{ fontSize: 20 }}>👁</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 15, color: COLORS.fg }}>
                    Watch live games
                  </Text>
                  <Text style={{ fontFamily: FONTS.body, fontSize: 12, color: COLORS.fgMuted }}>
                    See what other players are up to
                  </Text>
                </View>
                <Text style={{ color: COLORS.fgMuted, fontSize: 20 }}>›</Text>
              </View>
            )}
          </Pressable>

          {/* Feature tiles */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 22 }}>
            {FEATURES.map((f) => (
              <View
                key={f.label}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 8,
                  borderRadius: 14,
                  backgroundColor: COLORS.surfaceAlt,
                  borderWidth: 1,
                  borderColor: COLORS.border,
                }}
              >
                <Text style={{ fontSize: 20, marginBottom: 6 }}>{f.icon}</Text>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: COLORS.fg }}>
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
