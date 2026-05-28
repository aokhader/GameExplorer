/**
 * Shared design tokens for the chess board and pieces.
 * Import these in both web and mobile so colors stay identical everywhere.
 */

export const BOARD_COLORS = {
  lightSquare: '#f0d9b5',
  darkSquare: '#b58863',
  selectedSquare: '#baca44',
  lastMoveLight: 'rgba(155,199,0,0.41)',
  lastMoveDark: 'rgba(155,199,0,0.51)',
  moveIndicator: 'rgba(0,0,0,0.15)',
  moveIndicatorCapture: 'rgba(0,0,0,0.35)',
} as const;

export const PIECE_FILLS = {
  white: '#FAF9F7',
  black: '#2c1b08',
} as const;

export const PIECE_STROKES = {
  white: '#2c1b08',
  black: '#e8d5b5',
} as const;
