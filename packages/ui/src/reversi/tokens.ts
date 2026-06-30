/**
 * Reversi board + disc tokens. The felt green is pushed vivid (energetic, classic
 * Othello table) so the game surface pops — distinct from chess (steel-blue) and
 * checkers (ember). Consumed by web + mobile.
 */
export const REVERSI_BOARD_COLORS = {
  cell:            '#1f9d55',       // vivid felt green
  cellBorder:      'rgba(0,0,0,0.22)',
  boardBorder:     '#0f6b39',
  validMoveBlack:  'rgba(0,0,0,0.28)',
  validMoveWhite:  'rgba(255,255,255,0.30)',
  lastMoveRing:    'rgba(255,230,0,0.80)',
};

export const REVERSI_DISC_COLORS = {
  black: {
    fill:      '#1a1a1a',
    stroke:    '#555555',
    highlight: '#444444',
    shadow:    '#000000',
  },
  white: {
    fill:      '#f5f0e8',
    stroke:    '#aaaaaa',
    highlight: '#ffffff',
    shadow:    '#cccccc',
  },
};
