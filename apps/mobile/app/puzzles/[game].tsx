import { useLocalSearchParams } from 'expo-router';
import { PUZZLES } from '@gameexplorer/shared';
import type { PuzzleGame } from '@gameexplorer/shared';
import { Screen, BackHeader, EmptyState } from '@/components/ui';
import { PuzzleScreen } from '@/screens/PuzzleScreen';

/**
 * Puzzles for each game; unknown keys mirror learn/[game]'s fallback.
 *
 * Liquidate is absent on purpose — it has no "find the move" position to pose,
 * so it never gets a puzzle set and the fallback below is the honest answer for
 * `/puzzles/liquidate`.
 */
export default function PuzzlesRoute() {
  const { game } = useLocalSearchParams<{ game: string }>();
  const key = (game ?? '').toLowerCase();

  // A lookup against the shipped sets rather than a hand-written `||` chain,
  // for the same reason as `learn/[game]`: a chain does not fail to compile
  // when a fifth puzzle game ships.
  const known = Object.prototype.hasOwnProperty.call(PUZZLES, key);

  if (known) {
    return <PuzzleScreen game={key as PuzzleGame} />;
  }

  return (
    <Screen scroll={false}>
      <BackHeader title="Puzzles" fallbackHref="/" />
      <EmptyState fill icon="puzzle-piece" title="No puzzles for this game yet" />
    </Screen>
  );
}
