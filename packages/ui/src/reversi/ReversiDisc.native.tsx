/**
 * ReversiDisc — React Native version.
 * Same public API as ReversiDisc.tsx (minus the web-only `className`).
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps automatically
 * pick up this file when they import { ReversiDisc } from '@gameexplorer/ui'.
 *
 * Colors come from the SAME shared token (REVERSI_DISC_COLORS) as the web
 * component, so both platforms render identical discs from one source of truth.
 *
 * Requires `react-native-svg` in the mobile app. This file is excluded from the
 * web typecheck via the `**/*.native.tsx` exclude in packages/ui/tsconfig.json,
 * so it adds no web dependency.
 */

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { REVERSI_DISC_COLORS } from './tokens';

export type ReversiDiscColor = 'black' | 'white';

export interface ReversiDiscProps {
  color: ReversiDiscColor;
  /** Rendered size in logical pixels (square). Defaults to 40. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ReversiDisc({ color, size = 40, style }: ReversiDiscProps) {
  const { fill, stroke, highlight, shadow } = REVERSI_DISC_COLORS[color];

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" style={style}>
      {/* Drop shadow */}
      <Circle cx={20.5} cy={21.5} r={16} fill={shadow} opacity={0.4} />
      {/* Main disc */}
      <Circle cx={20} cy={20} r={16} fill={fill} stroke={stroke} strokeWidth={1} />
      {/* Top-left sheen */}
      <Ellipse cx={15} cy={14.5} rx={6} ry={4} fill={highlight} opacity={0.35} />
    </Svg>
  );
}

export default ReversiDisc;
