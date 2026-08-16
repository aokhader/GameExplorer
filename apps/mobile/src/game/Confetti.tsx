import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';

/** How many pieces fall. Enough to read as a burst, few enough to stay smooth. */
const PIECE_COUNT = 28;
const FALL_MS = 2600;
/** How long one full rotation takes. */
const SPIN_MS = 900;

interface PieceSpec {
  /** Horizontal position as a fraction of the screen width. */
  x: number;
  size: number;
  delay: number;
  duration: number;
  color: string;
  spin: number;
  /** Horizontal drift over the fall, in px. */
  drift: number;
}

function ConfettiPiece({ spec, height }: { spec: PieceSpec; height: number }) {
  const progress = useSharedValue(0);
  const spin = useSharedValue(0);

  // Kick off once. Reanimated shared values are not React state, so starting the
  // animation during render is safe and avoids a frame of pieces at the top.
  if (progress.value === 0) {
    progress.value = withDelay(
      spec.delay,
      withTiming(1, { duration: spec.duration, easing: Easing.in(Easing.quad) }),
    );
    spin.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: SPIN_MS, easing: Easing.linear }),
        // Finite, and matched to this piece's fall — NOT an infinite repeat.
        // `active` stays true for as long as the celebration is on screen (a
        // solved puzzle until Next, a win until the result screen closes), so
        // `-1` left all 28 pieces rotating on the UI thread indefinitely, long
        // after each had faded out and translated off the bottom. Invisible, but
        // it burned battery and meant the app never reached idle — which
        // accessibility services (and `uiautomator`) block on.
        Math.max(1, Math.ceil(spec.duration / SPIN_MS)),
        false,
      ),
    );
  }

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * (height + 80) - 40 },
      { translateX: progress.value * spec.drift },
      { rotate: `${spin.value * spec.spin}deg` },
    ],
    // Fade out over the last third so pieces don't visibly clip at the bottom.
    opacity: progress.value > 0.66 ? 1 - (progress.value - 0.66) / 0.34 : 1,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: `${spec.x * 100}%`,
          width: spec.size,
          height: spec.size * 0.6,
          backgroundColor: spec.color,
          borderRadius: 1,
        },
        style,
      ]}
    />
  );
}

/**
 * Falling confetti for a win.
 *
 * Web uses canvas-confetti, which has no React Native drop-in — this is the
 * native equivalent, built from Reanimated transforms so the whole thing runs on
 * the UI thread and never competes with the JS thread for frames.
 *
 * Renders nothing when `reducedMotion` is set: this is pure celebration, exactly
 * the category that setting exists to remove.
 */
export function Confetti({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { width, height } = useWindowDimensions();

  // Colours are read here, inside render, not at module scope — the token
  // objects are live views and a module-level read freezes the palette.
  const palette = [
    COLORS.accent,
    COLORS.accentHover,
    COLORS.info,
    COLORS.successHover,
    GAME_ACCENTS.chess.base,
    GAME_ACCENTS.checkers.base,
    GAME_ACCENTS.reversi.base,
  ];

  const pieces = useMemo<PieceSpec[]>(() => {
    return Array.from({ length: PIECE_COUNT }, (_, i) => ({
      x: Math.random(),
      size: 6 + Math.random() * 7,
      delay: Math.random() * 700,
      duration: FALL_MS * (0.7 + Math.random() * 0.6),
      color: palette[i % palette.length],
      spin: 360 * (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random()),
      drift: (Math.random() - 0.5) * width * 0.3,
    }));
    // Regenerated per mount only — the parent unmounts this between games.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active || reducedMotion) return null;

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {pieces.map((spec, i) => (
        <ConfettiPiece key={i} spec={spec} height={height} />
      ))}
    </View>
  );
}
