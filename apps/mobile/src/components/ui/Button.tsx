import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS } from '@gameexplorer/ui';
import type { UiHaptic } from '@/audio/useUiHaptic';
import { FONTS } from '@/theme/typography';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Controls share one radius — `TextField` uses the same step — and cards sit one
 * step rounder, which is what lets a button inside a card read as nested.
 */
const CORNER = RADIUS.xl;

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /**
   * Haptic on a completed press, when the player has haptics on. `primary` is a
   * screen's main action and defaults to a light impact. Pass `warning` on the
   * final confirmation of something irreversible, or `null` for none —
   * `motion-spec.md` §7.
   */
  haptic?: UiHaptic | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's primary action control. Every variant is a flat token-coloured
 * surface; `primary` is the gold one, and a screen has one. All share the same
 * size/typography so buttons line up in a column.
 *
 * Press feedback follows `motion-spec.md` §5.1 through `PressableScale`: a slight
 * shrink that springs back, plus a pressed colour. It never dims on press — half
 * opacity is what disabled looks like.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  haptic,
  style,
}: ButtonProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const isDisabled = disabled || loading;
  const feedback = haptic === undefined ? (variant === 'primary' ? 'impact' : undefined) : (haptic ?? undefined);

  const content = (
    <>
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? COLORS.onAccent : COLORS.fg}
          style={{ marginRight: 8 }}
        />
      )}
      <Text
        style={{
          color:
            variant === 'primary'
              ? COLORS.onAccent
              : variant === 'danger'
                ? COLORS.dangerHover
                : COLORS.fg,
          fontSize: FONT_SIZES.base,
          fontFamily: FONTS.bodyBold,
        }}
      >
        {label}
      </Text>
    </>
  );

  const base: ViewStyle = {
    height: 52,
    borderRadius: CORNER,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  };

  const surface = (pressed: boolean): ViewStyle => {
    switch (variant) {
      // Flat gold, one per screen. The gradient fill and the neon halo it
      // could wear were two more ways of saying "this is the gold one"
      // (ux-fix-ideas.md §6.1); a press deepens the gold instead.
      case 'primary':
        return { backgroundColor: pressed ? COLORS.accentHover : COLORS.accent };
      case 'secondary':
        return {
          backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceMuted,
          borderWidth: 1,
          borderColor: COLORS.border,
        };
      case 'danger':
        return {
          backgroundColor: COLORS.dangerMuted,
          borderWidth: 1,
          borderColor: pressed ? COLORS.dangerHover : COLORS.danger,
        };
      default:
        return { backgroundColor: pressed ? COLORS.surfaceMuted : 'transparent' };
    }
  };

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      haptic={feedback}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={style}
    >
      {({ pressed }) => (
        <View style={[base, surface(pressed), { opacity: isDisabled ? 0.5 : 1 }]}>{content}</View>
      )}
    </PressableScale>
  );
}
