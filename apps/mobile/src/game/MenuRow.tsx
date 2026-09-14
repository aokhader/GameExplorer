import { Pressable, Text, View } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FONTS } from '@/theme/typography';

export interface MenuRowProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  /** Placeholder entry — rendered, disabled, and badged so it reads as unbuilt. */
  soon?: boolean;
  /** Built, but unavailable right now (e.g. the game is already over). */
  disabled?: boolean;
  /** Destructive entry (resign, block) — the label carries the danger colour. */
  danger?: boolean;
  /** Small explanatory line under the label. */
  detail?: string;
  accent: string;
}

/**
 * One row of a game-menu bottom sheet. Lifted out of `GameBar` when online play
 * needed the same sheet with a different action set, so the two menus stay
 * visibly the same control. The only addition is the optional `detail` line
 * (online uses it to explain what blocking or aborting actually does), which
 * costs the label a wrapper `View` but renders identically without it.
 */
export function MenuRow({
  icon,
  label,
  onPress,
  soon = false,
  disabled = false,
  danger = false,
  detail,
  accent,
}: MenuRowProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const inactive = soon || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={soon ? `${label} (coming soon)` : label}
      accessibilityHint={detail}
      accessibilityState={{ disabled: inactive }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING['3.5'],
            minHeight: 52,
            paddingHorizontal: 12,
            borderRadius: RADIUS.xl,
            backgroundColor: pressed && !inactive ? COLORS.surfaceHover : 'transparent',
            opacity: inactive ? 0.45 : 1,
          }}
        >
          {/* The game's accent carries identity into the menu; a destructive row
              takes the danger colour instead, like its label. */}
          <Icon name={icon} size={FONT_SIZES.xl} color={danger ? COLORS.dangerHover : accent} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: danger ? COLORS.dangerHover : COLORS.fg,
                fontFamily: FONTS.displaySemi,
                fontSize: FONT_SIZES.base,
              }}
            >
              {label}
            </Text>
            {detail && (
              <Text
                // Already on the row's accessibility hint.
                importantForAccessibility="no"
                style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, marginTop: 1 }}
              >
                {detail}
              </Text>
            )}
          </View>
          {soon && (
            <Text
              style={{
                color: accent,
                fontSize: FONT_SIZES.caption,
                fontFamily: FONTS.bodyBold,
                letterSpacing: 0.5,
                borderWidth: 1,
                borderColor: accent,
                borderRadius: RADIUS.full,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              SOON
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}
