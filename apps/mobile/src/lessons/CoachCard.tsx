import { Text, View } from 'react-native';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import type { LessonGame, LessonSayKind, LessonStep } from '@gameexplorer/shared';
import { FONTS } from '@/theme/typography';

/**
 * The coach: what to do, what just happened, and the written hint once asked for.
 *
 * The native twin of web's `CoachCard`, with one deliberate difference: the
 * buttons are not here. They live in `LessonBar`, pinned under the board, where
 * every other native mode puts its actions — the phone's thumb is at the bottom
 * of the screen, and a Continue button halfway up a scrolling column is a worse
 * button than the same one on the bar.
 *
 * Two lines rather than one: the instruction stays put while the step is open,
 * and `say` is the coach reacting to the last thing that happened. At the start
 * of a step the two are the same sentence, and only one is drawn.
 */
export function CoachCard({
  game,
  step,
  say,
  sayKind,
  hintText,
  hintShown,
}: {
  game: LessonGame;
  step: LessonStep | null;
  say: string;
  sayKind: LessonSayKind;
  hintText: string | null;
  hintShown: boolean;
}) {
  // Repaint when the theme changes; every token below is a live view, and a
  // module-scope copy would freeze whichever theme Metro parsed first.
  useThemeName();

  const accent = GAME_ACCENTS[game];
  const tone: Record<LessonSayKind, { border: string; bg: string; label: string; ink: string }> = {
    instruction: {
      border: COLORS.border,
      bg: COLORS.surfaceAlt,
      label: '',
      ink: COLORS.fg,
    },
    success: {
      border: COLORS.success,
      bg: COLORS.surfaceAlt,
      label: 'Nice',
      ink: COLORS.successHover,
    },
    miss: {
      border: COLORS.warning,
      bg: COLORS.surfaceAlt,
      label: 'Not quite',
      ink: COLORS.warningHover,
    },
    outro: {
      border: accent.tintBorder,
      bg: accent.tintBg,
      label: 'Lesson complete',
      ink: accent.base,
    },
  };

  const shade = tone[sayKind];
  const showTask = step !== null && step.instruction !== say;

  return (
    <View
      testID="coach-card"
      accessibilityLiveRegion="polite"
      style={{
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: shade.border,
        backgroundColor: shade.bg,
        padding: 12,
        gap: SPACING[2],
      }}
    >
      {shade.label ? (
        <Text
          style={{
            color: shade.ink,
            fontSize: FONT_SIZES.caption,
            fontFamily: FONTS.bodyBold,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
          }}
        >
          {shade.label}
        </Text>
      ) : null}

      <Text testID="coach-say" style={{ color: COLORS.fg, fontSize: FONT_SIZES.body, lineHeight: 21 }}>
        {say}
      </Text>

      {showTask ? (
        <Text testID="coach-task" style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, lineHeight: 20 }}>
          <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.caption }}>
            {'TASK  '}
          </Text>
          {step.instruction}
        </Text>
      ) : null}

      {hintShown && hintText ? (
        <Text
          testID="coach-hint"
          style={{ color: accent.base, fontSize: FONT_SIZES.sm, fontStyle: 'italic', lineHeight: 20 }}
        >
          {hintText}
        </Text>
      ) : null}
    </View>
  );
}
