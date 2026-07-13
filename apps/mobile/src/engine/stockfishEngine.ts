import {
  buildUciPositionCommand,
  clampStockfishElo,
  parseUciBestMove,
  stockfishMoveTimeMs,
  type ChessGameState,
  type UciBestMove,
} from '@gameexplorer/shared';

/**
 * Singleton service around the native Stockfish TurboModule
 * (@loloof64/react-native-stockfish) — the mobile counterpart of web's
 * `useStockfish` Web Worker hook, speaking the same UCI protocol through the
 * shared helpers.
 *
 * Why a singleton and not a per-screen hook: the wrapper's fake stdin/stdout
 * streams close PERMANENTLY when the engine stops (FakeStream.close() has no
 * reopen — see the package's cpp/stockfish/fixes/stream_fix.cpp), so an engine
 * stopped on screen unmount could never be restarted until the app process
 * dies. The engine is therefore started lazily on the first strong-bot game
 * and then lives for the whole app session; nothing ever calls stopStockfish.
 * `StockfishHost` (mounted once in the root layout, never unmounted) owns the
 * native hook and forwards its output here.
 */

type EngineControls = {
  loop: () => void;
  send: (command: string) => void;
};

let controls: EngineControls | null = null;
let started = false;
let ready = false;

const readyListeners = new Set<(ready: boolean) => void>();

let pendingResolve: ((move: UciBestMove) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

/**
 * Whether the native module is linked into this binary. False in a dev client
 * built before the engine was added (or a platform where the wrapper failed to
 * link) — callers hide ≥1400 tiers instead of crashing at import time.
 */
export function isStockfishAvailable(): boolean {
  return getStockfishModule() != null;
}

let cachedModule: { useStockfish: unknown } | null | undefined;

export function getStockfishModule(): { useStockfish: unknown } | null {
  if (cachedModule === undefined) {
    try {
      // The TurboModule spec throws at require time when the native side isn't
      // linked (TurboModuleRegistry.getEnforcing), hence the guarded require.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cachedModule = require('@loloof64/react-native-stockfish');
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule ?? null;
}

/** Called once by StockfishHost when the native hook is mounted. */
export function registerStockfishControls(next: EngineControls): void {
  controls = next;
}

export function isStockfishReady(): boolean {
  return ready;
}

export function subscribeStockfishReady(listener: (ready: boolean) => void): () => void {
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
 * is signalled through subscribeStockfishReady once the UCI handshake
 * (uci → uciok → isready → readyok) completes.
 */
export function ensureStockfishStarted(): void {
  if (started || !controls) return;
  started = true;
  controls.loop();
  controls.send('uci');
}

/** Clear the engine's tables between games (the process itself lives on). */
export function stockfishNewGame(): void {
  if (started && ready) controls?.send('ucinewgame');
}

/** Output lines from the native module — one UCI line per event, but split defensively. */
export function handleStockfishOutput(output: string): void {
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    if (line === 'uciok') {
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

export function handleStockfishError(error: string): void {
  console.warn('Stockfish error:', error);
}

/**
 * Best move at the given strength — the same option/position/go sequence as
 * web's useStockfish.getBestMove, over the native transport.
 */
export function getStockfishBestMove(
  gameState: ChessGameState,
  targetElo: number,
): Promise<UciBestMove> {
  return new Promise((resolve, reject) => {
    if (!controls || !started || !ready) {
      reject(new Error('Stockfish not ready'));
      return;
    }
    // A still-pending request means the previous game was abandoned mid-search
    // (new game while the bot thought) — supersede it.
    if (pendingReject) pendingReject(new Error('Superseded by a newer search'));

    pendingResolve = resolve;
    pendingReject = reject;

    controls.send('setoption name UCI_LimitStrength value true');
    controls.send(`setoption name UCI_Elo value ${clampStockfishElo(targetElo)}`);
    controls.send('setoption name Skill Level value 20');
    controls.send(buildUciPositionCommand(gameState.moveHistory));
    controls.send(`go movetime ${stockfishMoveTimeMs(targetElo)}`);
  });
}
