/**
 * Re-export shim. The loop itself now lives in `@gameexplorer/client` so the web
 * Go screen can drive the same one instead of hand-rolling a fourth copy of the
 * bot/timeline/rating machinery (each of web's existing bot and training pages
 * is 550–680 lines of it). Nothing about it was ever React Native-specific — it
 * imports react, @gameexplorer/shared and @gameexplorer/db and nothing else.
 *
 * Kept so every `@/engine/useLocalGame` import in the three existing screens and
 * their Jest suites carries on working — the same shim pattern
 * `apps/web/src/stores/*` uses for the Zustand stores that moved down in v4.0.
 *
 * Deep import, never the `@gameexplorer/client` barrel: that barrel re-exports
 * `useSocket`, which builds a Supabase client at import time.
 */
export {
  useLocalGame,
  type Color,
  type LocalGameAdapter,
  type LocalGameMode,
  type LocalMove,
  type RatingResult,
  type UseLocalGameOptions,
} from '@gameexplorer/client/hooks/useLocalGame';
