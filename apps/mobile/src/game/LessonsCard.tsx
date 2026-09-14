import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LESSONS, isLessonCompleted } from '@gameexplorer/shared';
import type { LessonGame } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { mobileLessonProgressStore } from '@/lib/lessonProgress';
import { FONTS } from '@/theme/typography';

export interface LessonsCardProps {
  game: LessonGame;
}

/**
 * The way into the coached lessons from a game's setup screen.
 *
 * One card rather than the whole list: the setup screen is where a player
 * chooses what to play, and a strip of eight cards there would bury the mode
 * picker. Tapping it opens the next lesson they have not finished — which is
 * what "carry on" means and what a bookmark is for — and the full list lives on
 * `/learn/{game}` one tap further in.
 *
 * Progress is re-read on focus for the same reason `PuzzlesCard` does it: the
 * setup screen stays mounted underneath the pushed lesson route, so a
 * mount-only read would still show the count from before the lesson.
 */
export function LessonsCard({ game }: LessonsCardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const lessons = LESSONS[game]?.lessons ?? [];
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let active = true;
      mobileLessonProgressStore
        .load()
        .then((progress) => {
          if (!active) return;
          setDoneIds(new Set(lessons.filter((l) => isLessonCompleted(progress, l.id)).map((l) => l.id)));
        })
        .catch(() => {
          // The copy below stands on its own without a count.
        });
      return () => {
        active = false;
      };
      // `lessons` comes from a module constant and is stable per game.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [game]),
  );

  if (lessons.length === 0) return null;

  const accent = GAME_ACCENTS[game];
  const next = lessons.find((lesson) => !doneIds.has(lesson.id)) ?? lessons[0];
  const done = doneIds.size;
  const allDone = done >= lessons.length;

  return (
    <Pressable
      testID="lessons-card"
      accessibilityRole="button"
      accessibilityLabel={
        allDone ? 'Play the lessons again' : `Continue lessons: ${next.title}`
      }
      accessibilityHint={`${done} of ${lessons.length} lessons finished`}
      // `push`, never `replace`: replacing the current route with a game screen
      // crashes Fabric on Android roughly two runs in three.
      onPress={() => router.push(`/lesson/${game}/${next.id}` as never)}
      // A plain object, with the pressed state read from the children function —
      // the way every control in this app is written.
      style={{ marginBottom: 24 }}
    >
      {({ pressed }) => (
        <View
          style={{
            borderRadius: RADIUS['2xl'],
            borderWidth: 1,
            borderColor: allDone ? accent.tintBorder : COLORS.border,
            backgroundColor: pressed ? COLORS.surfaceHover : COLORS.surfaceAlt,
            padding: 16,
            gap: SPACING['2.5'],
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[2] }}>
            <Text
              style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: FONT_SIZES.body, flex: 1 }}
            >
              Coached lessons
            </Text>
            <Text
              testID="lessons-card-progress"
              style={{ color: accent.base, fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label }}
            >
              {done} / {lessons.length}
            </Text>
          </View>

          <Text
            style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: FONT_SIZES.xs, lineHeight: 18 }}
          >
            {allDone
              ? 'You have finished every lesson. Tap to play one again.'
              : `Step-by-step on a live board, with a coach who checks every move. Next up: ${next.title}.`}
          </Text>

          {/* Progress rail. Decorative — the count above already says this, and
              a second announcement of the same number is noise on a reader. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              height: 6,
              borderRadius: RADIUS.full,
              overflow: 'hidden',
              backgroundColor: COLORS.surfaceMuted,
            }}
          >
            <View
              style={{
                width: `${Math.round((done / lessons.length) * 100)}%`,
                height: '100%',
                backgroundColor: accent.base,
              }}
            />
          </View>
        </View>
      )}
    </Pressable>
  );
}
