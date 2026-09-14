import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { MOTION } from '@gameexplorer/ui';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';
import { timing } from '@/theme/motion';

/** How far content rises as it arrives, in points — `motion-spec.md` §5.5. */
const RISE = 8;

/**
 * Whether the nearest `Entrance` above is still playing. A ref rather than
 * state, so the moment it finishes re-renders nothing.
 */
const Arriving = createContext<{ current: boolean } | null>(null);

interface EntranceProps {
  children: ReactNode;
  /** `rise` fades in from just below. `fade` is opacity only, for anything centred on a board. */
  variant?: 'rise' | 'fade';
  /**
   * Position in a list. Items stagger by `MOTION.STAGGER.step`, and everything
   * from the last staggered slot on arrives together, so a long list never makes
   * its last row wait — §5.7.
   */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Content arriving: opacity up over `moderate` on the `out` curve, rising 8pt
 * unless it is a `fade`. Plays once, on mount.
 *
 * It does not play at all in two cases, decided at mount:
 *
 * - **Reduced motion.** It starts where it would end, so nothing is ever hidden
 *   waiting for an animation that will not run.
 * - **Inside an entrance that is still playing.** That content is already being
 *   carried in: a route whose whole content is an `EmptyState`, a `TextField`
 *   error on a screen that just opened. A second rise would double the travel.
 *   The same component mounting later, into a settled screen, does play.
 */
export function Entrance({ children, variant = 'rise', index = 0, style }: EntranceProps) {
  const { reducedMotion } = useFeedbackPrefs();
  const parent = useContext(Arriving);
  const [animate] = useState(() => !reducedMotion && !parent?.current);
  const arriving = useRef(animate);
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;
    const slot = Math.min(Math.max(index, 0), MOTION.STAGGER.maxItems - 1);
    const delay = slot * MOTION.STAGGER.step;
    progress.value = withDelay(delay, withTiming(1, timing('moderate', 'out')));
    const settled = setTimeout(() => {
      arriving.current = false;
    }, delay + MOTION.DURATION.moderate);
    return () => clearTimeout(settled);
    // Mount only: an entrance plays once, and a later preference change is
    // honoured by the next thing to mount rather than by replaying this one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: variant === 'rise' ? [{ translateY: (1 - progress.value) * RISE }] : [],
  }));

  return (
    <Arriving.Provider value={arriving}>
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Arriving.Provider>
  );
}
