import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@gameexplorer/client';
import { COLORS, useThemeName, FONT_SIZES, SPACING } from '@gameexplorer/ui';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { consumeSaveProgressPending, isSaveProgressPending } from '@/lib/onboarding';
import { FONTS } from '@/theme/typography';

/**
 * The onboarding flow's soft sign-up ask — the native twin of web's
 * `SaveProgressPrompt`.
 *
 * After a guest finishes the first game they started from the welcome tour,
 * offer to save their progress, exactly once. Renders nothing for signed-in
 * users or when the pending flag isn't set, and any choice (including "maybe
 * later") consumes the flag so the ask never nags.
 */
export function SaveProgressPrompt({ open }: { open: boolean }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user, loading } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Snapshot the flag when the result screen opens — AsyncStorage isn't reactive.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    isSaveProgressPending().then((value) => {
      if (!cancelled) setPending(value);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open || !pending || loading || user) return null;

  const dismiss = () => {
    void consumeSaveProgressPending();
    setPending(false);
  };

  return (
    <View
      style={{
        marginTop: 20,
        paddingTop: 18,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        alignSelf: 'stretch',
        gap: SPACING[3],
      }}
    >
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, lineHeight: 20, textAlign: 'center' }}>
        Create a free account to save your practice level, track your match history, and pick up right
        where you left off.
      </Text>

      <OAuthButtons
        onSuccess={({ needsUsername }) => {
          void consumeSaveProgressPending();
          setPending(false);
          // No `next`: choose-username goes back to this result screen once
          // the name is confirmed.
          if (needsUsername) router.push('/(auth)/choose-username' as never);
        }}
        onError={setError}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void consumeSaveProgressPending();
          setPending(false);
          router.push('/(auth)/sign-up' as never);
        }}
        style={{ alignItems: 'center', paddingVertical: 10 }}
      >
        <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>Sign up with email</Text>
      </Pressable>

      {error && (
        <Text style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.label, textAlign: 'center' }}>{error}</Text>
      )}

      <Pressable accessibilityRole="button" onPress={dismiss} style={{ alignItems: 'center', paddingVertical: 6 }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label }}>
          Maybe later — <Text style={{ fontFamily: FONTS.bodyBold }}>keep playing as guest</Text>
        </Text>
      </Pressable>
    </View>
  );
}
