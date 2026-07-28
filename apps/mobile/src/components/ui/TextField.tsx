import { useState, type Ref } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Danger outline for invalid/confirm inputs. */
  invalid?: boolean;
  /** Forwarded to the inner TextInput so forms can chain focus between fields. */
  ref?: Ref<TextInput>;
}

/**
 * Labeled single-line text input, token-styled to match the Arcade-Glow forms.
 * Focus lifts the border to the gold focus ring, mirroring the web inputs'
 * `focus:ring-accent`.
 */
export function TextField({ label, invalid = false, ref, ...props }: TextFieldProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [focused, setFocused] = useState(false);

  const borderColor = invalid
    ? COLORS.danger
    : focused
      ? COLORS.focusRing
      : COLORS.border;

  return (
    <View style={{ gap: 6 }}>
      {label && (
        <Text style={{ color: COLORS.fgMuted, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={COLORS.fgSubtle}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={{
          height: 48,
          borderRadius: 12,
          borderWidth: 1,
          borderColor,
          backgroundColor: COLORS.surfaceMuted,
          color: COLORS.fg,
          paddingHorizontal: 14,
          fontSize: 15,
        }}
        {...props}
      />
    </View>
  );
}
