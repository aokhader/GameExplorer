import { Pressable, Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface GoReviewBarProps {
  onAccept: () => void;
  onResume: () => void;
}

/**
 * The two moves left once both players have passed, pinned where `GameBar`
 * usually sits.
 *
 * A separate bar rather than two more `GameBar` buttons because the review is a
 * different mode, not another action: there is no turn to pass, nothing to
 * resign, and no history worth stepping through until the score is settled.
 * Leaving those controls on screen next to "Accept score" would offer five
 * things when only two of them do anything.
 *
 * It is pinned rather than in the sidebar for the reason every primary action on
 * this app is: the sidebar scrolls, and the button that ends the game must not
 * be somewhere the player has to go looking for.
 */
export function GoReviewBar({ onAccept, onResume }: GoReviewBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        gap: SPACING[2],
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      {/* Plain object `style` with the pressed state read from the children
          function — the way every control in this app is written. */}
      <Pressable
        onPress={onResume}
        accessibilityRole="button"
        accessibilityLabel="Resume play"
        accessibilityHint="Go back to the board and settle it with more moves"
        style={{ flex: 1 }}
      >
        {({ pressed }) => (
          <View
            style={{
              flex: 1,
              minHeight: 46,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.body, fontFamily: FONTS.bodyBold }}>
              Resume play
            </Text>
          </View>
        )}
      </Pressable>

      <Pressable
        onPress={onAccept}
        accessibilityRole="button"
        accessibilityLabel="Accept score"
        accessibilityHint="End the game and count the board as marked"
        style={{ flex: 1.4 }}
      >
        {({ pressed }) => (
          <View
            style={{
              flex: 1,
              minHeight: 46,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: GAME_ACCENTS.go.base,
              backgroundColor: pressed ? GAME_ACCENTS.go.tintBg : GAME_ACCENTS.go.base,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: pressed ? GAME_ACCENTS.go.base : COLORS.onAccent,
                fontSize: FONT_SIZES.body,
                fontFamily: FONTS.bodyBold,
              }}
            >
              Accept score
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}
