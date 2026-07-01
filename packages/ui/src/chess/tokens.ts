/**
 * Shared design tokens for the chess board and pieces.
 * Import these in both web and mobile so colors stay identical everywhere.
 *
 * Board palette is GameExplorer's "Arcade Glow" identity — a dark blue-slate
 * board that lets the chess neon-blue accent glow around it. Deliberately
 * distinct from Lichess (brown #f0d9b5/#b58863 + green) and chess.com (green
 * #769656/#eeeed2). Do not reintroduce those competitor values.
 */

export const BOARD_COLORS = {
  lightSquare: '#445576',
  darkSquare: '#2a3550',
  selectedSquare: '#cda43f',
  lastMoveLight: 'rgba(205,164,63,0.42)',
  lastMoveDark: 'rgba(205,164,63,0.52)',
  // Legal-move hints glow teal on the dark board (was dark-on-light).
  moveIndicator: 'rgba(34,211,170,0.85)',
  moveIndicatorCapture: 'rgba(34,211,170,0.55)',
} as const;

export const PIECE_FILLS = {
  white: '#FAF9F7',
  black: '#2c1b08',
} as const;

export const PIECE_STROKES = {
  white: '#2c1b08',
  black: '#e8d5b5',
} as const;
