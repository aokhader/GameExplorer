'use client';

import React from 'react';
import { seatColor } from './theme';

export interface PlayerTokenProps {
  /** Seat index — picks the colour from the shared seat ramp. */
  seat: number;
  /** Token width in px; height follows the 24:30 aspect. */
  width?: number;
  /** Rings the token this device is following, so it can be picked out instantly. */
  you?: boolean;
  title?: string;
}

/**
 * A player's piece — a pawn, drawn as SVG paths.
 *
 * Vector rather than an emoji or font glyph, for the same reason the chess
 * pieces were migrated off Unicode: a glyph is at the mercy of each platform's
 * font substitution, while paths render identically everywhere.
 *
 * The stroke is the TILE colour rather than a fixed dark outline, so the token
 * keeps a clean edge on both themes — a black halo would read as dirt on
 * Tabletop's parchment, and a white one would blow out on Command Deck.
 */
export const PlayerToken = React.memo(function PlayerToken({
  seat,
  width = 13,
  you = false,
  title,
}: PlayerTokenProps) {
  const color = seatColor(seat);
  const height = Math.round((width / 24) * 30);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 30"
      fill="none"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))',
        overflow: 'visible',
      }}
    >
      {/* A soft halo behind your own piece — seat colours alone are not enough
          to find yourself on a six-player board at a glance. */}
      {you && <circle cx="12" cy="15" r="15" fill={color} opacity={0.3} />}
      <circle cx="12" cy="6" r="5" fill={color} stroke="var(--c-liquidate-tile, #111a2b)" strokeWidth="2" />
      <path
        d="M12 12c-5 0-8 3.4-8 8.5V27a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5C20 15.4 17 12 12 12Z"
        fill={color}
        stroke="var(--c-liquidate-tile, #111a2b)"
        strokeWidth="2"
      />
    </svg>
  );
});
