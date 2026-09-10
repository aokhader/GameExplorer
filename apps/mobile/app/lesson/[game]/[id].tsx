import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { LESSONS } from '@gameexplorer/shared';
import type { LessonGame } from '@gameexplorer/shared';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
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
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { game, id } = useLocalSearchParams<{ game: string; id: string }>();
  const key = (game ?? '').toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(LESSONS, key);

  if (known && id) {
    return <LessonScreen game={key as LessonGame} lessonId={id} />;
  }

  return (
    <Screen scroll={false}>
      <BackHeader title="Lesson" fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: 15, textAlign: 'center' }}>
          No lessons for this game yet.
        </Text>
      </View>
    </Screen>
  );
}
