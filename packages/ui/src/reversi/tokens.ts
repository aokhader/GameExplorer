/**
 * Reversi board + disc tokens. "Arcade Glow" reversi: a deep, dark felt table
 * framed by the lime signature glow (see GAME_ACCENTS) — moodier than the old
 * vivid green so the neon discs and lime bloom pop against it. Consumed by web +
 * mobile.
 */
import { liveView } from '../themeRuntime';

const DARK_REVERSI_BOARD_COLORS = {
  cell:            '#12503a',       // deep arcade felt
  cellBorder:      'rgba(0,0,0,0.35)',
  boardBorder:     '#0c3324',
  validMoveBlack:  'rgba(0,0,0,0.35)',
  validMoveWhite:  'rgba(255,255,255,0.32)',
  lastMoveRing:    'rgba(190,242,100,0.85)', // lime last-move ring
};

/** Cozy: the design's brighter green felt in a dark wooden frame. */
const COZY_REVERSI_BOARD_COLORS = {
  cell:            '#2f6e4e',
  cellBorder:      'rgba(0,0,0,0.28)',
  boardBorder:     '#23503a',
  validMoveBlack:  'rgba(0,0,0,0.35)',
  validMoveWhite:  'rgba(255,255,255,0.35)',
  lastMoveRing:    'rgba(250,244,232,0.90)',
};

export const REVERSI_BOARD_COLORS =
  liveView({ dark: DARK_REVERSI_BOARD_COLORS, cozy: COZY_REVERSI_BOARD_COLORS });

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

/**
 * "Game Pieces" design system — the two reversi disc faces (design doc `Game
 * Pieces.dc.html`, section 03): glossy coins, light face wearing the lime
 * accent glow, dark face sitting in its own shadow. Consumed by both
 * ReversiDisc variants; the flip animation lives in the boards.
 */
const DARK_REVERSI_DISC_STYLE = {
  white: {
    // radial-gradient(circle at 34% 26%, #fff, #c7d2e0 78%)
    body: [
      { offset: 0, color: '#ffffff' },
      { offset: 0.78, color: '#c7d2e0' },
      { offset: 1, color: '#b3becd' },
    ],
    border: 'rgba(255,255,255,0.6)',
    halo: 'rgba(190,242,100,0.85)',   // lime bloom
    sheen: 'rgba(255,255,255,0.9)',
    shade: 'rgba(30,45,70,0.25)',
  },
  black: {
    // radial-gradient(circle at 34% 26%, #3a4354, #0a0d15 80%)
    body: [
      { offset: 0, color: '#3a4354' },
      { offset: 0.8, color: '#0a0d15' },
      { offset: 1, color: '#05080d' },
    ],
    border: 'rgba(255,255,255,0.12)',
    halo: 'rgba(0,0,0,0.7)',          // sits in its own shadow
    sheen: 'rgba(120,140,170,0.25)',
    shade: 'rgba(0,0,0,0.55)',
  },
} as const;

/** Cozy discs — bone vs dark walnut, sitting on green felt. */
const COZY_REVERSI_DISC_STYLE = {
  white: {
    body: [
      { offset: 0, color: '#fdf6e8' },
      { offset: 0.78, color: '#ded0b0' },
      { offset: 1, color: '#cbbb98' },
    ],
    border: 'rgba(120,80,40,0.30)',
    halo: 'rgba(250,244,232,0.45)',
    sheen: 'rgba(255,255,255,0.85)',
    shade: 'rgba(60,40,20,0.22)',
  },
  black: {
    body: [
      { offset: 0, color: '#5a4636' },
      { offset: 0.8, color: '#241408' },
      { offset: 1, color: '#1a0e05' },
    ],
    border: 'rgba(255,255,255,0.10)',
    halo: 'rgba(0,0,0,0.55)',
    sheen: 'rgba(214,190,160,0.30)',
    shade: 'rgba(0,0,0,0.45)',
  },
} as const;

export const REVERSI_DISC_STYLE =
  liveView({ dark: DARK_REVERSI_DISC_STYLE, cozy: COZY_REVERSI_DISC_STYLE });
