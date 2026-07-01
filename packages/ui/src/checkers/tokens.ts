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
