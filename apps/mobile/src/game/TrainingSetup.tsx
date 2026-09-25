import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { UserRating } from '@gameexplorer/db';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Button, Icon } from '@/components/ui';
import { eloLabel, type EloLabelGame } from '@/game/eloLabel';
import { HINT_PENALTY } from '@/engine/trainingRules';
import { FONTS } from '@/theme/typography';

/** Games below this count use the higher provisional K-factor (see shared/elo). */
const PROVISIONAL_GAMES = 30;

export interface TrainingSetupProps {
  game: EloLabelGame;
  /** The player's Practice level row, or null while loading / signed out. */
  rating: UserRating | null;
  loading: boolean;
  /** Strength the bot will actually play at — already clamped by the loop. */
  botElo: number;
  /** Signed in? Training writes a practice level, so an account is required. */
  signedIn: boolean;
  online: boolean;
}

/**
 * The training setup panel — the native mirror of web's `/{game}/training` setup
 * screen: your practice level, the bot matched to it, and what hints cost.
 * Guests and offline players get the reason they can't start instead of the
 * practice-level card (training always writes a practice level, so it needs
 * both an account and a connection). Rendered between the mode picker and the
 * color picker.
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
          borderRadius: RADIUS['2xl'],
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 20,
          marginBottom: 24,
          gap: SPACING[3],
        }}
      >
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.lg }}>
          Training needs an account
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.sm, lineHeight: 20 }}>
          Every training game is rated, so your practice level has to live somewhere. Sign in and the bot
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
          borderRadius: RADIUS['2xl'],
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 20,
          marginBottom: 24,
          gap: SPACING[2],
        }}
      >
        <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.lg }}>
          Training needs a connection
        </Text>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.sm, lineHeight: 20 }}>
          Rated games read and write your practice level. Play a casual bot game or pass-and-play while
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
      {/* Practice level card */}
      <View
        style={{
          borderRadius: RADIUS['2xl'],
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
            fontSize: FONT_SIZES.xs,
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          YOUR PRACTICE LEVEL
        </Text>
        {loading ? (
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.body, paddingVertical: 12 }}>
            Loading…
          </Text>
        ) : (
          <>
            <Text
              accessibilityLabel={`Your practice level is ${current}, ${eloLabel(game, current)}`}
              style={{ color: COLORS.fg, fontFamily: FONTS.display, fontSize: FONT_SIZES['6xl'], lineHeight: 60 }}
            >
              {current}
            </Text>
            <Text style={{ color: accent.light, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.base, marginTop: 2 }}>
              {eloLabel(game, current)}
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING[4], marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
                {played} games
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
                {rating?.wins ?? 0}W / {rating?.losses ?? 0}L / {rating?.draws ?? 0}D
              </Text>
              <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.label }}>
                Peak {rating?.peak_rating ?? 1200}
              </Text>
            </View>
            {remaining > 0 && (
              <Text
                style={{
                  color: COLORS.warningHover,
                  fontFamily: FONTS.body,
                  fontSize: FONT_SIZES.xs,
                  textAlign: 'center',
                  marginTop: 10,
                  lineHeight: 17,
                }}
              >
                Provisional — your practice level moves faster for {remaining} more{' '}
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
          gap: SPACING[3],
          borderRadius: RADIUS['2xl'],
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.surfaceAlt,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body }}>
            Bot strength
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, marginTop: 2 }}>
            Matched to your practice level automatically
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.xl }}>
            {loading ? '—' : botElo}
          </Text>
          <Text style={{ color: accent.light, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs }}>
            {loading ? '' : eloLabel(game, botElo)}
          </Text>
        </View>
      </View>

      {/* What hints cost */}
      <View
        style={{
          borderRadius: RADIUS['2xl'],
          borderWidth: 1,
          // There's no warning-tint token (only danger has one), so the callout
          // is a normal muted surface with a warning border + warning text.
          borderColor: COLORS.warning,
          backgroundColor: COLORS.surfaceMuted,
          padding: 14,
          marginBottom: 24,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING['1.5'], marginBottom: 4 }}>
          <Icon name="lightbulb" size={FONT_SIZES.base} color={COLORS.warningHover} />
          <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.sm }}>
            Hints are available — at a price
          </Text>
        </View>
        <Text style={{ color: COLORS.warningHover, fontFamily: FONTS.body, fontSize: FONT_SIZES.label, lineHeight: 19 }}>
          Tap Hint during the game to see the best move for a few seconds. Each hint costs{' '}
          {HINT_PENALTY} points off your result.
        </Text>
      </View>
    </>
  );
}
