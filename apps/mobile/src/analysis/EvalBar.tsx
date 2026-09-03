import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, useThemeName } from '@finesse/ui';
import { useSettings } from '@/providers/SettingsProvider';
import { FONTS } from '@/theme/typography';

export interface EvalBarProps {
  /** White's share of the bar, 0–1. */
  share: number;
  /** Formatted eval, e.g. "+1.25". */
  label: string;
  /** A search is running for this position. */
  busy?: boolean;
}

// Literal white/black rather than theme tokens: the bar means "White is ahead",
// and the boards already draw their pieces in fixed colours for the same reason.
const WHITE_SIDE = '#efeae1';
const BLACK_SIDE = '#242229';

/**
 * The eval bar — White's share of the position, filling from the left.
 * Horizontal rather than the desktop convention of a vertical strip beside the
 * board: on a phone the board already owns the full width, and a vertical bar
 * would come straight out of the squares.
 */
export function EvalBar({ share, label, busy = false }: EvalBarProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { reducedMotion } = useSettings();
  const width = useSharedValue(share);

  useEffect(() => {
    width.value = reducedMotion ? share : withTiming(share, { duration: 380 });
  }, [share, reducedMotion, width]);

  const fill = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.fgMuted, fontFamily: FONTS.displaySemi, fontSize: 12, letterSpacing: 0.8 }}>
          EVALUATION
        </Text>
        <Text
          accessibilityLabel={`Evaluation ${label}`}
          style={{ color: COLORS.fg, fontFamily: FONTS.bodyBold, fontSize: 16 }}
        >
          {busy && !label ? '…' : label}
        </Text>
      </View>
      <View
        accessible
        accessibilityLabel={`White holds ${Math.round(share * 100)} percent of the evaluation bar`}
        style={{
          height: 12,
          borderRadius: 6,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: BLACK_SIDE,
        }}
      >
        <Animated.View style={[{ height: '100%', backgroundColor: WHITE_SIDE }, fill]} />
      </View>
    </View>
  );
}
