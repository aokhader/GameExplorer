import { useLocalSearchParams } from 'expo-router';
import { LESSONS } from '@gameexplorer/shared';
import type { LessonGame } from '@gameexplorer/shared';
import { Screen, BackHeader, EmptyState } from '@/components/ui';
import { LessonScreen } from '@/screens/LessonScreen';

/**
 * One coached lesson.
 *
 * Routed as `/lesson/{game}/{id}` rather than under `learn/`: a file and a
 * directory both named `learn` is legal in expo-router and confusing to read,
 * and the repo already carries a documented web/mobile route asymmetry that
 * does not need deepening.
 *
 * The game guard reads `LESSONS` rather than spelling the games out in a `||`
 * chain. A hand-written chain does not fail to compile when a sixth game ships
 * — it just quietly stops covering it — which is the bug class this repo has
 * hit six times.
 */
export default function LessonRoute() {
  const { game, id } = useLocalSearchParams<{ game: string; id: string }>();
  const key = (game ?? '').toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(LESSONS, key);

  if (known && id) {
    return <LessonScreen game={key as LessonGame} lessonId={id} />;
  }

  return (
    <Screen scroll={false}>
      <BackHeader title="Lesson" fallbackHref="/" />
      <EmptyState fill icon="graduation-cap" title="No lessons for this game yet" />
    </Screen>
  );
}
