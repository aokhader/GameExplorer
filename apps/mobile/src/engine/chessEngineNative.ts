import {
  buildUciPositionCommand,
  parseUciBestMove,
  stockfishMoveTimeMs,
  type ChessGameState,
  type UciBestMove,
} from '@gameexplorer/shared';

/**
 * Singleton service around the native Arasan TurboModule (react-native-arasan,
 * MIT — replaced GPL Stockfish so the same engine ships on Android AND the
 * Apple App Store). The mobile counterpart of web's `useStockfish` Web Worker
 * hook, speaking the same UCI protocol through the shared helpers.
 *
 * Why a singleton and not a per-screen hook: the module's stdio pipes are
 * dup2'd onto the process's fd 0/1/2 once and the engine loop never exits, so
 * the engine is started lazily on the first strong-bot game and then lives for
 * the whole app session; nothing ever stops it. `EngineHost` (mounted once in
 * the root layout, never unmounted) owns the native hook and forwards its
 * output here.
 *
 * Handshake note: Arasan hard-exits the process if its NNUE network can't
 * load, and the load happens on the first `isready`. So the flow is
 * setupNetwork() (asset → file path) → start → `uci` → on `uciok` send
 * `setoption name NNUE File value <path>` → `isready` → `readyok` = ready.
 */

// Arasan's UCI_Elo range (options.h MIN_RATING/MAX_RATING).
const ARASAN_UCI_ELO_MIN = 1000;
const ARASAN_UCI_ELO_MAX = 3450;

type EngineControls = {
  start: () => void;
  send: (command: string) => void;
  setupNetwork: () => Promise<string>;
};

let controls: EngineControls | null = null;
let started = false;
let ready = false;
let networkPath: string | null = null;

const readyListeners = new Set<(ready: boolean) => void>();

let pendingResolve: ((move: UciBestMove) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

/**
 * Whether the native module is linked into this binary. False in a dev client
 * built before the engine was added (or a platform where the module failed to
 * link) — callers hide ≥1400 tiers instead of crashing at import time.
 */
export function isEngineAvailable(): boolean {
  return getEngineModule() != null;
}

let cachedModule: { useArasan: unknown } | null | undefined;

export function getEngineModule(): { useArasan: unknown } | null {
  if (cachedModule === undefined) {
    try {
      // The TurboModule spec throws at require time when the native side isn't
      // linked (TurboModuleRegistry.getEnforcing), hence the guarded require.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = require('react-native-arasan');
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule ?? null;
}

/** Called once by EngineHost when the native hook is mounted. */
export function registerEngineControls(next: EngineControls): void {
  controls = next;
}

export function isEngineReady(): boolean {
  return ready;
}

export function subscribeEngineReady(listener: (ready: boolean) => void): () => void {
  readyListeners.add(listener);
  return () => readyListeners.delete(listener);
}

function setReady(next: boolean): void {
  if (ready === next) return;
  ready = next;
  readyListeners.forEach((l) => l(next));
}

/**
 * Start the engine if it isn't running yet. Safe to call repeatedly; readiness
 * is signalled through subscribeEngineReady once the network is installed and
 * the UCI handshake (uci → uciok → setoption NNUE File → isready → readyok)
 * completes.
 */
export function ensureEngineStarted(): void {
  if (started || !controls) return;
  started = true;
  controls
    .setupNetwork()
    .then((path) => {
      networkPath = path;
      controls?.start();
      controls?.send('uci');
    })
    .catch((err) => {
      // Without the network the engine would hard-exit on isready — stay
      // unready (UI keeps waiting / tiers stay gated) rather than crash.
      console.warn('Arasan network setup failed:', err);
      started = false;
    });
}

/** Clear the engine's tables between games (the process itself lives on). */
export function engineNewGame(): void {
  if (started && ready) controls?.send('ucinewgame');
}

/** Output lines from the native module — one UCI line per event, but split defensively. */
export function handleEngineOutput(output: string): void {
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line === 'uciok') {
      if (networkPath) controls?.send(`setoption name NNUE File value ${networkPath}`);
      controls?.send('isready');
      continue;
    }
    if (line === 'readyok') {
      setReady(true);
      continue;
    }

    const move = parseUciBestMove(line);
    if (move && pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      pendingReject = null;
      resolve(move);
    }
  }
}

export function handleEngineError(error: string): void {
  console.warn('Arasan error:', error);
}

/**
 * Best move at the given strength — the same option/position/go sequence as
 * web's useStockfish.getBestMove, over the native transport.
 */
export function getEngineBestMove(
  gameState: ChessGameState,
  targetElo: number,
): Promise<UciBestMove> {
  return new Promise((resolve, reject) => {
    if (!controls || !started || !ready) {
      reject(new Error('Engine not ready'));
      return;
    }
    // A still-pending request means the previous game was abandoned mid-search
    // (new game while the bot thought) — supersede it.
    if (pendingReject) pendingReject(new Error('Superseded by a newer search'));

    pendingResolve = resolve;
    pendingReject = reject;

    const elo = Math.max(ARASAN_UCI_ELO_MIN, Math.min(ARASAN_UCI_ELO_MAX, targetElo));
    controls.send('setoption name UCI_LimitStrength value true');
    controls.send(`setoption name UCI_Elo value ${elo}`);
    controls.send(buildUciPositionCommand(gameState.moveHistory));
    controls.send(`go movetime ${stockfishMoveTimeMs(targetElo)}`);
  });
}
