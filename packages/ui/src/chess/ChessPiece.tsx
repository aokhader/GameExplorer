/**
 * ChessPiece — web component ("Game Pieces" design system, section 01,
 * July 17 revision).
 *
 * The classic filled glyph at play scale with a vertical metallic gradient
 * clipped to the glyph itself — no medallion tile. Light side: white→silver;
 * dark side: slate→ink with a light-blue outline stroke so it reads on dark
 * squares. Pure SVG driven by CHESS_PIECE_STYLE — no image assets.
 * ChessPiece.native.tsx mirrors this markup; keep the two in step.
 */

import React from 'react';
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
 * Per-rank glyph scale in the 100-unit viewBox — the design's cell ratios
 * (98/88/92/80 px glyphs in a 116px cell).
 */
const GLYPH_SIZE: Record<PieceType, number> = {
  king: 84,
  queen: 84,
  rook: 76,
  bishop: 79,
  knight: 79,
  pawn: 69,
};

export interface ChessPieceProps {
  type: PieceType;
  color: PieceColor;
  /**
   * Rendered size. Pass a pixel number (e.g. 45) or a CSS string such as
   * "100%" to fill the containing element. Defaults to 45.
   */
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function ChessPiece({ type, color, size = 45, className, style }: ChessPieceProps) {
  const s = CHESS_PIECE_STYLE[color];
  const glyph = PIECE_GLYPHS[type];
  const fontSize = GLYPH_SIZE[type];
  // Same-side pieces share identical defs, so cross-instance id collisions on
  // one page resolve to an identical gradient — only the side must differ.
  const fillId = `cpx-fill-${color}`;

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${color} ${type}`}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    >
      <defs>
        {/* Vertical metallic gradient over the glyph's own bounding box —
            the SVG equivalent of the design's background-clip:text. */}
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          {s.fill.map((stop) => (
            <stop key={stop.offset} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </linearGradient>
      </defs>

      <text
        x="50"
        y="52"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fill={`url(#${fillId})`}
        stroke={s.stroke ?? undefined}
        strokeWidth={s.stroke ? 1 : undefined}
        style={{ userSelect: 'none' }}
      >
        {glyph}
      </text>
    </svg>
  );
}

export default ChessPiece;
