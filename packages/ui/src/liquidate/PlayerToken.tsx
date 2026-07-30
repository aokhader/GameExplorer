import React from 'react';

export interface PlayerTokenProps {
  /** Fill — the seat's colour, resolved by the caller. */
  color: string;
  /**
   * Edge colour. This is the TILE the token stands on, not a fixed dark
   * outline: a black halo reads as dirt on Tabletop's parchment and a white one
   * blows out on Command Deck, so the piece borrows its surroundings instead.
   */
  outline: string;
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
 * Takes resolved colours rather than a seat index so this package stays a leaf —
 * `packages/ui` holds tokens and art and deliberately does not depend on
 * `@gameexplorer/shared`, and each platform resolves the seat ramp its own way
 * (web through CSS variables, native through `getActiveTheme`).
 */
export const PlayerToken = React.memo(function PlayerToken({
  color,
  outline,
  width = 13,
  you = false,
  title,
}: PlayerTokenProps) {
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
      <circle cx="12" cy="6" r="5" fill={color} stroke={outline} strokeWidth="2" />
      <path
        d="M12 12c-5 0-8 3.4-8 8.5V27a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5C20 15.4 17 12 12 12Z"
        fill={color}
        stroke={outline}
        strokeWidth="2"
      />
    </svg>
  );
});

export default PlayerToken;
