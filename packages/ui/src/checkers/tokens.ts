/**
 * Shared design tokens for the checkers board and pieces.
 * Board palette mirrors the chess board — GameExplorer's own steel-blue + gold
 * identity, deliberately distinct from Lichess / chess.com. Import in web + mobile.
 */

export const CHECKERS_BOARD_COLORS = {
  lightSquare: '#dfe6ee',
  darkSquare:  '#6f88a8',
  selectedSquare: '#cda43f',
  lastMoveLight: 'rgba(205,164,63,0.40)',
  lastMoveDark:  'rgba(205,164,63,0.50)',
  moveIndicator: 'rgba(0,0,0,0.18)',
  captureIndicator: 'rgba(0,0,0,0.32)',
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
