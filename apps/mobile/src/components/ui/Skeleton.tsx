import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, MOTION, RADIUS, useThemeName } from '@gameexplorer/ui';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';
import { finitePulseCount, timing } from '@/theme/motion';

/**
 * How long the pulse runs. A skeleton still on screen after ten seconds is an
 * error state wearing a loading costume, and an endless repeat would also keep
 * Android from ever reaching idle — `motion-spec.md` §5.14 and §5.16.
 */
const PULSE_LIMIT_MS = 10_000;
/** The pulse's low point, and where the block holds still under reduced motion. */
const DIM = 0.5;
const HELD = 0.7;

interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: keyof typeof RADIUS;
  style?: StyleProp<ViewStyle>;
}

/**
 * A placeholder block in the shape of the content it stands in for. Content
 * screens load behind these rather than a centred spinner that hard-swaps.
 *
 * Hidden from screen readers: a column of grey blocks says nothing. The region
 * that is loading should carry the announcement — for example a busy
 * `accessibilityState` and a "Loading" label on its container.
 */
export function Skeleton({ width = '100%', height, radius = 'lg', style }: SkeletonProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { reducedMotion } = useFeedbackPrefs();
  const opacity = useSharedValue(reducedMotion ? HELD : 1);

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(opacity);
      opacity.value = HELD;
      return;
    }
    opacity.value = 1;
    opacity.value = withRepeat(
      withTiming(DIM, timing('slower', 'standard')),
      finitePulseCount(MOTION.DURATION.slower, PULSE_LIMIT_MS),
      true,
    );
    return () => cancelAnimation(opacity);
  }, [reducedMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: RADIUS[radius], backgroundColor: COLORS.surfaceMuted },
        style,
        animatedStyle,
      ]}
    />
  );
}
