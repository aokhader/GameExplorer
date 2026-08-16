import type { MoveGrade } from './types';

/**
 * What each grade *means* — the half that is identical on every platform.
 *
 * Colour is deliberately absent: mobile resolves it through live-view token
 * getters (a captured value would freeze the palette at import — see
 * `noFrozenTokens.test.ts`) and web resolves it through CSS custom properties.
 * Each platform supplies its own mapping over these keys.
 */
export const GRADE_INFO: Record<
  MoveGrade,
  { glyph: string; label: string; /** Worth calling out on its own. */ notable: boolean }
> = {
  best: { glyph: '★', label: 'Best move', notable: false },
  good: { glyph: '', label: 'Good', notable: false },
  inaccuracy: { glyph: '~', label: 'Inaccuracy', notable: true },
  mistake: { glyph: '?', label: 'Mistake', notable: true },
  blunder: { glyph: '??', label: 'Blunder', notable: true },
};

/** The grades a summary counts, worst first — the order they're shown in. */
export const SUMMARY_ORDER: MoveGrade[] = ['blunder', 'mistake', 'inaccuracy', 'best'];
