import type { ReactNode } from 'react';
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { timing } from '@/theme/motion';

/*
 * What a dragged piece looks like under a finger — the chess and checkers
 * boards share it.
 *
 * The problem is the thumb: a piece drawn under the finger at its resting size
 * is hidden by the finger moving it. So the piece under drag is drawn at 2× —
 * big enough to read beside a fingertip — and carried with its centre one square
 * ABOVE the finger, where the thumb can't cover it. The square the finger is
 * over gets a translucent disc two squares across: a square-sized highlight
 * would sit under the thumb too, while a disc twice that size shows around it.
 * The drop square is still the one under the finger — the disc says which.
 *
 * Touch-only by design: a mouse pointer hides nothing, and web's boards keep
 * their dragged piece at its resting size. So these live beside the mobile
 * boards, not in the shared tokens.
 */

/** The dragged piece's size, as a multiple of a square. */
export const DRAG_FEEDBACK_SCALE = 2;
/** How far above the finger the dragged piece's centre rides, in squares. */
export const DRAG_FEEDBACK_LIFT_SQUARES = 1;
/** The hover disc's radius, in squares — a disc two squares across. */
export const DRAG_TARGET_RADIUS_SQUARES = 1;

/**
 * The lift: the piece grows from its resting size to `DRAG_FEEDBACK_SCALE` and
 * rises off the finger over `micro` (motion-spec §5.12). Built once here because
 * it runs inside the Pan's worklet, which can capture a config but cannot call
 * the helper. MOTION is not themed, so this is not the frozen-token trap.
 */
export const DRAG_LIFT = timing('micro', 'out');

/**
 * The piece being dragged, drawn above the board.
 *
 * The box is the FINAL size and the art inside it is drawn at that size, then
 * scaled down to 1× at rest: scaling a view up rasterises its content at the
 * smaller size first, which would blur the vector pieces exactly when they are
 * largest. `lift` (0→1) drives the growth and the rise together, so the piece
 * leaves the finger as it grows rather than jumping above it.
 *
 * Position is the finger itself (board px, shared values written by the Pan's
 * worklet), so nothing here waits on the JS thread once the piece is up.
 */
export function DragGhost({
  sq,
  fingerX,
  fingerY,
  lift,
  children,
}: {
  /** One square's edge, px. */
  sq: number;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  /** 0 = resting size under the finger, 1 = full size, lifted. */
  lift: SharedValue<number>;
  /** The piece art, drawn at `sq * DRAG_FEEDBACK_SCALE * pieceRatio`. */
  children: ReactNode;
}) {
  const box = sq * DRAG_FEEDBACK_SCALE;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: fingerX.value - box / 2 },
      { translateY: fingerY.value - box / 2 - lift.value * DRAG_FEEDBACK_LIFT_SQUARES * sq },
      { scale: interpolate(lift.value, [0, 1], [1 / DRAG_FEEDBACK_SCALE, 1]) },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: box,
          height: box,
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 60,
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * The disc under the square the finger is over, while a piece is dragged.
 *
 * Always mounted and positioned entirely on the UI thread, so crossing a square
 * costs no React render. It snaps to square centres using the same mapping the
 * drop uses (`floor(finger / sq)`), which is what makes it an honest preview of
 * where the piece will land. It shows on every square, legal or not: the move
 * dots already say which squares are legal; this says where the finger is. Off
 * the board it hides, because a release there puts the piece back.
 *
 * `color` is read from a live token by the caller during render and passed in;
 * a worklet that read the token itself would freeze the theme it first saw.
 */
export function DragTarget({
  sq,
  size,
  color,
  fingerX,
  fingerY,
  active,
}: {
  /** One square's edge, px. */
  sq: number;
  /** The board's edge, px — the disc hides once the finger leaves it. */
  size: number;
  color: string;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
  /** 1 while a piece is actually held (set by the board's JS once it grabs). */
  active: SharedValue<number>;
}) {
  const r = sq * DRAG_TARGET_RADIUS_SQUARES;
  const style = useAnimatedStyle(() => {
    const x = fingerX.value;
    const y = fingerY.value;
    const inside = x >= 0 && y >= 0 && x < size && y < size;
    const col = Math.floor(x / sq);
    const row = Math.floor(y / sq);
    return {
      opacity: active.value > 0 && inside ? 1 : 0,
      transform: [
        { translateX: (col + 0.5) * sq - r },
        { translateY: (row + 0.5) * sq - r },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: r * 2,
          height: r * 2,
          borderRadius: r,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** True when a board-space point lies on the board. Off it, a drop is a cancel. */
export function isOnBoard(x: number, y: number, size: number): boolean {
  return x >= 0 && y >= 0 && x < size && y < size;
}
