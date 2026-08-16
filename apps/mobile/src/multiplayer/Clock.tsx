import { Text, View } from 'react-native';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface ClockProps {
  ms: number;
  /** This clock is the one currently running. */
  active: boolean;
  /** `formatClockLong` for chess, `formatClockShort` for the per-move games. */
  format: (ms: number) => string;
  /** Below this many ms the running clock enters the danger state. */
  lowClockMs: number;
}

/**
 * A player's clock chip — native port of the `Clock` inside web's `GameLayout`.
 *
 * The running clock is the focal point (accent); low time is signalled by colour
 * AND a glyph AND a live region, never by colour alone. The tabular font matters
 * more here than anywhere else in the app: a proportional face makes the digits
 * jitter ten times a second, which reads as the clock stuttering.
 */
export function Clock({ ms, active, format, lowClockMs }: ClockProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const danger = active && ms < lowClockMs;
  const text = format(ms);

  return (
    <View
      // Android-only, and deliberately narrow: announcing every tick would be
      // unusable, so only the transition into danger speaks.
      accessibilityLiveRegion={danger ? 'assertive' : 'none'}
      accessibilityLabel={danger ? `Low time — ${text}` : text}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: danger ? COLORS.danger : active ? COLORS.accent : COLORS.border,
        backgroundColor: danger
          ? COLORS.dangerMuted
          : active
            ? COLORS.accentMuted
            : COLORS.surfaceMuted,
      }}
    >
      {danger && <Text style={{ fontSize: 12 }}>⏰</Text>}
      <Text
        // The glyph above already carries the meaning for sighted users, and
        // the label on the wrapper carries it for everyone else.
        importantForAccessibility="no"
        style={{
          color: danger ? COLORS.dangerHover : active ? COLORS.accentHover : COLORS.fgMuted,
          fontFamily: FONTS.displaySemi,
          fontSize: 18,
          // Keeps the digits from dancing as they count down.
          fontVariant: ['tabular-nums'],
        }}
      >
        {text}
      </Text>
    </View>
  );
}
