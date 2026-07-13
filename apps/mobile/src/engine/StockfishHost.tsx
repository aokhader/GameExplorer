import { useEffect } from 'react';
import {
  getStockfishModule,
  handleStockfishError,
  handleStockfishOutput,
  registerStockfishControls,
} from './stockfishEngine';

// Module-level callbacks so their identity NEVER changes: the wrapper's
// useStockfish effect depends on [onOutput, onError] and its cleanup calls
// stopStockfish() — which kills the engine for the rest of the app session
// (the fake stdio streams cannot reopen; see stockfishEngine.ts). Stable
// identities mean that effect runs exactly once.
const onOutput = (output: string) => handleStockfishOutput(output);
const onError = (error: string) => handleStockfishError(error);

function HostInner({ useStockfish }: { useStockfish: UseStockfishHook }) {
  const { stockfishLoop, sendCommandToStockfish } = useStockfish({ onOutput, onError });

  useEffect(() => {
    registerStockfishControls({ loop: stockfishLoop, send: sendCommandToStockfish });
  }, [stockfishLoop, sendCommandToStockfish]);

  return null;
}

type UseStockfishHook = (options: {
  onOutput?: (output: string) => void;
  onError?: (error: string) => void;
}) => {
  stockfishLoop: () => void;
  stopStockfish: () => void;
  sendCommandToStockfish: (command: string) => void;
};

/**
 * Owns the native Stockfish hook for the whole app session. Rendered once in
 * the root layout and never unmounted — see stockfishEngine.ts for why the
 * engine must not be stopped. Renders nothing; when the native module isn't in
 * this binary (stale dev client, unbuilt platform) it mounts nothing and
 * strong bots stay hidden instead of crashing.
 */
export function StockfishHost() {
  const mod = getStockfishModule();
  if (!mod) return null;
  return <HostInner useStockfish={mod.useStockfish as UseStockfishHook} />;
}
