/**
 * Moved to `@gameexplorer/client` — the loop is plain React with the engine
 * behind an adapter, so it drives native Arasan here and Stockfish WASM on web.
 * Re-exported because this module's call sites predate the move.
 */
export {
  useGameAnalysis,
  type GradedMove,
  type ScanProgress,
  type UseGameAnalysisOptions,
} from '@gameexplorer/client/hooks/useGameAnalysis';
