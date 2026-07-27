'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS } from '@gameexplorer/ui';

export interface ShipTokenProps {
  /** Seat index — picks the colour from the shared seat ramp. */
  seat: number;
  size?: number;
  /** Lifts the active player's ship above the rest. */
  active?: boolean;
  title?: string;
}

/**
 * A player's ship — an original arrowhead hull drawn as SVG paths.
 *
 * Vector rather than an emoji or font glyph, for the same reason the chess
 * pieces were migrated off Unicode in v4.24: a glyph is at the mercy of each
 * platform's font substitution, while paths render identically everywhere.
 * Deliberately abstract, sharing nothing with any existing game's token set.
 */
export const ShipToken = React.memo(function ShipToken({
  seat,
  size = 14,
  active = false,
  title,
}: ShipTokenProps) {
  const color = LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length];
  const id = `ship-${seat}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{
        filter: active ? `drop-shadow(0 0 4px ${color})` : 'drop-shadow(0 1px 1px rgba(0,0,0,0.7))',
        overflow: 'visible',
      }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.85} />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity={0.75} />
        </linearGradient>
      </defs>
      {/* Hull: a swept arrowhead with a notched tail. */}
      <path
        d="M12 2 L20 19 L12 15.5 L4 19 Z"
        fill={`url(#${id})`}
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      {/* Cockpit. */}
      <circle cx="12" cy="10" r="2" fill="rgba(255,255,255,0.9)" />
    </svg>
  );
});
