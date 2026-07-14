import Arasan, {
  _subscribeToArasanOutput,
  _subscribeToArasanError,
} from './NativeArasan';

import { useRef, useCallback, useEffect } from 'react';

type UseArasanOptions = {
  onOutput?: (output: string) => void;
  onError?: (error: string) => void;
};

/**
 * Hook for the Arasan UCI engine. Mirrors the useStockfish hook this module
 * was forked from, with two deliberate differences:
 *  - `setupNetwork()` must resolve before the UCI `isready` is sent (Arasan
 *    exits the process when its NNUE network can't load).
 *  - There is NO stop function and unmount does NOT stop the engine — the
 *    stdio pipes can't be re-created, so the engine lives for the whole app
 *    session (mount the owning component once, at the root).
 */
export function useArasan({ onOutput, onError }: UseArasanOptions) {
  const isRunning = useRef(false);

  const startEngine = useCallback(() => {
    if (!isRunning.current) {
      isRunning.current = true;
      Arasan.startEngine();
    }
  }, []);

  const setupNetwork = useCallback(() => Arasan.setupNetwork(), []);

  const sendCommand = useCallback((command: string) => {
    if (isRunning.current) {
      Arasan.sendCommand(command);
    } else {
      console.warn('Arasan is not running. Cannot send command.');
    }
  }, []);

  useEffect(() => {
    const cancelOutput = _subscribeToArasanOutput((output: string) => {
      if (isRunning.current && onOutput) onOutput(output);
    });
    const cancelError = _subscribeToArasanError((error: string) => {
      if (isRunning.current && onError) onError(error);
    });
    return () => {
      cancelOutput();
      cancelError();
      // Deliberately no engine stop here — never-stop design.
    };
  }, [onOutput, onError]);

  return { startEngine, setupNetwork, sendCommand };
}
