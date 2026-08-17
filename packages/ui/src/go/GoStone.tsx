/**
 * GoStone — web component.
 *
 * A convex slate/clamshell stone. Sibling of ReversiDisc but deliberately not
 * the same art: a Go stone is domed rather than a flat coin, so the highlight is
 * small, tight and high, and the body gradient falls off much faster. That is
 * what tells the two games' pieces apart at icon size.
 *
 * Colours resolve through `var(--gx-go-stone-…, <token>)` so a web theme can
 * recolour them from CSS, with the shared token as the fallback — the same
 * contract ChessPiece and ReversiDisc use. GoStone.native.tsx mirrors this
 * markup with react-native-svg.
 */
import React from 'react';
import { GO_STONE_STYLE } from './tokens';

export type GoStoneColor = 'black' | 'white';

export interface GoStoneProps {
  color: GoStoneColor;
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function GoStone({ color, size = 40, className, style }: GoStoneProps) {
  const s = GO_STONE_STYLE[color];
  const v = (slot: string, fallback: string) => `var(--gx-go-stone-${color}-${slot}, ${fallback})`;
  const bodyId = `go-body-${color}`;
  const shadeId = `go-shade-${color}`;

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`${color} stone`}
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    >
      <defs>
        <radialGradient id={bodyId} cx="38%" cy="30%" r="78%">
          {s.body.map((stop, i) => (
            <stop
              key={stop.offset}
              offset={`${stop.offset * 100}%`}
              stopColor={v(`${i + 1}`, stop.color)}
            />
          ))}
        </radialGradient>
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="50%" stopColor={v('shade', s.shade)} stopOpacity="0" />
          <stop offset="100%" stopColor={v('shade', s.shade)} />
        </linearGradient>
      </defs>

      <circle cx="50" cy="50" r="46" fill={`url(#${bodyId})`} />
      <circle cx="50" cy="50" r="46" fill={`url(#${shadeId})`} />
      <circle cx="50" cy="50" r="45.4" fill="none" stroke={v('border', s.border)} strokeWidth="1.2" />

      {/* The tight, high specular of a domed stone. */}
      <ellipse cx="36" cy="30" rx="11" ry="7" fill={v('sheen', s.sheen)} opacity="0.55" transform="rotate(-24 36 30)" />
    </svg>
  );
}
