import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { UserRating } from '@finesse/db';
import { COLORS, GAME_ACCENTS, useThemeName } from '@finesse/ui';
import { Button } from '@/components/ui';
import { eloLabel, type EloLabelGame } from '@/game/eloLabel';
import { HINT_PENALTY } from '@/engine/trainingRules';
import { FONTS } from '@/theme/typography';

/** Games below this count use the higher provisional K-factor (see shared/elo). */
const PROVISIONAL_GAMES = 30;

export interface TrainingSetupProps {
  game: EloLabelGame;
  /** The player's rating row, or null while loading / signed out. */
  rating: UserRating | null;
  loading: boolean;
  /** Strength the bot will actually play at — already clamped by the loop. */
  botElo: number;
  /** Signed in? Training writes a rating, so an account is required. */
  signedIn: boolean;
  online: boolean;
}

/**
 * The training setup panel — the native mirror of web's `/{game}/training` setup
 * screen: your rating, the bot matched to it, and what hints cost. Guests and
 * offline players get the reason they can't start instead of the rating card
 * (training always writes a rating, so it needs both an account and a
 * connection). Rendered between the mode picker and the color picker.
 */
export function TrainingSetup({
  game,
  rating,
  loading,
  botElo,
  signedIn,
  online,
}: TrainingSetupProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const accent = GAME_ACCENTS[game];

  if (!signedIn) {
    return (
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 20,
          marginBottom: 24,
          gap: 12,
        }}
      >
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 17 }}>
          Training needs an account
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
          Every training game is rated, so your rating has to live somewhere. Sign in and the bot
          will match your level from your very first game.
        </Text>
        <Button
          label="Sign in"
          onPress={() => router.push('/(auth)/sign-in' as never)}
        />
      </View>
    );
  }

  if (!online) {
    return (
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 20,
          marginBottom: 24,
          gap: 8,
        }}
      >
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 17 }}>
          Training needs a connection
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}>
          Rated games read and write your rating. Play a casual bot game or pass-and-play while
          you&apos;re offline — both work without a connection.
        </Text>
      </View>
    );
  }

  const current = rating?.rating ?? 1200;
  const played = rating?.games_played ?? 0;
  const remaining = PROVISIONAL_GAMES - played;

  return (
    <>
      {/* Rating card */}
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 20,
          marginBottom: 14,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: COLORS.fgMuted,
            fontFamily: FONTS.displaySemi,
            fontSize: 12,
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          YOUR RATING
        </Text>
        {loading ? (
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 15, paddingVertical: 12 }}>
            Loading…
          </Text>
        ) : (
          <>
            <Text
              accessibilityLabel={`Your rating is ${current}, ${eloLabel(game, current)}`}
              style={{ color: COLORS.fg, fontFamily: FONTS.display, fontSize: 54, lineHeight: 60 }}
            >
              {current}
            </Text>
            <Text style={{ color: accent.light, fontFamily: FONTS.bodyBold, fontSize: 16, marginTop: 2 }}>
              {eloLabel(game, current)}
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
                {played} games
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
                {rating?.wins ?? 0}W / {rating?.losses ?? 0}L / {rating?.draws ?? 0}D
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
                Peak {rating?.peak_rating ?? 1200}
              </Text>
            </View>
            {remaining > 0 && (
              <Text
                style={{
                  color: COLORS.warningHover,
                  fontFamily: FONTS.body,
                  fontSize: 12,
                  textAlign: 'center',
                  marginTop: 10,
                  lineHeight: 17,
                }}
              >
                Provisional — your rating moves faster for {remaining} more{' '}
                {remaining === 1 ? 'game' : 'games'}.
              </Text>
            )}
          </>
        )}
      </View>

      {/* Matched bot */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>
            Bot strength
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 12, marginTop: 2 }}>
            Matched to your rating automatically
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold, fontSize: 20 }}>
            {loading ? '—' : botElo}
          </Text>
          <Text style={{ color: accent.light, fontFamily: FONTS.body, fontSize: 12 }}>
            {loading ? '' : eloLabel(game, botElo)}
          </Text>
        </View>
      </View>

      {/* What hints cost */}
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          // There's no warning-tint token (only danger has one), so the callout
          // is a normal muted surface with a warning border + warning text.
          borderColor: COLORS.warning,
          backgroundColor: COLORS.surfaceMuted,
          padding: 14,
          marginBottom: 24,
        }}
      >
        <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.bodyBold, fontSize: 14, marginBottom: 4 }}>
          💡 Hints are available — at a price
        </Text>
        <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: 13, lineHeight: 19 }}>
          Tap 💡 during the game to see the best move for a few seconds. Each hint costs{' '}
          {HINT_PENALTY} rating points off your result.
        </Text>
      </View>
    </>
  );
}
