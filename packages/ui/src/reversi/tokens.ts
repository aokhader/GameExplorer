/**
 * Reversi board + disc tokens. "Arcade Glow" reversi: a deep, dark felt table
 * framed by the lime signature glow (see GAME_ACCENTS) — moodier than the old
 * vivid green so the neon discs and lime bloom pop against it. Consumed by web +
 * mobile.
 */
export const REVERSI_BOARD_COLORS = {
  cell:            '#12503a',       // deep arcade felt
  cellBorder:      'rgba(0,0,0,0.35)',
  boardBorder:     '#0c3324',
  validMoveBlack:  'rgba(0,0,0,0.35)',
  validMoveWhite:  'rgba(255,255,255,0.32)',
  lastMoveRing:    'rgba(190,242,100,0.85)', // lime last-move ring
};

export const REVERSI_DISC_COLORS = {
  black: {
    fill:      '#2b3448',          // slate-black, lifted so it reads on dark felt
    stroke:    '#5c6a85',
    highlight: '#4a5877',
    shadow:    '#000000',
  },
  white: {
    fill:      '#f5f0e8',
    stroke:    '#c7d2e0',
    highlight: '#ffffff',
    shadow:    '#0b0e17',
  },
};
