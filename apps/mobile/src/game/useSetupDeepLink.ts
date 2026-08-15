import { useLocalSearchParams } from 'expo-router';

/**
 * Reads the `?elo=&start=1` deep link the welcome tour hands to a game screen,
 * mirroring web's bot pages.
 *
 * Mobile's tour used to collect a difficulty and then route with only the game
 * name, so every first game started the default bot regardless of the card the
 * player picked. Both platforms now carry the choice through.
 *
 * The result is meant for **lazy initial state**, not an effect: the params are
 * available on the first render, so seeding `useState` with them skips the
 * setup-screen flash that web needs a layout effect to avoid. Reading it later
 * would also fight the user, re-applying the link every time they touch a
 * picker.
 */
export function useSetupDeepLink(tiers: readonly number[]): {
  /** Nearest available tier to the requested strength, or null if none asked. */
  elo: number | null;
  autoStart: boolean;
} {
  const params = useLocalSearchParams<{ elo?: string; start?: string }>();
  const requested = Number(params.elo);
  const elo =
    Number.isFinite(requested) && requested > 0
      ? tiers.reduce((a, b) => (Math.abs(b - requested) < Math.abs(a - requested) ? b : a))
      : null;
  return { elo, autoStart: params.start === '1' };
}
