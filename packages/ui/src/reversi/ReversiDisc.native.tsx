/**
 * ReversiDisc — React Native version ("Game Pieces" design system, section 03).
 * Same public API and markup as ReversiDisc.tsx, drawn with react-native-svg
 * from the same REVERSI_DISC_STYLE tokens.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps automatically
 * pick up this file when they import { ReversiDisc } from '@gameexplorer/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { REVERSI_DISC_STYLE } from './tokens';

export type ReversiDiscColor = 'black' | 'white';

export interface ReversiDiscProps {
  color: ReversiDiscColor;
  /** Rendered size in logical pixels (square). Defaults to 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ReversiDisc({ color, size = 40, style }: ReversiDiscProps) {
  const s = REVERSI_DISC_STYLE[color];

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      accessibilityLabel={`${color} disc`}
    >
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0.58" stopColor={s.halo} />
          <Stop offset="1" stopColor={s.halo} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="body" cx="34%" cy="26%" r="82%">
          {s.body.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.55" stopColor={s.shade} stopOpacity={0} />
          <Stop offset="1" stopColor={s.shade} />
        </LinearGradient>
      </Defs>

      {/* Accent bloom (lime on light, shadow on dark) */}
      <Circle cx={50} cy={50} r={50} fill="url(#halo)" opacity={0.5} />

      {/* Coin body + bottom inset shade + rim */}
      <Circle cx={50} cy={50} r={41} fill="url(#body)" />
      <Circle cx={50} cy={50} r={41} fill="url(#shade)" />
      <Circle cx={50} cy={50} r={40.5} fill="none" stroke={s.border} strokeWidth={1.2} />

      {/* Top sheen */}
      <Ellipse cx={37} cy={31} rx={15} ry={9} fill={s.sheen} opacity={0.4} />
    </Svg>
  );
}

export default ReversiDisc;
