import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useUiHaptic, type UiHaptic } from '@/audio/useUiHaptic';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';
import { springTo, timeTo } from '@/theme/motion';

/** How far a pressed surface shrinks — `motion-spec.md` §5.1. */
export const PRESS_SCALE = 0.97;

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** On the touch target: layout, such as margins and width. */
  style?: StyleProp<ViewStyle>;
  /** On the view that shrinks, inside the touch target. */
  contentStyle?: StyleProp<ViewStyle>;
  /** Fired on a completed press, when the player has haptics on. */
  haptic?: UiHaptic;
  children: ReactNode | ((state: { pressed: boolean }) => ReactNode);
}

/**
 * The press response every tappable surface in the app shares.
 *
 * Per `motion-spec.md` §5.1, the surface shrinks to `PRESS_SCALE` over `micro`
 * as the finger lands and springs back on `snappy` as it lifts. Opacity never
 * changes, because a dimmed control reads as a disabled one. For a pressed
 * colour, pass a function as children and style on `pressed`, the way `Button`
 * does. Under reduced motion there is no shrink, so that colour is the whole of
 * the feedback.
 *
 * The haptic fires on `onPress`, not on touch-down, so a scroll that happens to
 * start on a card never buzzes.
 */
export function PressableScale({
  style,
  contentStyle,
  haptic,
  children,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: PressableScaleProps) {
  const { reducedMotion } = useFeedbackPrefs();
  const fire = useUiHaptic();
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...props}
      style={style}
      // `set` rather than assigning `.value`: the hooks lint treats a hook's
      // return value as immutable and rejects the assignment in an inline handler.
      onPressIn={(e) => {
        if (!reducedMotion) scale.set(timeTo(PRESS_SCALE, 'micro', 'out', false));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.set(springTo(1, 'snappy', reducedMotion));
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) fire(haptic);
        onPress?.(e);
      }}
    >
      {({ pressed }) => (
        <Animated.View style={[contentStyle, scaleStyle]}>
          {typeof children === 'function' ? children({ pressed }) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
