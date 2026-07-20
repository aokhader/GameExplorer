/**
 * CheckersPiece — web component ("Game Pieces" design system, section 02).
 *
 * A glossy radial-gradient disc: gold = your side, blue = opponent. A man wears
 * a dashed inner ring; a king gains the ♛ face, a solid ring, and the pink
 * promotion halo (pink is the game's accent, not a piece color). Driven by
 * CHECKERS_PIECE_STYLE — CheckersPiece.native.tsx mirrors this markup.
 */
import React from 'react';
import { CHECKERS_PIECE_STYLE } from './tokens';

export type CheckersPieceType = 'man' | 'king';
export type CheckersColor = 'white' | 'black';

export interface CheckersPieceProps {
  type: CheckersPieceType;
  color: CheckersColor;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function CheckersPiece({
  type,
  color,
  size = 45,
  className,
  style,
}: CheckersPieceProps) {
  const s = CHECKERS_PIECE_STYLE[color];
  const isKing = type === 'king';
  const halo = isKing ? CHECKERS_PIECE_STYLE.promotionHalo : s.halo;
  const bodyId = `ckp-body-${color}`;
  const haloId = `ckp-halo-${color}-${type}`;
  const shadeId = `ckp-shade-${color}`;

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
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor={halo} />
          <stop offset="100%" stopColor={halo} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={bodyId} cx="35%" cy="28%" r="80%">
          {s.body.map((stop) => (
            <stop key={stop.offset} offset={`${stop.offset * 100}%`} stopColor={stop.color} />
          ))}
        </radialGradient>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stopColor={s.shade} stopOpacity="0" />
          <stop offset="100%" stopColor={s.shade} />
        </linearGradient>
      </defs>

      {/* Accent bloom — pink promotion halo on kings */}
      <circle cx="50" cy="50" r="50" fill={`url(#${haloId})`} opacity={isKing ? 0.6 : 0.45} />

      {/* Disc body + bottom inset shade + rim */}
      <circle cx="50" cy="50" r="40" fill={`url(#${bodyId})`} />
      <circle cx="50" cy="50" r="40" fill={`url(#${shadeId})`} />
      <circle cx="50" cy="50" r="39.5" fill="none" stroke={s.border} strokeWidth="1.4" />

      {/* Top sheen */}
      <ellipse cx="38" cy="33" rx="16" ry="10" fill={s.sheen} opacity="0.35" />

      {isKing ? (
        <>
          {/* Solid crown ring + ♛ face */}
          <circle
            cx="50"
            cy="50"
            r="30"
            fill="none"
            stroke={CHECKERS_PIECE_STYLE.kingRing[color]}
            strokeWidth="2.2"
          />
          {/* Crown mark — a vector path (not a ♛ font glyph) so it renders
              identically on web + native. */}
          <path
            d="M36 61 L33 44 L42 51 L50 41 L58 51 L67 44 L64 61 Z"
            fill={s.kingGlyph}
          />
        </>
      ) : (
        /* A man is a clean disc with a dashed inner ring */
        <circle
          cx="50"
          cy="50"
          r="27"
          fill="none"
          stroke={s.ring}
          strokeWidth="2"
          strokeDasharray="6 5"
        />
      )}
    </svg>
  );
}
