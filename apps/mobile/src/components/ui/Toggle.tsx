import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { COLORS, useThemeName, RADIUS } from '@gameexplorer/ui';
import { useUiHaptic } from '@/audio/useUiHaptic';
import { useFeedbackPrefs } from '@/providers/SettingsProvider';
import { springTo, timeTo } from '@/theme/motion';

const TRACK_WIDTH = 48;
const TRACK_HEIGHT = 28;
const INSET = 3;
const KNOB = 22;
/** How far the knob travels from off to on. */
const TRAVEL = TRACK_WIDTH - INSET * 2 - KNOB;

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
 *
 * Motion per `motion-spec.md` §5.4: the knob travels on the `snappy` spring, and
 * the gold fades in over `fast` as a layer on the muted track — fading a layer
 * is how a colour change animates without interpolating two live theme colours.
 * Under reduced motion the knob jumps and the colour still fades, because the
 * colour is feedback, not movement. A selection haptic marks the flip.
 */
export function Toggle({ value, onValueChange, label, disabled = false }: ToggleProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { reducedMotion } = useFeedbackPrefs();
  const haptic = useUiHaptic();

  const knob = useSharedValue(value ? TRAVEL : 0);
  const fill = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    knob.value = springTo(value ? TRAVEL : 0, 'snappy', reducedMotion);
    fill.value = timeTo(value ? 1 : 0, 'fast', 'standard', false);
  }, [value, reducedMotion, knob, fill]);

  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: knob.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fill.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        haptic('selection');
        onValueChange(!value);
      }}
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: RADIUS.full,
        padding: INSET,
        justifyContent: 'center',
        backgroundColor: COLORS.surfaceMuted,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: RADIUS.full,
            backgroundColor: COLORS.accent,
          },
          fillStyle,
        ]}
      />
      <Animated.View
        style={[
          { width: KNOB, height: KNOB, borderRadius: RADIUS.full, backgroundColor: '#ffffff' },
          knobStyle,
        ]}
      />
    </Pressable>
  );
}
