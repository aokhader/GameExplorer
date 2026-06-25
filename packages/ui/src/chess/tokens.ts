/**
 * Shared design tokens for the chess board and pieces.
 * Import these in both web and mobile so colors stay identical everywhere.
 *
 * Board palette is GameExplorer's own steel-blue + gold identity — deliberately
 * distinct from Lichess (brown #f0d9b5/#b58863 + green) and chess.com (green
 * #769656/#eeeed2). Do not reintroduce those competitor values.
 */

export const BOARD_COLORS = {
  lightSquare: '#dfe6ee',
  darkSquare: '#6f88a8',
  selectedSquare: '#cda43f',
  lastMoveLight: 'rgba(205,164,63,0.40)',
  lastMoveDark: 'rgba(205,164,63,0.50)',
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
