/**
 * PlanetToken — React Native version. Same public API and geometry as
 * PlanetToken.tsx, drawn with react-native-svg from the same
 * LIQUIDATE_PLANET_STYLE tokens.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps pick this file
 * up automatically when they import { PlanetToken } from '@finesse/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { LIQUIDATE_PLANET_STYLE } from './tokens';

export interface PlanetTokenProps {
  /** Rendered size in logical pixels (square). Defaults to 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/** See PlanetToken.tsx for why the ring is drawn in two passes around the sphere. */
const RING = { cx: 50, cy: 50, rx: 46, ry: 15, tilt: -22 };
const RING_FRONT = 'M 92.65 32.77 A 46 15 -22 0 1 7.35 67.23';
const SPHERE = { cx: 48, cy: 54, r: 30 };

export function PlanetToken({ size = 40, style }: PlanetTokenProps) {
  const s = LIQUIDATE_PLANET_STYLE;
  // A constant id is safe here: each <Svg> is its own isolated document on
  // native, unlike web where these can be inlined into one page.
  const bodyId = 'liquidate-planet-body';

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={style} accessibilityLabel="planet">
      <Defs>
        <RadialGradient id={bodyId} cx="34%" cy="28%" r="80%">
          {s.body.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>

      <Ellipse
        cx={RING.cx}
        cy={RING.cy}
        rx={RING.rx}
        ry={RING.ry}
        fill="none"
        stroke={s.ringBack}
        strokeWidth={4}
        transform={`rotate(${RING.tilt} ${RING.cx} ${RING.cy})`}
      />

      <Circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r} fill={`url(#${bodyId})`} />
      <Circle
        cx={SPHERE.cx}
        cy={SPHERE.cy}
        r={SPHERE.r - 0.6}
        fill="none"
        stroke={s.border}
        strokeWidth={1.2}
      />

      <Ellipse
        cx={38}
        cy={44}
        rx={9}
        ry={6}
        fill={s.sheen}
        opacity={0.5}
        transform="rotate(-24 38 44)"
      />

      <Path d={RING_FRONT} fill="none" stroke={s.ring} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  );
}

export default PlanetToken;
