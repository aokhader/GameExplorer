/**
 * ChessPiece — React Native version ("Game Pieces" design system, section 01,
 * July 17 revision). Same public API and markup as ChessPiece.tsx, drawn with
 * react-native-svg from the same CHESS_PIECE_STYLE tokens.
 *
 * The classic filled glyph at play scale with a vertical metallic gradient
 * clipped to the glyph — no medallion tile. Metro resolves *.native.tsx before
 * *.tsx, so React Native apps automatically pick up this file when they import
 * from '@gameexplorer/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { CHESS_PIECE_STYLE } from './tokens';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

/** Classic filled glyphs for both sides — the gradient fill carries the side. */
export const PIECE_GLYPHS: Record<PieceType, string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};

/**
 * Per-rank glyph scale in the 100-unit viewBox. Sized so the glyph fills the
 * board square the way the design's in-play board does (≈44px glyph in a 48px
 * cell), keeping the design's per-rank proportions so ranks stay balanced. The
 * headroom left at the top of the viewBox clears the king/queen crosses and the
 * dark side's outline stroke.
 */
const GLYPH_SIZE: Record<PieceType, number> = {
  king: 92,
  queen: 92,
  rook: 84,
  bishop: 88,
  knight: 88,
  pawn: 80,
};

/**
 * Per-type vertical stretch. The pawn glyph is squat, so centered it leaves a
 * gap under it; stretching it vertically around a high anchor (`originY`) keeps
 * its head roughly in place and grows the base downward, seating it nearer the
 * bottom of the square. `scaleY` 1 leaves a glyph untouched.
 */
const GLYPH_STRETCH: Partial<Record<PieceType, { scaleY: number; originY: number }>> = {
  pawn: { scaleY: 1.2, originY: 30 },
};

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /** Rendered size in logical pixels (square). Defaults to 45. */
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function ChessPiece({ type, color, size = 45, style }: ChessPieceProps) {
  const s = CHESS_PIECE_STYLE[color];
  const glyph = PIECE_GLYPHS[type];
  const fontSize = GLYPH_SIZE[type];
  const stretch = GLYPH_STRETCH[type];
  // Scale vertically about (50, originY) so the stretch grows downward.
  const transform = stretch
    ? `translate(50 ${stretch.originY}) scale(1 ${stretch.scaleY}) translate(-50 ${-stretch.originY})`
    : undefined;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      accessibilityLabel={`${color} ${type}`}
    >
      <Defs>
        {/* Vertical metallic gradient over the glyph's own bounding box —
            the SVG equivalent of the design's background-clip:text. */}
        <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          {s.fill.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </LinearGradient>
      </Defs>

      <SvgText
        x={50}
        y={52}
        textAnchor="middle"
        alignmentBaseline="central"
        fontSize={fontSize}
        fill="url(#fill)"
        stroke={s.stroke ?? undefined}
        strokeWidth={s.stroke ? 1 : undefined}
        transform={transform}
      >
        {glyph}
      </SvgText>
    </Svg>
  );
}

export default ChessPiece;
