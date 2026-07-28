/**
 * ChessPiece — web component ("Game Pieces" design system, section 01).
 *
 * A classic chess piece drawn as real vector paths (no Unicode font glyph, so it
 * renders pixel-identical on web + iOS + Android). The silhouette is filled with
 * a vertical metallic gradient — white→silver on the light side, slate→ink with a
 * light-blue outline on the dark side — and engraved detail lines sit on top in a
 * contrasting tone. Shapes come from `piecePaths.ts`, colors from
 * `CHESS_PIECE_STYLE`. ChessPiece.native.tsx mirrors this markup; keep them in step.
 *
 * Every color goes through `var(--gx-chess-piece-…, <token>)` so a web theme can
 * recolor the set from CSS with no prop drilling — the token stays the fallback,
 * so the component is still correct on its own. Native has no themes and reads
 * the tokens directly.
 */

import React from 'react';
import { CHESS_PIECE_STYLE } from './tokens';
import { PIECE_PATHS, PIECE_VIEWBOX } from './piecePaths';

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';

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
  const paths = PIECE_PATHS[type];
  /** Themeable slot: the CSS var if a theme defines it, else the shared token. */
  const v = (slot: string, fallback: string) =>
    `var(--gx-chess-piece-${color}-${slot}, ${fallback})`;
  // Unique per instance so the userSpaceOnUse gradient never collides across the
  // 32 piece SVGs on a board.
  const rawId = React.useId();
  const fillId = `cp-fill-${rawId}`;

  return (
    <svg
      viewBox={PIECE_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${color} ${type}`}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    >
      <defs>
        {/* One vertical metallic gradient spanning the whole piece (userSpaceOnUse
            so every body path shares it, not one gradient per path). */}
        <linearGradient id={fillId} gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="3900">
          {s.fill.map((stop, i) => (
            <stop
              key={stop.offset}
              offset={`${stop.offset * 100}%`}
              stopColor={v(`${i + 1}`, stop.color)}
            />
          ))}
        </linearGradient>
      </defs>

      {/* Silhouette — metallic gradient (+ an outline where the theme wants one).
          Stroke goes through `style`, not the presentation attributes, because a
          CSS var is only resolved as a property; the light Arcade side has no
          outline, so its fallbacks are `transparent`/`0`. */}
      {paths.body.map((d, i) => (
        <path
          key={`b${i}`}
          d={d}
          fill={`url(#${fillId})`}
          strokeLinejoin="round"
          style={{
            stroke: v('stroke', s.stroke ?? 'transparent'),
            strokeWidth: v('stroke-width', s.stroke ? String(s.strokeWidth) : '0'),
          }}
        />
      ))}
      {/* Engraved detail lines painted over the body */}
      {paths.detail.map((d, i) => (
        <path key={`d${i}`} d={d} fill={v('detail', s.detail)} />
      ))}
    </svg>
  );
}

export default ChessPiece;
