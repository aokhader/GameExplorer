import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import { COLORS, GAME_ACCENTS } from '@gameexplorer/ui';
import { Screen } from '@/components/ui';
import { hasOnboarded } from '@/lib/onboarding';

const GAMES = [
  { key: 'chess', label: 'Chess', icon: '♞', accent: GAME_ACCENTS.chess.base, tagline: 'Timeless strategy' },
  { key: 'checkers', label: 'Checkers', icon: '⛃', accent: GAME_ACCENTS.checkers.base, tagline: 'Easy to learn' },
  { key: 'reversi', label: 'Reversi', icon: '⚫', accent: GAME_ACCENTS.reversi.base, tagline: 'Quick to master' },
] as const;

/**
 * Home hub — the app's landing screen. Guest-browsable (no auth gate). The header
 * routes to profile (signed in) or sign-in (guest) plus settings; each game card
 * navigates to its play screen. First-run visitors are sent to the welcome tour
 * once (mirrors web's onboarding redirect).
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

  const initial = user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <Screen>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
          marginBottom: 4,
        }}
      >
        <View>
          <Text style={{ color: COLORS.fg, fontSize: 30, fontWeight: '800' }}>GameExplorer</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 15, marginTop: 2 }}>
            Pick a game to play
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => router.push('/settings' as never)}
            accessibilityLabel="Settings"
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.surfaceMuted,
            }}
          >
            <Text style={{ fontSize: 18 }}>⚙️</Text>
          </Pressable>

          {/* Hold the auth control until the session restore resolves, so a
              signed-in user never flashes the "Sign in" pill on cold start. */}
          {loading ? null : user ? (
            <Pressable
              onPress={() => router.push('/profile' as never)}
              accessibilityLabel="Profile"
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.accent,
              }}
            >
              <Text style={{ color: COLORS.onAccent, fontSize: 17, fontWeight: '800' }}>
                {initial}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.push('/(auth)/sign-in' as never)}
              style={{
                height: 40,
                borderRadius: 20,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.surfaceMuted,
                borderWidth: 1,
                borderColor: COLORS.border,
              }}
            >
              <Text style={{ color: COLORS.fg, fontSize: 14, fontWeight: '700' }}>Sign in</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Game cards */}
      <View style={{ marginTop: 28, gap: 16 }}>
        {GAMES.map((g) => (
          <Pressable
            key={g.key}
            onPress={() => router.push({ pathname: '/play/[game]', params: { game: g.key } } as never)}
            style={({ pressed }) => ({
              backgroundColor: COLORS.surfaceAlt,
              borderColor: COLORS.border,
              borderWidth: 1,
              borderLeftColor: g.accent,
              borderLeftWidth: 4,
              borderRadius: 16,
              paddingHorizontal: 20,
              paddingVertical: 22,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 16,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: 30 }}>{g.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.fg, fontSize: 20, fontWeight: '700' }}>{g.label}</Text>
              <Text style={{ color: COLORS.fgSubtle, fontSize: 13, marginTop: 2 }}>
                {g.tagline} · vs bot · Pass &amp; play
              </Text>
            </View>
            <Text style={{ color: COLORS.fgSubtle, fontSize: 22 }}>›</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
