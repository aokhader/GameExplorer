import { GRADE_INFO, type MoveGrade } from '@finesse/shared';
import { COLORS } from '@finesse/ui';

export { SUMMARY_ORDER } from '@finesse/shared';

/** Native colour for each grade, kept out of shared for two separate reasons. */
const GRADE_COLOR: Record<MoveGrade, () => string> = {
  best: () => COLORS.successHover,
  good: () => COLORS.fgMuted,
  inaccuracy: () => COLORS.warningHover,
  mistake: () => COLORS.warning,
  blunder: () => COLORS.dangerHover,
};

/**
 * How each grade reads: the platform-neutral half (glyph, label, whether it is
 * worth calling out) comes from shared, the colour from the native palette.
 *
 * Colours are looked up through functions, never captured at module scope — the
 * token objects are live views, so a plain value here would freeze the palette
 * at import and never follow a theme change (`noFrozenTokens.test.ts`). That is
 * also why the colour half cannot live in shared: web resolves the same grades
 * through CSS custom properties instead.
 */
export const GRADE_META: Record<
  MoveGrade,
  { glyph: string; label: string; color: () => string; notable: boolean }
> = Object.fromEntries(
  (Object.keys(GRADE_INFO) as MoveGrade[]).map((grade) => [
    grade,
    { ...GRADE_INFO[grade], color: GRADE_COLOR[grade] },
  ]),
) as Record<MoveGrade, { glyph: string; label: string; color: () => string; notable: boolean }>;
