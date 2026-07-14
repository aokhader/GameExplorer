import { useEffect } from 'react';
import {
  getEngineModule,
  handleEngineError,
  handleEngineOutput,
  registerEngineControls,
} from './chessEngineNative';

// Module-level callbacks so their identity NEVER changes: the wrapper's
// useArasan effect depends on [onOutput, onError]; stable identities mean
// that effect runs exactly once for the app session.
const onOutput = (output: string) => handleEngineOutput(output);
const onError = (error: string) => handleEngineError(error);

type UseArasanHook = (options: {
  onOutput?: (output: string) => void;
  onError?: (error: string) => void;
}) => {
  startEngine: () => void;
  setupNetwork: () => Promise<string>;
  sendCommand: (command: string) => void;
};

function HostInner({ useArasan }: { useArasan: UseArasanHook }) {
  const { startEngine, setupNetwork, sendCommand } = useArasan({ onOutput, onError });

  useEffect(() => {
    registerEngineControls({ start: startEngine, send: sendCommand, setupNetwork });
  }, [startEngine, sendCommand, setupNetwork]);

  return null;
}

/**
 * Owns the native Arasan hook for the whole app session. Rendered once in
 * the root layout and never unmounted — see chessEngineNative.ts for why the
 * engine must not be stopped. Renders nothing; when the native module isn't in
 * this binary (stale dev client, unbuilt platform) it mounts nothing and
 * strong bots stay hidden instead of crashing.
 */
export function EngineHost() {
  const mod = getEngineModule();
  if (!mod) return null;
  return <HostInner useArasan={mod.useArasan as UseArasanHook} />;
}
