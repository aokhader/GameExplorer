import { useState, type Ref } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { Entrance } from './Entrance';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Danger outline with no message, such as a confirm field that must match. Prefer `error`. */
  invalid?: boolean;
  /** Says what is wrong. Outlines the field in danger and replaces `hint`. */
  error?: string;
  /** Guidance under the field while there is no error. */
  hint?: string;
  /** Forwarded to the inner TextInput so forms can chain focus between fields. */
  ref?: Ref<TextInput>;
}

/**
 * Labeled single-line text input, token-styled to match the Arcade-Glow forms.
 *
 * - **Type.** The input sets the body font. Without it every field in the app
 *   typed in the system font while its label sat in DM Sans above it.
 * - **Focus** lifts the border to the gold focus ring, mirroring the web inputs'
 *   ring, and does so instantly: `motion-spec.md` §5.3 never animates focus,
 *   because the player has to see where focus is the moment it arrives.
 * - **Errors** enter like any content (§5.5) and never shake (§5.14). A new
 *   message replays the entrance.
 * - **Accessibility.** The label names the input, and the error or hint is its
 *   accessibility hint, since the Text above and below is not linked to it.
 */
export function TextField({ label, invalid = false, error, hint, ref, ...props }: TextFieldProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [focused, setFocused] = useState(false);

  const borderColor = invalid || error
    ? COLORS.danger
    : focused
      ? COLORS.focusRing
      : COLORS.border;

  return (
    <View style={{ gap: SPACING['1.5'] }}>
      {label && (
        <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, fontFamily: FONTS.bodySemi }}>{label}</Text>
      )}
      <TextInput
        ref={ref}
        placeholderTextColor={COLORS.fgSubtle}
        {...props}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={props.accessibilityHint ?? (error || hint)}
        // After the spread: a caller's own focus listeners run too, rather than
        // replacing these and leaving the ring stuck.
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
          borderRadius: RADIUS.xl,
          borderWidth: 1,
          borderColor,
          backgroundColor: COLORS.surfaceMuted,
          color: COLORS.fg,
          paddingHorizontal: 14,
          fontSize: FONT_SIZES.body,
          fontFamily: FONTS.body,
        }}
      />
      {error ? (
        <Entrance key={error}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: COLORS.dangerHover, fontSize: FONT_SIZES.xs, fontFamily: FONTS.bodySemi }}
          >
            {error}
          </Text>
        </Entrance>
      ) : hint ? (
        <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.xs, fontFamily: FONTS.body }}>{hint}</Text>
      ) : null}
    </View>
  );
}
