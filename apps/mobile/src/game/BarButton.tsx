import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, useThemeName, FONT_SIZES, RADIUS } from '@gameexplorer/ui';
import { Icon, type IconName } from '@/components/ui/Icon';
import { FONTS } from '@/theme/typography';

export type BarButtonProps = {
  label: string;
  hint?: string;
  /** Small counter in the corner (hints taken, unread messages). */
  badge?: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
} & (
  /** An interface action, drawn as an icon. */
  | { icon: IconName; text?: never }
  /** Content rather than chrome — an emote the player is about to send. */
  | { text: string; icon?: never }
);

/**
 * One cell of an in-game control bar — an icon button that splits the bar's
 * width evenly with its siblings.
 *
 * Lifted out of `GameBar` unchanged when online play needed the same bar with a
 * different action set. The markup is deliberately identical: `GameBar`'s tests
 * read these buttons by accessibility label, and the online bar should look and
 * measure exactly like the single-player one it sits beside in the same app.
 */
export function BarButton({
  icon,
  text,
  label,
  hint,
  badge,
  onPress,
  disabled = false,
  danger = false,
}: BarButtonProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  // `style` stays a plain object and the pressed state is read from the children
  // function, matching `Button`/`GameActions`. This began as a workaround —
  // NativeWind's Pressable wrapper dropped a function-form `style` — and stays
  // as the one way controls in this app are written now that NativeWind is gone.
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      style={{ flex: 1 }}
    >
      {({ pressed }) => (
        <View
          style={{
            flex: 1,
            minHeight: 46,
            borderRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: danger ? COLORS.danger : COLORS.border,
            backgroundColor: danger
              ? COLORS.dangerMuted
              : pressed
                ? COLORS.surfaceHover
                : COLORS.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled ? 0.35 : 1,
          }}
        >
          {/* Decorative either way: the button's accessibility label names it. */}
          {icon ? (
            <Icon name={icon} size={FONT_SIZES.xl} color={danger ? COLORS.dangerHover : COLORS.fg} />
          ) : (
            <Text importantForAccessibility="no" style={{ fontSize: FONT_SIZES.xl }}>
              {text}
            </Text>
          )}
          {badge && (
            <Text
              // The count is already in the button's accessibility label; a
              // bare number here would just repeat it out of context.
              importantForAccessibility="no"
              style={{
                position: 'absolute',
                top: 4,
                right: 6,
                color: COLORS.warningHover,
                fontSize: FONT_SIZES['2xs'],
                fontFamily: FONTS.bodyBold,
              }}
            >
              {badge}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Seconds the flag stays armed after the first tap. */
const CONFIRM_MS = 3000;

/**
 * Two-tap confirmation for a destructive bar action (resign, abort).
 *
 * The armed flag is held in a ref as well as state because `armed` alone races
 * on a fast double-tap: both handlers close over `armed === false` and the
 * second tap re-arms instead of firing. The ref is read synchronously, so the
 * second tap always sees the first.
 */
export function useTwoTapConfirm(onConfirm: () => void) {
  const [armed, setArmed] = useState(false);
  const armedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  };
  useEffect(() => () => stopTimer(), []);

  const press = () => {
    if (armedRef.current) {
      stopTimer();
      armedRef.current = false;
      setArmed(false);
      onConfirm();
      return;
    }
    armedRef.current = true;
    setArmed(true);
    timeoutRef.current = setTimeout(() => {
      armedRef.current = false;
      setArmed(false);
    }, CONFIRM_MS);
  };

  return { armed, press };
}
