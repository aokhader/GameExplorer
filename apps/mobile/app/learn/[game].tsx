import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TUTORIALS } from '@gameexplorer/shared';
import type { TutorialGame } from '@gameexplorer/shared';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { TutorialScreen } from '@/components/learn/TutorialScreen';

/** "How to play" tutorial for each game; unknown keys mirror play/[game]'s fallback. */
export default function LearnRoute() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? '').toLowerCase();

  // A lookup, not a hand-written `||` chain. A chain does not fail to compile
  // when a sixth game ships — it just quietly stops covering it, which is the
  // bug class the `GLOW_KEY` comment one layer down was written about.
  const tutorial = Object.prototype.hasOwnProperty.call(TUTORIALS, key)
    ? TUTORIALS[key as TutorialGame]
    : null;

  if (tutorial) {
    return <TutorialScreen tutorial={tutorial} />;
  }

  return (
    <Screen scroll={false}>
      <BackHeader title="How to play" fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: 15, textAlign: 'center' }}>
          No tutorial for this game yet.
        </Text>
      </View>
    </Screen>
  );
}
