import {
  useGameAnalysis as useSharedGameAnalysis,
  type UseGameAnalysisOptions,
} from '@gameexplorer/client/hooks/useGameAnalysis';
import { yieldToJsQueue } from '@/engine/yieldToJsQueue';

/**
 * Moved to `@gameexplorer/client` — the loop is plain React with the engine
 * behind an adapter, so it drives native Arasan here and Stockfish WASM on web.
 * Wrapped here because this module's call sites predate the move.
 */
export type { GradedMove, ScanProgress, UseGameAnalysisOptions } from '@gameexplorer/client/hooks/useGameAnalysis';

/**
 * The shared hook, with the scan yielding on the JS queue between positions
 * rather than on a timer. React Native fires timers only on frame callbacks, so
 * a timer made every position of a scan wait for a frame, and on the Pixel 8
 * emulator frames during a scan took up to 450 ms (dev build, Oct 2026).
 */
export function useGameAnalysis<S>(options: UseGameAnalysisOptions<S>) {
  return useSharedGameAnalysis<S>({ yieldToHost: yieldToJsQueue, ...options });
}
