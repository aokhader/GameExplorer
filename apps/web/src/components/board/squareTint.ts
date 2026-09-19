import type { CSSProperties } from 'react';

/**
 * Square-state styling for the boards that paint squares inline (checkers and
 * the tutorial diagrams; the chess board does the same in its stylesheet).
 *
 * A state is a translucent tint laid OVER the square's own colour, never
 * swapped in for it. Swapping a translucent colour into `background-color`
 * composited it over whatever sat behind the board rather than over the square,
 * so a last-move light square came out darker than a plain dark one. A
 * one-colour gradient in `background-image` sits on top of `background-color`
 * instead. The state budget itself — one hue per state, no ring, no glow — is
 * documented in `packages/ui/src/chess/tokens.ts`.
 */
export function tintedSquare(base: string, tint: string | null): CSSProperties {
  return tint
    ? { backgroundColor: base, backgroundImage: `linear-gradient(${tint}, ${tint})` }
    : { backgroundColor: base };
}

/**
 * A capture target: the square's corners, clear out to 80% of the
 * half-diagonal — past the inscribed circle, so the piece standing there is
 * never covered.
 */
export function captureCorners(color: string): string {
  return `radial-gradient(transparent 0%, transparent 79%, ${color} 80%)`;
}
