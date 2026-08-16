import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Button } from '@/components/ui';
import { FONTS } from '@/theme/typography';

export interface OnlineSetupCardProps {
  signedIn: boolean;
  /** Device connectivity, from `useIsOnline`. */
  connected: boolean;
}

/**
 * What the Online tile explains before a game can start.
 *
 * Online is the one mode with hard prerequisites — an account (the server
 * matches on a real rating and writes results to it) and a connection. Saying so
 * up front, in the same "here is what this mode needs" shape `TrainingSetup`
 * uses, beats letting the player press Start into a dead matchmaking screen.
 */
export function OnlineSetupCard({ signedIn, connected }: OnlineSetupCardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const blocked = !signedIn || !connected;

  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: blocked ? COLORS.warning : COLORS.border,
        backgroundColor: blocked ? COLORS.surfaceMuted : COLORS.surfaceAlt,
        padding: 20,
        marginBottom: 24,
        gap: 10,
      }}
    >
      {!signedIn ? (
        <>
          <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.bodyBold, fontSize: 15 }}>
            Sign in to play online
          </Text>
          <Text
            style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}
          >
            Online games are matched on your rating and saved to your history, so
            they need an account.
          </Text>
          <Button
            label="Sign in"
            variant="secondary"
            onPress={() => router.push('/(auth)/sign-in' as never)}
          />
        </>
      ) : !connected ? (
        <>
          <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.bodyBold, fontSize: 15 }}>
            You&apos;re offline
          </Text>
          <Text
            style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}
          >
            Online play needs a connection. Bot games and pass-and-play still
            work without one.
          </Text>
        </>
      ) : (
        <>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>
            Play a real opponent
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}>
            Get matched by rating, or send a friend a link. The clock runs on the
            server, so both players see the same time.
          </Text>
        </>
      )}
    </View>
  );
}
