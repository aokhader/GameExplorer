import { createContext, useContext } from 'react';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui';

/**
 * Runs `action` once the result modal has been torn down.
 *
 * Supplied by `GameResultScreen`; anything rendered inside it (its own Review
 * button, plus whatever the screen passes as `actions`) should route navigation
 * through this rather than calling the router directly.
 */
export type DismissThen = (action: () => void) => void;

export const ResultDismissContext = createContext<DismissThen | null>(null);

/**
 * The enclosing result modal's dismiss-then-run helper.
 *
 * Outside a `GameResultScreen` there is no modal to close, so the action runs
 * straight away — that keeps `BackToHomeButton` usable on plain screens.
 */
export function useDismissThen(): DismissThen {
  return useContext(ResultDismissContext) ?? ((action: () => void) => action());
}

/**
 * "Back to Home", the last action on every game-over card.
 *
 * `replace` rather than `push`: a finished game should not sit on the back
 * stack. The dismiss-first hop is what makes that safe — see `GameResultScreen`
 * for why navigating out from under an open Modal crashes Fabric.
 */
export function BackToHomeButton({ label = 'Back to Home' }: { label?: string }) {
  const router = useRouter();
  const dismissThen = useDismissThen();

  return (
    <Button
      label={label}
      variant="secondary"
      onPress={() => dismissThen(() => router.replace('/' as never))}
    />
  );
}
