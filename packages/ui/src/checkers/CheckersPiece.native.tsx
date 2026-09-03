/**
 * CheckersPiece — React Native version ("Game Pieces" design system, section
 * 02). Same public API and markup as CheckersPiece.tsx, drawn with
 * react-native-svg from the same CHECKERS_PIECE_STYLE tokens.
 *
 * Metro resolves *.native.tsx before *.tsx, so React Native apps automatically
 * pick up this file when they import { CheckersPiece } from '@finesse/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { CHECKERS_PIECE_STYLE } from './tokens';

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
  const s = CHECKERS_PIECE_STYLE[color];
  const isKing = type === 'king';
  const halo = isKing ? CHECKERS_PIECE_STYLE.promotionHalo : s.halo;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      accessibilityLabel={`${color} ${type}`}
    >
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
          <Stop offset="0.55" stopColor={halo} />
          <Stop offset="1" stopColor={halo} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="body" cx="35%" cy="28%" r="80%">
          {s.body.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
        <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.55" stopColor={s.shade} stopOpacity={0} />
          <Stop offset="1" stopColor={s.shade} />
        </LinearGradient>
      </Defs>

      {/* Accent bloom — pink promotion halo on kings */}
      <Circle cx={50} cy={50} r={50} fill="url(#halo)" opacity={isKing ? 0.6 : 0.45} />

      {/* Disc body + bottom inset shade + rim */}
      <Circle cx={50} cy={50} r={40} fill="url(#body)" />
      <Circle cx={50} cy={50} r={40} fill="url(#shade)" />
      <Circle cx={50} cy={50} r={39.5} fill="none" stroke={s.border} strokeWidth={1.4} />

      {/* Top sheen */}
      <Ellipse cx={38} cy={33} rx={16} ry={10} fill={s.sheen} opacity={0.35} />

      {isKing ? (
        <>
          {/* Solid crown ring + ♛ face */}
          <Circle
            cx={50}
            cy={50}
            r={30}
            fill="none"
            stroke={CHECKERS_PIECE_STYLE.kingRing[color]}
            strokeWidth={2.2}
          />
          {/* Crown mark — a vector path (not a ♛ font glyph) so it renders
              identically on web + native. */}
          <Path d="M36 61 L33 44 L42 51 L50 41 L58 51 L67 44 L64 61 Z" fill={s.kingGlyph} />
        </>
      ) : (
        /* A man is a clean disc with a dashed inner ring */
        <Circle
          cx={50}
          cy={50}
          r={27}
          fill="none"
          stroke={s.ring}
          strokeWidth={2}
          strokeDasharray="6 5"
        />
      )}
    </Svg>
  );
}

export default CheckersPiece;
