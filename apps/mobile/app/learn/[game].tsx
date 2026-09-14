import { useLocalSearchParams } from 'expo-router';
import { TUTORIALS } from '@gameexplorer/shared';
import type { TutorialGame } from '@gameexplorer/shared';
import { Screen, BackHeader, EmptyState } from '@/components/ui';
import { TutorialScreen } from '@/components/learn/TutorialScreen';

/** "How to play" tutorial for each game; unknown keys mirror play/[game]'s fallback. */
export default function LearnRoute() {
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
      <EmptyState fill icon="graduation-cap" title="No tutorial for this game yet" />
    </Screen>
  );
}
