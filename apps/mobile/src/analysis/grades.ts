import { COLORS } from '@gameexplorer/ui';
import type { MoveGrade } from './types';

/**
 * How each grade reads. Colours are looked up through functions, never captured
 * at module scope — the token objects are live views, so a plain object here
 * would freeze the palette at import and never follow a theme change.
 */
export const GRADE_META: Record<
  MoveGrade,
  { glyph: string; label: string; color: () => string; /** Worth calling out on its own. */ notable: boolean }
> = {
  best: { glyph: '★', label: 'Best move', color: () => COLORS.successHover, notable: false },
  good: { glyph: '', label: 'Good', color: () => COLORS.fgMuted, notable: false },
  inaccuracy: { glyph: '~', label: 'Inaccuracy', color: () => COLORS.warningHover, notable: true },
  mistake: { glyph: '?', label: 'Mistake', color: () => COLORS.warning, notable: true },
  blunder: { glyph: '??', label: 'Blunder', color: () => COLORS.dangerHover, notable: true },
};

/** The grades a summary counts, worst first — the order they're shown in. */
export const SUMMARY_ORDER: MoveGrade[] = ['blunder', 'mistake', 'inaccuracy', 'best'];
