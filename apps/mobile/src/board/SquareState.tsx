import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * The square-state layer for the chess and checkers boards — the native half of
 * the state budget in `packages/ui/src/chess/tokens.ts`: one translucent hue per
 * state, laid over the square, with no ring, glow or motion.
 *
 * Each piece here draws *over* the square's own colour rather than replacing it.
 * The boards used to swap a translucent tint in as the square's background, which
 * composited it over the board container's dark-square fill — so a last-move
 * light square came out as a dark square with gold on it.
 *
 * Colours are passed in rather than read here, so the boards keep reading their
 * live token views during render (see the frozen-token rule in
 * `project-docs/spec-v7/04-design-system.md`).
 */

/** A flat tint over the whole square. */
export function SquareTint({ size, color }: { size: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, backgroundColor: color }}
    />
  );
}

/**
 * A radial fill over the square, sized like CSS's default `radial-gradient()` on
 * a square box (a circle out to the corners), so these match the web board's
 * stylesheet stop for stop.
 */
function RadialSquare({
  id,
  size,
  stops,
}: {
  id: string;
  size: number;
  stops: { offset: number; color: string; opacity?: number }[];
}) {
  const half = size / 2;
  return (
    <Svg
      pointerEvents="none"
      width={size}
      height={size}
      style={{ position: 'absolute', left: 0, top: 0 }}
    >
      <Defs>
        <RadialGradient id={id} cx={half} cy={half} r={half * Math.SQRT2} gradientUnits="userSpaceOnUse">
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity ?? 1} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * A capture target: the square's corners, clear out to 80% of the
 * half-diagonal. That is past the inscribed circle, so the piece standing there
 * is never covered — only the corners take the tint.
 */
export function CaptureCorners({ id, size, color }: { id: string; size: number; color: string }) {
  return (
    <RadialSquare
      id={id}
      size={size}
      stops={[
        { offset: 0, color, opacity: 0 },
        { offset: 0.79, color, opacity: 0 },
        { offset: 0.8, color },
        { offset: 1, color },
      ]}
    />
  );
}

/**
 * Check — a still red radial under the king, solid at the centre and clear
 * before the square's edge. Nothing else marks it and nothing moves.
 */
export function CheckMarker({ id, size, color }: { id: string; size: number; color: string }) {
  return (
    <RadialSquare
      id={id}
      size={size}
      stops={[
        { offset: 0, color },
        { offset: 0.25, color, opacity: 0.8 },
        { offset: 0.89, color, opacity: 0 },
      ]}
    />
  );
}
