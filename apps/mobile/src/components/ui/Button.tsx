import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GLOWS_NATIVE, GRADIENTS_NATIVE, useThemeName } from '@gameexplorer/ui';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Shared by the fill and the glow-casting wrapper so the halo tracks the corners. */
const RADIUS = 14;

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Adds the neon glow halo (primary CTA emphasis). */
  glow?: boolean;
  style?: ViewStyle;
}

/**
 * The app's primary action control. `primary` renders the gold Arcade-Glow
 * gradient (single source: GRADIENTS_NATIVE.accent); the others are flat
 * token-colored surfaces. All share the same size/typography so buttons line up
 * in a column.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  glow = false,
  style,
}: ButtonProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const isDisabled = disabled || loading;

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
          fontSize: 16,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </>
  );

  const base: ViewStyle = {
    height: 52,
    borderRadius: RADIUS,
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

  if (variant === 'primary') {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        style={style}
      >
        {({ pressed }) => (
          // Gold underlay: gives the shadow caster the opaque rounded rect it
          // needs (the gradient covers it), and carries the press/disabled
          // dimming so the glow fades with the fill rather than hanging at full
          // strength behind a dimmed button.
          <View
            style={[
              { borderRadius: RADIUS, backgroundColor: COLORS.accent },
              glowStyle,
              { opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            <LinearGradient
              colors={GRADIENTS_NATIVE.accent.colors}
              locations={GRADIENTS_NATIVE.accent.locations}
              start={GRADIENTS_NATIVE.accent.start}
              end={GRADIENTS_NATIVE.accent.end}
              style={base}
            >
              {content}
            </LinearGradient>
          </View>
        )}
      </Pressable>
    );
  }

  const surface: ViewStyle =
    variant === 'secondary'
      ? { backgroundColor: COLORS.surfaceMuted, borderWidth: 1, borderColor: COLORS.border }
      : variant === 'danger'
        ? { backgroundColor: COLORS.dangerMuted, borderWidth: 1, borderColor: COLORS.danger }
        : { backgroundColor: 'transparent' };

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={style}
    >
      {({ pressed }) => (
        <View
          style={[base, surface, glowStyle, { opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1 }]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
