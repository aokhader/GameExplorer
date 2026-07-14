import type { TurboModule } from 'react-native';
import {
  TurboModuleRegistry,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';

const { Arasan } = NativeModules;

if (!Arasan) {
  throw new Error(
    'Arasan native module is not linked. Rebuild the app (a stale dev client cannot load it).'
  );
}

const eventEmitter = new NativeEventEmitter(Arasan);

export const _subscribeToArasanOutput = (callback: (output: string) => void) => {
  const subscription = eventEmitter.addListener('arasan-output', callback);
  return () => subscription.remove();
};

export const _subscribeToArasanError = (callback: (output: string) => void) => {
  const subscription = eventEmitter.addListener('arasan-error', callback);
  return () => subscription.remove();
};

export interface Spec extends TurboModule {
  /**
   * Copies the bundled NNUE network to app storage (idempotent) and resolves
   * its absolute path. Must complete before `isready` is sent — Arasan
   * hard-exits the process if the network can't be loaded.
   */
  setupNetwork(): Promise<string>;
  /** Starts the engine loop + output readers. The engine never stops. */
  startEngine(): void;
  /** Sends one UCI command (no trailing newline needed). */
  sendCommand(command: string): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Arasan');
