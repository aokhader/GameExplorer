/**
 * GoStone — React Native version. Same public API and markup as GoStone.tsx,
 * drawn with react-native-svg from the same GO_STONE_STYLE tokens.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps pick this file
 * up automatically when they import { GoStone } from '@finesse/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { GO_STONE_STYLE } from './tokens';

export type GoStoneColor = 'black' | 'white';

export interface GoStoneProps {
  color: GoStoneColor;
  /** Rendered size in logical pixels (square). Defaults to 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function GoStone({ color, size = 40, style }: GoStoneProps) {
  const s = GO_STONE_STYLE[color];
  // Ids are suffixed by colour: a Go board draws both colours at once, and a
  // shared id would be ambiguous the moment these are ever inlined into one
  // document rather than one <Svg> each.
  const bodyId = `go-body-${color}`;
  const shadeId = `go-shade-${color}`;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      accessibilityLabel={`${color} stone`}
    >
      <Defs>
        <RadialGradient id={bodyId} cx="38%" cy="30%" r="78%">
          {s.body.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
        <LinearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.5" stopColor={s.shade} stopOpacity={0} />
          <Stop offset="1" stopColor={s.shade} />
        </LinearGradient>
      </Defs>

      <Circle cx={50} cy={50} r={46} fill={`url(#${bodyId})`} />
      <Circle cx={50} cy={50} r={46} fill={`url(#${shadeId})`} />
      <Circle cx={50} cy={50} r={45.4} fill="none" stroke={s.border} strokeWidth={1.2} />

      {/* The tight, high specular of a domed stone. */}
      <Ellipse
        cx={36}
        cy={30}
        rx={11}
        ry={7}
        fill={s.sheen}
        opacity={0.55}
        transform="rotate(-24 36 30)"
      />
    </Svg>
  );
}

export default GoStone;
