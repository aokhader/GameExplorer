/**
 * ReversiDisc — web component ("Game Pieces" design system, section 03).
 *
 * A glossy convex coin with two faces: the light face wears the lime accent
 * bloom, the dark face sits in its own shadow. Driven by REVERSI_DISC_STYLE —
 * ReversiDisc.native.tsx mirrors this markup; the flip animation lives in the
 * boards.
 *
 * Colors resolve through `var(--gx-reversi-disc-…, <token>)` so a web theme can
 * recolor the coins from CSS; the token is the fallback. See ChessPiece.tsx.
 */
import React from 'react';
import { REVERSI_DISC_STYLE } from './tokens';

export type ReversiDiscColor = 'black' | 'white';

export interface ReversiDiscProps {
  color: ReversiDiscColor;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function ReversiDisc({ color, size = 40, className, style }: ReversiDiscProps) {
  const s = REVERSI_DISC_STYLE[color];
  /** Themeable slot: the CSS var if a theme defines it, else the shared token. */
  const v = (slot: string, fallback: string) =>
    `var(--gx-reversi-disc-${color}-${slot}, ${fallback})`;
  const bodyId = `rvd-body-${color}`;
  const haloId = `rvd-halo-${color}`;
  const shadeId = `rvd-shade-${color}`;

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${color} disc`}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    >
      <defs>
        <radialGradient id={haloId} cx="50%" cy="50%" r="50%">
          <stop offset="58%" stopColor={v('halo', s.halo)} />
          <stop offset="100%" stopColor={v('halo', s.halo)} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={bodyId} cx="34%" cy="26%" r="82%">
          {s.body.map((stop, i) => (
            <stop
              key={stop.offset}
              offset={`${stop.offset * 100}%`}
              stopColor={v(`${i + 1}`, stop.color)}
            />
          ))}
        </radialGradient>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="55%" stopColor={v('shade', s.shade)} stopOpacity="0" />
          <stop offset="100%" stopColor={v('shade', s.shade)} />
        </linearGradient>
      </defs>

      {/* Accent bloom (lime on light, shadow on dark) */}
      <circle cx="50" cy="50" r="50" fill={`url(#${haloId})`} opacity="0.5" />

      {/* Coin body + bottom inset shade + rim */}
      <circle cx="50" cy="50" r="41" fill={`url(#${bodyId})`} />
      <circle cx="50" cy="50" r="41" fill={`url(#${shadeId})`} />
      <circle cx="50" cy="50" r="40.5" fill="none" stroke={v('border', s.border)} strokeWidth="1.2" />

      {/* Top sheen */}
      <ellipse cx="37" cy="31" rx="15" ry="9" fill={v('sheen', s.sheen)} opacity="0.4" />
    </svg>
  );
}
