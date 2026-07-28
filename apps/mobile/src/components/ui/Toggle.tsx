import { Pressable, View } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';

interface ToggleProps {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}

/**
 * Accessible on/off switch, styled to match the web Settings toggle (gold when
 * on, muted track when off, white knob that slides). Built as a Pressable rather
 * than RN's `Switch` so the track/knob colors come from tokens on both platforms.
 */
export function Toggle({ value, onValueChange, label, disabled = false }: ToggleProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        padding: 3,
        justifyContent: 'center',
        backgroundColor: value ? COLORS.accent : COLORS.surfaceMuted,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#ffffff',
          transform: [{ translateX: value ? 20 : 0 }],
        }}
      />
    </Pressable>
  );
}
