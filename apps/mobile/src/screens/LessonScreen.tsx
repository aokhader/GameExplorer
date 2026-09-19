import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
// Deep import, not the package barrel. The barrel re-exports `useSocket`, which
// pulls `@gameexplorer/db` — a module that builds a Supabase client at import
// time from env a lesson never needs. Reaching straight for the hook keeps
// supabase and socket.io out of this screen's graph, which is also what lets it
// be tested without standing up either.
import { useLesson } from '@gameexplorer/client/hooks/useLesson';
import type { LessonGame } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Button, Screen, BackHeader } from '@/components/ui';
import { GameScreenLayout } from '@/game/GameScreenLayout';
import { InteractiveBoard } from '@/board/InteractiveBoard';
import { CoachCard } from '@/lessons/CoachCard';
import { LessonBar } from '@/lessons/LessonBar';
import { mobileLessonProgressStore } from '@/lib/lessonProgress';
import { FONTS } from '@/theme/typography';

const GAME_LABEL: Record<LessonGame, string> = {
  chess: 'Chess',
  checkers: 'Checkers',
  reversi: 'Reversi',
  go: 'Go',
};

export interface LessonScreenProps {
  game: LessonGame;
  lessonId: string;
}

/**
 * One coached lesson — the native twin of web's `LessonScreen`.
 *
 * Everything that decides anything (is this move accepted, which line answers
 * this mistake, is the lesson over) is in the shared reducer, and the
 * sequencing is in `useLesson`, so this file is layout: it picks a board, draws
 * the coach, and pins the controls under it. There is no engine search on this
 * path at all, which is what makes it cheap on a phone.
 */
export function LessonScreen({ game, lessonId }: LessonScreenProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const {
    lesson,
    step,
    phase,
    say,
    sayKind,
    loading,
    error,
    board,
    marks,
    stepIndex,
    stepCount,
    hint,
    hintText,
    hintShown,
    nextLesson,
    playMove,
    advance,
    retry,
    showHint,
  } = useLesson<unknown>({ game, lessonId, progress: mobileLessonProgressStore });

  if (loading) {
    return (
      <Screen scroll={false}>
        <BackHeader title="Lesson" fallbackHref={`/learn/${game}`} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.body }}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (error || !lesson) {
    return (
      <Screen scroll={false}>
        <BackHeader title="Lesson" fallbackHref={`/learn/${game}`} />
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING[4], padding: 24 }}
        >
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.body, textAlign: 'center' }}>
            {error ?? 'That lesson has been renamed or removed.'}
          </Text>
          <Button
            label={`All ${GAME_LABEL[game]} lessons`}
            onPress={() => router.replace(`/learn/${game}` as never)}
          />
        </View>
      </Screen>
    );
  }

  const done = phase === 'done';
  // Inert during the reply beat and once finished, so a stray tap cannot land a
  // move in a position the learner is no longer in. The runtime answers stray
  // input with `'ignored'` anyway; this is what makes the board *look* the way
  // it behaves, which on a phone matters more — the board is most of the screen.
  const interactive = phase === 'acting' || phase === 'missed';
  const accent = GAME_ACCENTS[game];

  return (
    <GameScreenLayout
      accent={game}
      backHref={`/learn/${game}`}
      title={lesson.title}
      headerActions={
        <Text testID="lesson-progress" style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label }}>
          {Math.min(stepIndex + 1, stepCount)} / {stepCount}
        </Text>
      }
      // Above the board, not below it. Web keeps its coach in the sidebar
      // because that shell budgets a fixed height for the top slot and clips
      // whatever overflows; the native shell is a plain ScrollView, so a coach
      // line that wraps to four lines only makes the column taller — and what
      // you are being asked to do belongs above the thing you do it on.
      topCard={
        <View style={{ gap: SPACING[2] }}>
          <StepDots stepIndex={stepIndex} stepCount={stepCount} accentColor={accent.base} />
          <CoachCard
            game={game}
            step={step}
            say={say}
            sayKind={sayKind}
            hintText={hintText}
            hintShown={hintShown}
          />
        </View>
      }
      board={
        <InteractiveBoard
          game={game}
          state={board}
          playerColor={lesson.learnerColor}
          interactive={interactive}
          onMove={playMove}
          hint={hint}
          marks={marks}
        />
      }
      sidebar={
        done ? (
          <View style={{ gap: SPACING[2] }} testID="lesson-done">
            <Button
              label={nextLesson ? `Next: ${nextLesson.title}` : `${GAME_LABEL[game]} puzzles`}
              onPress={() =>
                router.replace(
                  (nextLesson
                    ? `/lesson/${game}/${nextLesson.id}`
                    : `/puzzles/${game}`) as never,
                )
              }
            />
            <Button
              label={`All ${GAME_LABEL[game]} lessons`}
              variant="secondary"
              onPress={() => router.replace(`/learn/${game}` as never)}
            />
          </View>
        ) : (
          <Text style={{ color: COLORS.fgSubtle, fontSize: FONT_SIZES.xs, fontFamily: FONTS.body }}>
            {lesson.summary}
          </Text>
        )
      }
      bottomBar={
        <LessonBar
          accent={game}
          canAdvance={phase === 'reading'}
          canHint={interactive}
          hintShown={hintShown}
          missed={phase === 'missed'}
          done={done}
          onAdvance={advance}
          onHint={showHint}
          onRetry={retry}
          onNext={() =>
            router.replace(
              (nextLesson ? `/lesson/${game}/${nextLesson.id}` : `/puzzles/${game}`) as never,
            )
          }
        />
      }
    />
  );
}

/**
 * A dot per step, filled up to the one you are on.
 *
 * Not pressable, deliberately: a lesson's later steps run in positions its
 * earlier ones produce, and half of them reset the board, so jumping to step
 * five is not something the runtime can honour.
 */
function StepDots({
  stepIndex,
  stepCount,
  accentColor,
}: {
  stepIndex: number;
  stepCount: number;
  accentColor: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const done = Math.min(stepIndex, stepCount);

  return (
    <View
      testID="lesson-rail"
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${stepCount} steps done`}
      style={{ flexDirection: 'row', gap: SPACING[1] }}
    >
      {Array.from({ length: stepCount }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: RADIUS.full,
            backgroundColor:
              i < done ? accentColor : i === done ? COLORS.fgSubtle : COLORS.surfaceMuted,
          }}
        />
      ))}
    </View>
  );
}
