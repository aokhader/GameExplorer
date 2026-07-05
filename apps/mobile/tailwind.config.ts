import type { Config } from 'tailwindcss';
// Single source of truth: the same Arcade Glow tokens the web app uses. Importing
// the pure-JS token module (no React/RN imports) keeps mobile and web in lockstep —
// change a value in packages/ui/src/tokens.ts and both platforms follow.
import { COLORS, GAME_ACCENTS, RADIUS, FONT_SIZES } from '../../packages/ui/src/tokens';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: COLORS.surface,
        'surface-alt': COLORS.surfaceAlt,
        'surface-muted': COLORS.surfaceMuted,
        'surface-hover': COLORS.surfaceHover,
        border: COLORS.border,
        'border-strong': COLORS.borderStrong,
        accent: COLORS.accent,
        'accent-hover': COLORS.accentHover,
        'accent-muted': COLORS.accentMuted,
        'on-accent': COLORS.onAccent,
        info: COLORS.info,
        danger: COLORS.danger,
        warning: COLORS.warning,
        success: COLORS.success,
        fg: COLORS.fg,
        'fg-muted': COLORS.fgMuted,
        'fg-subtle': COLORS.fgSubtle,
        'game-chess': GAME_ACCENTS.chess.base,
        'game-checkers': GAME_ACCENTS.checkers.base,
        'game-reversi': GAME_ACCENTS.reversi.base,
      },
      borderRadius: {
        sm: RADIUS.sm,
        md: RADIUS.md,
        lg: RADIUS.lg,
        xl: RADIUS.xl,
        full: RADIUS.full,
      },
      fontSize: {
        xs: FONT_SIZES.xs,
        sm: FONT_SIZES.sm,
        base: FONT_SIZES.base,
        lg: FONT_SIZES.lg,
        xl: FONT_SIZES.xl,
        '2xl': FONT_SIZES['2xl'],
        '3xl': FONT_SIZES['3xl'],
        '5xl': FONT_SIZES['5xl'],
      },
    },
  },
  plugins: [],
};

export default config;
