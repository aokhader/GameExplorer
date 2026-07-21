import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { TUTORIALS } from '@gameexplorer/shared';
import { COLORS } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { TutorialScreen } from '@/components/learn/TutorialScreen';

/** "How to play" tutorial for each game; unknown keys mirror play/[game]'s fallback. */
export default function LearnRoute() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? '').toLowerCase();

  if (key === 'chess' || key === 'checkers' || key === 'reversi') {
    return <TutorialScreen tutorial={TUTORIALS[key]} />;
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
