import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { COLORS, useThemeName, RADIUS } from '@gameexplorer/ui';
import { PressableScale } from './PressableScale';

export type CardVariant = 'default' | 'muted' | 'danger';

interface CardProps {
  children: ReactNode;
  /**
   * `default` is the raised surface. `muted` sits inside another surface.
   * `danger` borders a card that holds an irreversible action.
   */
  variant?: CardVariant;
  /** Makes the whole card one control: press shrink, pressed fill, button role. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** On the surface itself. In the pressable form, keep `flex` off it — the touch target wraps it. */
  style?: StyleProp<ViewStyle>;
}

/**
 * Surface panel — the native equivalent of the web `Card`. One step rounder than
 * the controls inside it (`RADIUS['2xl']` against their `xl`), so a button in a
 * card reads as nested.
 *
 * There is no raised variant. The one that existed cast the platform elevation
 * shadow, which Android traces as a hard ring around a rounded view, and nothing
 * used it.
 */
export function Card({
  children,
  variant = 'default',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: CardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const surface: ViewStyle = {
    backgroundColor: variant === 'muted' ? COLORS.surfaceMuted : COLORS.surfaceAlt,
    borderColor: variant === 'danger' ? COLORS.danger : COLORS.border,
    borderWidth: 1,
    borderRadius: RADIUS['2xl'],
  };

  if (!onPress) return <View style={[surface, style]}>{children}</View>;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {({ pressed }) => (
        <View style={[surface, style, pressed && { backgroundColor: COLORS.surfaceHover }]}>{children}</View>
      )}
    </PressableScale>
  );
}
