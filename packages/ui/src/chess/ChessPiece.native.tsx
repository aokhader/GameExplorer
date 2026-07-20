/**
 * ChessPiece — React Native version ("Game Pieces" design system, section 01).
 * Same public API and markup as ChessPiece.tsx, drawn with react-native-svg from
 * the same PIECE_PATHS shapes and CHESS_PIECE_STYLE colors.
 *
 * Real vector paths (no Unicode font glyph) so the piece renders pixel-identical
 * to web with no font substitution. Metro resolves *.native.tsx before *.tsx, so
 * React Native apps automatically pick up this file when they import from
 * '@gameexplorer/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { CHESS_PIECE_STYLE } from './tokens';
import { PIECE_PATHS, PIECE_VIEWBOX } from './piecePaths';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /** Rendered size in logical pixels (square). Defaults to 45. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ChessPiece({ type, color, size = 45, style }: ChessPieceProps) {
  const s = CHESS_PIECE_STYLE[color];
  const paths = PIECE_PATHS[type];

  return (
    <Svg
      width={size}
      height={size}
      viewBox={PIECE_VIEWBOX}
      style={style}
      accessibilityLabel={`${color} ${type}`}
    >
      <Defs>
        {/* One vertical metallic gradient spanning the whole piece (userSpaceOnUse
            so every body path shares it). Each <Svg> is its own document, so the
            constant id can't collide across pieces. */}
        <LinearGradient id="fill" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="3900">
          {s.fill.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </LinearGradient>
      </Defs>

      {/* Silhouette — metallic gradient (+ light-blue outline on the dark side) */}
      {paths.body.map((d, i) => (
        <Path
          key={`b${i}`}
          d={d}
          fill="url(#fill)"
          stroke={s.stroke ?? undefined}
          strokeWidth={s.stroke ? s.strokeWidth : undefined}
          strokeLinejoin="round"
        />
      ))}
      {/* Engraved detail lines painted over the body */}
      {paths.detail.map((d, i) => (
        <Path key={`d${i}`} d={d} fill={s.detail} />
      ))}
    </Svg>
  );
}

export default ChessPiece;
