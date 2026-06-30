/**
 * Shared design tokens for the checkers board and pieces.
 *
 * The board wears checkers' own warm "ember" identity (a wooden-draughts feel),
 * deliberately distinct from chess's cool steel-blue so the two games never look
 * alike — and original (not Lichess / chess.com). The dark squares tie to the
 * `ember` per-game accent in tokens.ts; gold stays the shared selection/last-move
 * brand colour. Pieces only ever sit on dark squares, so both piece fills read
 * with strong contrast on the ember tone. Import in web + mobile.
 */

export const CHECKERS_BOARD_COLORS = {
  lightSquare: '#ecd6b0',          // warm sand
  darkSquare:  '#b25e3c',          // deepened ember / walnut
  selectedSquare: '#cda43f',       // gold (shared brand)
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark:  'rgba(205,164,63,0.52)',
  moveIndicator: 'rgba(0,0,0,0.22)',
  captureIndicator: 'rgba(0,0,0,0.34)',
};

export const CHECKERS_PIECE_COLORS = {
  white: {
    fill:      '#faf0e0',
    stroke:    '#5c3d1e',
    highlight: '#ffffff',
    shadow:    '#c8b49a',
  },
  black: {
    fill:      '#2c1b08',
    stroke:    '#e8d5b7',
    highlight: '#5c4033',
    shadow:    '#1a0f08',
  },
};
