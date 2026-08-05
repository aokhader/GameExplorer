import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { PuzzleScreen } from '@/screens/PuzzleScreen';

/**
 * Puzzles for each game; unknown keys mirror learn/[game]'s fallback.
 *
 * Liquidate is absent on purpose — it has no "find the move" position to pose,
 * so it never gets a puzzle set and the fallback below is the honest answer for
 * `/puzzles/liquidate`.
 */
export default function PuzzlesRoute() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? '').toLowerCase();

  if (key === 'chess' || key === 'checkers' || key === 'reversi') {
    return <PuzzleScreen game={key} />;
  }

  return (
    <Screen scroll={false}>
      <BackHeader title="Puzzles" fallbackHref="/" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: COLORS.fgMuted, fontSize: 15, textAlign: 'center' }}>
          No puzzles for this game yet.
        </Text>
      </View>
    </Screen>
  );
}
