import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { COLORS, SHADOWS_NATIVE, useThemeName } from '@gameexplorer/ui';

interface CardProps {
  children: ReactNode;
  /** Adds a drop-shadow elevation (raised panel). */
  raised?: boolean;
  style?: ViewStyle;
}

/**
 * Surface panel — the native equivalent of the web `Card`. surfaceAlt fill,
 * hairline border, rounded-2xl. `raised` adds the elevation shadow token.
 */
export function Card({ children, raised = false, style }: CardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      style={[
        {
          backgroundColor: COLORS.surfaceAlt,
          borderColor: COLORS.border,
          borderWidth: 1,
          borderRadius: 16,
        },
        raised && SHADOWS_NATIVE.elevation,
        style,
      ]}
    >
      {children}
    </View>
  );
}
