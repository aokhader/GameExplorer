import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LESSONS, isLessonCompleted } from '@gameexplorer/shared';
import type { LessonGame, TutorialGame } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { mobileLessonProgressStore } from '@/lib/lessonProgress';
import { FONTS } from '@/theme/typography';
import { Icon } from '@/components/ui/Icon';

/**
 * The lesson strip — the native twin of web's `LessonIndex`.
 *
 * Reads the set from `LESSONS` rather than taking a hand-written list, so a
 * fifth game with lessons appears here the day its set lands. Liquidate has no
 * `PuzzleRules` binding and therefore no lessons, and this renders nothing for
 * it rather than an empty heading.
 *
 * Completion is re-read on focus, not just on mount: a learner finishes a
 * lesson and comes straight back here, and a stale list would tell them they
 * had not.
 */
export function LessonList({ game }: { game: TutorialGame }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const lessons = LESSONS[game as LessonGame]?.lessons ?? [];
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    let cancelled = false;
    void mobileLessonProgressStore.load().then((progress) => {
      if (cancelled) return;
      setCompleted(new Set(lessons.filter((l) => isLessonCompleted(progress, l.id)).map((l) => l.id)));
    });
    return () => {
      cancelled = true;
    };
    // `lessons` is derived from a module constant and is stable per game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  useEffect(refresh, [refresh]);
  useFocusEffect(refresh);

  if (lessons.length === 0) return null;

  const accent = GAME_ACCENTS[game];
  const doneCount = completed.size;

  return (
    <View style={{ marginBottom: 26 }} testID="lesson-list">
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Text style={{ fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.lg, color: COLORS.fg }}>
          Coached lessons
        </Text>
        <Text style={{ fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, color: COLORS.fgMuted }}>
          {doneCount} / {lessons.length} done
        </Text>
      </View>
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: FONT_SIZES.sm,
          lineHeight: 21,
          color: COLORS.fgMuted,
          marginTop: 4,
          marginBottom: 12,
        }}
      >
        Short lessons on a live board. The coach checks every move and explains the ones that miss.
      </Text>

      <View style={{ gap: SPACING[2] }}>
        {lessons.map((lesson, index) => (
          <Pressable
            key={lesson.id}
            testID={`lesson-card-${lesson.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Lesson ${index + 1}: ${lesson.title}`}
            accessibilityHint={lesson.summary}
            // `push`, never `replace`: replacing the current route with a game
            // screen crashes Fabric on Android roughly two runs in three, and
            // this list is reached from a screen worth going back to anyway.
            onPress={() => router.push(`/lesson/${game}/${lesson.id}` as never)}
            // A plain object, with the pressed state read from the children
            // function — the way every control in this app is written.
            style={{ borderRadius: RADIUS.xl }}
          >
            {({ pressed }) => (
              <View
                style={{
                  flexDirection: 'row',
                  gap: SPACING['2.5'],
                  padding: 12,
                  borderRadius: RADIUS.xl,
                  borderWidth: 1,
                  borderColor: completed.has(lesson.id) ? accent.tintBorder : COLORS.border,
                  backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: RADIUS.full,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: completed.has(lesson.id) ? accent.tintBg : COLORS.surfaceMuted,
                    borderWidth: 1,
                    borderColor: completed.has(lesson.id) ? accent.tintBorder : COLORS.border,
                    marginTop: 1,
                  }}
                >
                  {completed.has(lesson.id) ? (
                    <Icon name="check" size={FONT_SIZES.xs} color={accent.light} label="Completed" />
                  ) : (
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.caption, color: COLORS.fg }}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.body, color: COLORS.fg }}>
                    {lesson.title}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: FONT_SIZES.label,
                      lineHeight: 19,
                      color: COLORS.fgMuted,
                      marginTop: 2,
                    }}
                  >
                    {lesson.summary}
                  </Text>
                  <Text
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: FONT_SIZES.caption,
                      color: COLORS.fgSubtle,
                      marginTop: 4,
                    }}
                  >
                    {lesson.steps.length} steps · about {lesson.estimatedMinutes} min
                  </Text>
                </View>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
