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
import { COLORS, GAME_ACCENTS, GLOWS_NATIVE, GRADIENTS_NATIVE } from '@gameexplorer/ui';

import { GlowBackdrop } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { getLastPlayed } from '@/lib/lastPlayed';
import { hasOnboarded } from '@/lib/onboarding';
import { FONTS } from '@/theme/typography';

const GAMES = [
  {
    key: 'chess',
    label: 'Chess',
    tagline: 'Outplay the bot at every level.',
    accent: GAME_ACCENTS.chess,
  },
  {
    key: 'checkers',
    label: 'Checkers',
    tagline: 'Fast, punchy, endlessly re-matchable.',
    accent: GAME_ACCENTS.checkers,
  },
  {
    key: 'reversi',
    label: 'Reversi',
    tagline: 'Swing the whole board in one move.',
    accent: GAME_ACCENTS.reversi,
  },
] as const;

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
            Chess, checkers &amp; reversi with a pulse — sharp bots, pass-and-play, instant
            rematches. No sign-up to start.
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
            {GAMES.map((g) => (
              <Pressable
                key={g.key}
                onPress={() =>
                  router.push({ pathname: '/play/[game]', params: { game: g.key } } as never)
                }
                accessibilityRole="button"
                accessibilityLabel={`Play ${g.label}`}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <LinearGradient
                  colors={[g.accent.tintBg, g.accent.tintBgSoft]}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 15,
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: g.accent.tintBorder,
                    // The design's per-card bloom — tighter than GLOWS_NATIVE's
                    // shared halo, so it stays inline rather than tokenized.
                    boxShadow: `0 0 34px -16px ${g.accent.glow}`,
                  }}
                >
                  <View
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: g.accent.tintBg,
                      borderWidth: 1,
                      borderColor: g.accent.tintBorder,
                      boxShadow: `0 0 22px -6px ${g.accent.glow}`,
                    }}
                  >
                    <GamePieceIcon game={g.key} size={34} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONTS.display, fontSize: 19, color: COLORS.fg }}>
                      {g.label}
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
                      {g.tagline}
                    </Text>
                  </View>
                  <Text style={{ color: g.accent.light, fontSize: 24, fontFamily: FONTS.bodyBold }}>
                    ›
                  </Text>
                </LinearGradient>
              </Pressable>
            ))}
          </View>

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
