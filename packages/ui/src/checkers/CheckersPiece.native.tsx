/**
 * CheckersPiece — React Native version.
 * Same public API as CheckersPiece.tsx (minus the web-only `className`).
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps automatically
 * pick up this file when they import { CheckersPiece } from '@gameexplorer/ui'.
 *
 * Colors come from the SAME shared token (CHECKERS_PIECE_COLORS) as the web
 * component, so both platforms render identical pieces from one source of truth.
 *
 * Requires `react-native-svg` in the mobile app (it is the standard SVG runtime
 * for React Native; this file is excluded from the web typecheck via the
 * `**/*.native.tsx` exclude in packages/ui/tsconfig.json, so it adds no web dep).
 */

import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { CHECKERS_PIECE_COLORS } from './tokens';

export type CheckersPieceType = 'man' | 'king';
export type CheckersColor = 'white' | 'black';

export interface CheckersPieceProps {
  type: CheckersPieceType;
  color: CheckersColor;
  /** Rendered size in logical pixels (square). Defaults to 45. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function CheckersPiece({ type, color, size = 45, style }: CheckersPieceProps) {
  const { fill, stroke, highlight, shadow } = CHECKERS_PIECE_COLORS[color];

  return (
    <Svg width={size} height={size} viewBox="0 0 45 45" style={style}>
      {/* Drop shadow */}
      <Circle cx={23} cy={24.5} r={17} fill={shadow} opacity={0.35} />

      {/* Main disc */}
      <Circle cx={22.5} cy={22} r={17} fill={fill} stroke={stroke} strokeWidth={1.5} />

      {/* Highlight sheen (top-left quadrant) */}
      <Ellipse cx={17} cy={16.5} rx={6.5} ry={4.5} fill={highlight} opacity={0.35} />

      {/* King indicator: inner ring */}
      {type === 'king' && (
        <Circle
          cx={22.5}
          cy={22}
          r={11}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          opacity={0.8}
        />
      )}
    </Svg>
  );
}

export default CheckersPiece;
