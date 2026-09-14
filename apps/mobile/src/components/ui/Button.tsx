import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GLOWS_NATIVE, GRADIENTS_NATIVE, useThemeName, FONT_SIZES, RADIUS } from '@gameexplorer/ui';
import type { UiHaptic } from '@/audio/useUiHaptic';
import { FONTS } from '@/theme/typography';
import { PressableScale } from './PressableScale';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

/**
 * Shared by the fill and the glow-casting wrapper so the halo tracks the corners.
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
  /** Adds the neon glow halo (primary CTA emphasis). */
  glow?: boolean;
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
 * The app's primary action control. `primary` renders the gold Arcade-Glow
 * gradient (single source: GRADIENTS_NATIVE.accent); the others are flat
 * token-colored surfaces. All share the same size/typography so buttons line up
 * in a column.
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
  glow = false,
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

  /**
   * The glow must sit on a view that has BOTH the rounded corners and an opaque
   * fill. iOS derives a layer's `shadowPath` from its background; with a
   * transparent one it falls back to the layer *bounds* and casts a hard square
   * halo whose corners poke out past the button's rounded ones (this is the case
   * RN warns about with "cannot calculate shadow efficiently … consider setting a
   * background color"). Android traces the view outline instead, which is why the
   * square corners only ever showed up on iOS.
   *
   * Applies to the surfaces below too — keep `glow` off `ghost`, whose surface is
   * transparent and would hit the same fallback.
   */
  const glowStyle: ViewStyle | undefined =
    glow && !isDisabled ? { boxShadow: GLOWS_NATIVE.glowAccent } : undefined;

  const flatSurface = (pressed: boolean): ViewStyle => {
    switch (variant) {
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
      {({ pressed }) =>
        variant === 'primary' ? (
          // Gold underlay: gives the shadow caster the opaque rounded rect it
          // needs, and carries the disabled dimming so the glow fades with the
          // fill. The gradient is its own layer so a press can thin it toward
          // the flat gold underneath — a change of colour, where fading the
          // button would have faded the label too.
          <View
            style={[
              { borderRadius: CORNER, backgroundColor: COLORS.accent },
              glowStyle,
              { opacity: isDisabled ? 0.5 : 1 },
            ]}
          >
            <LinearGradient
              colors={GRADIENTS_NATIVE.accent.colors}
              locations={GRADIENTS_NATIVE.accent.locations}
              start={GRADIENTS_NATIVE.accent.start}
              end={GRADIENTS_NATIVE.accent.end}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: CORNER,
                opacity: pressed ? 0.6 : 1,
              }}
            />
            <View style={base}>{content}</View>
          </View>
        ) : (
          <View style={[base, flatSurface(pressed), glowStyle, { opacity: isDisabled ? 0.5 : 1 }]}>
            {content}
          </View>
        )
      }
    </PressableScale>
  );
}
