import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS_NATIVE, SHADOWS_NATIVE } from '@gameexplorer/ui';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

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
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    opacity: isDisabled ? 0.5 : 1,
  };

  const glowStyle = glow && !isDisabled ? SHADOWS_NATIVE.glowAccent : undefined;

  if (variant === 'primary') {
    return (
      <Pressable onPress={onPress} disabled={isDisabled} style={[glowStyle, style]}>
        {({ pressed }) => (
          <LinearGradient
            colors={GRADIENTS_NATIVE.accent.colors as [string, string, ...string[]]}
            locations={GRADIENTS_NATIVE.accent.locations as [number, number, ...number[]]}
            start={GRADIENTS_NATIVE.accent.start}
            end={GRADIENTS_NATIVE.accent.end}
            style={[base, { opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
          >
            {content}
          </LinearGradient>
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
    <Pressable onPress={onPress} disabled={isDisabled} style={style}>
      {({ pressed }) => (
        <View style={[base, surface, { opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1 }]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}
