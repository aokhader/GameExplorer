import { useNetworkState } from 'expo-network';

/**
 * Connectivity for the offline semantics guard (mobile plan): casual bot +
 * pass-and-play work fully offline; *rated* bot games need connectivity at game
 * start, so setup screens disable the Rated toggle when this returns false.
 *
 * Unknown state (fields undefined while the OS resolves) counts as ONLINE —
 * never block a rated game on a false negative; a mid-game drop is already
 * handled by the save-error + retry path.
 */
export function useIsOnline(): boolean {
  const state = useNetworkState();
  return state.isConnected !== false && state.isInternetReachable !== false;
}
