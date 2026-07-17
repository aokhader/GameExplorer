/**
 * Shared design tokens for the checkers board and pieces.
 *
 * "Arcade Glow" checkers: the same dark blue-slate arcade board as chess, but
 * framed by checkers' hot-pink signature glow (see GAME_ACCENTS) so the two
 * games never read alike. Discs are neon — warm gold vs electric blue — and jump
 * hints glow pink. Gold stays the shared selection/last-move brand. Pieces only
 * ever sit on dark squares, so both disc fills read with strong contrast on the
 * dark tone. Import in web + mobile.
 */

export const CHECKERS_BOARD_COLORS = {
  lightSquare: '#445576',          // arcade blue-slate (light)
  darkSquare:  '#2a3550',          // arcade blue-slate (dark)
  selectedSquare: '#cda43f',       // gold (shared brand)
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark:  'rgba(205,164,63,0.52)',
  moveIndicator: 'rgba(236,72,153,0.85)',   // pink hint on the dark board
  captureIndicator: 'rgba(236,72,153,0.75)',
};

export const CHECKERS_PIECE_COLORS = {
  white: {
    fill:      '#f4d270',          // warm gold disc
    stroke:    '#8a6a1f',
    highlight: '#fff4d6',
    shadow:    '#5a3f10',
  },
  black: {
    fill:      '#3b82f6',          // electric blue disc
    stroke:    '#1e40af',
    highlight: '#bcd6ff',
    shadow:    '#0b1120',
  },
};

/**
 * "Game Pieces" design system — checkers discs (design doc `Game
 * Pieces.dc.html`, section 02). Gold = your side, blue = opponent; a man is a
 * clean gradient disc with a dashed inner ring, a king gains the ♛ face, a
 * solid ring, and the pink promotion halo (pink is the game's accent, not a
 * piece color). Consumed by both CheckersPiece variants.
 */
export const CHECKERS_PIECE_STYLE = {
  white: {
    // radial-gradient(circle at 35% 28%, #fbe39a, #b8923a 74%)
    body: [
      { offset: 0, color: '#fbe39a' },
      { offset: 0.74, color: '#b8923a' },
      { offset: 1, color: '#a07c2d' },
    ],
    border: 'rgba(255,255,255,0.32)',
    ring: 'rgba(90,63,16,0.4)',
    kingGlyph: '#5a3f10',
    halo: 'rgba(205,164,63,0.9)',
    sheen: 'rgba(255,255,255,0.5)',
    shade: 'rgba(0,0,0,0.4)',
  },
  black: {
    // radial-gradient(circle at 35% 28%, #8bbaff, #2563eb 74%)
    body: [
      { offset: 0, color: '#8bbaff' },
      { offset: 0.74, color: '#2563eb' },
      { offset: 1, color: '#1d4fc4' },
    ],
    border: 'rgba(255,255,255,0.28)',
    ring: 'rgba(255,255,255,0.28)',
    kingGlyph: '#ffffff',
    halo: 'rgba(59,130,246,0.85)',
    sheen: 'rgba(255,255,255,0.35)',
    shade: 'rgba(0,0,0,0.45)',
  },
  /** Crowned pieces glow pink — the checkers signature accent. */
  promotionHalo: 'rgba(236,72,153,0.55)',
  /** King ring reads brighter than the man's dashed ring. */
  kingRing: { white: 'rgba(90,63,16,0.4)', black: 'rgba(255,209,236,0.55)' },
} as const;
