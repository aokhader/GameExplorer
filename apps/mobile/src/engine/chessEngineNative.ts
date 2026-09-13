import {
  buildUciPositionCommand,
  buildUciPositionFromFen,
  parseUciBestMove,
  parseUciInfoScore,
  parseUciMoveString,
  chessBotConfig,
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

// How a rating becomes engine options lives in `chessBotConfig` — see
// packages/shared/src/game-logic/chess/strength.ts for the measurements behind
// it. Nothing here may derive bot strength on its own.

// Floor for the ANALYSIS path only, where a caller asks for a number of
// milliseconds of full-strength thinking. Bot strength is budgeted by depth and
// never by wall clock, so this must not leak back into `getEngineBestMove`.
const MIN_EVAL_TIME_MS = 120;

type EngineControls = {
  start: () => void;
  send: (command: string) => void;
  setupNetwork: () => Promise<string>;
};

let controls: EngineControls | null = null;
let started = false;
let ready = false;
let networkPath: string | null = null;
// Set when the native engine reports it can't run (e.g. NNUE failed to load).
// Sticky for the app session — the engine is never restarted, so a failed init
// won't recover. Flips the engine to "unavailable" so callers fall back to the
// in-house TS engine instead of driving a broken native engine.
let failed = false;

const readyListeners = new Set<(ready: boolean) => void>();
const failedListeners = new Set<() => void>();

/**
 * The engine's evaluation of one position — what game review needs, as opposed
 * to the bot's bare move.
 */
export interface EngineEvaluation {
  /** Centipawns from the side to move's perspective; null when `mate` is set. */
  cp: number | null;
  /** Mate in N from the side to move's perspective; null otherwise. */
  mate: number | null;
  /** Deepest reported search depth. */
  depth: number;
  /** The move the engine would play, or null in a finished position. */
  bestMove: UciBestMove | null;
}

/**
 * The single outstanding request on the UCI channel. Only one search can run at
 * a time (one process, one stdin), so `bestmove` always terminates whichever
 * kind of request is in flight — a bot move, which wants only the move, or an
 * evaluation, which additionally accumulates the `info … score` lines streamed
 * before it.
 */
type Pending =
  | { kind: 'move'; resolve: (move: UciBestMove) => void; reject: (err: Error) => void }
  | {
      kind: 'eval';
      resolve: (result: EngineEvaluation) => void;
      reject: (err: Error) => void;
      latest: EngineEvaluation;
    };

let pending: Pending | null = null;
// The wall-clock ceiling for the in-flight search, if it has one. Cleared
// whenever `pending` is, so a settled search never leaves a timer behind — an
// unreferenced one keeps Jest's event loop alive and, in the app, would fire a
// stray `stop` into whatever search came next.
let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
// Searches the engine still owes a `bestmove` for, though nobody is waiting on
// them any more. Arasan answers a superseded search before it reads the next
// `go`, so without this count that stale answer would resolve whichever
// request came next.
let orphanedSearches = 0;

function clearPending(): void {
  pending = null;
  if (ceilingTimer !== null) {
    clearTimeout(ceilingTimer);
    ceilingTimer = null;
  }
}

/**
 * Whether the native module is linked into this binary. False in a dev client
 * built before the engine was added (or a platform where the module failed to
 * link) — callers hide ≥1400 tiers instead of crashing at import time.
 */
export function isEngineAvailable(): boolean {
  return !failed && getEngineModule() != null;
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

/** Notified when the engine goes permanently unavailable — see `failed`. */
export function subscribeEngineFailed(listener: () => void): () => void {
  failedListeners.add(listener);
  return () => failedListeners.delete(listener);
}

/**
 * Resolves once the engine has finished its handshake — at once if it already
 * has. Rejects if this binary has no engine, if the engine goes permanently
 * unavailable while waiting, or if it is still not ready after `timeoutMs`.
 *
 * For a caller that must have the real engine and would rather wait for it than
 * settle for anything weaker: a training hint tapped in the first seconds of a
 * game, before the network has loaded.
 */
export function whenEngineReady(timeoutMs: number): Promise<void> {
  if (!isEngineAvailable()) return Promise.reject(new Error('Engine unavailable'));
  if (ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const settle = (err?: Error) => {
      clearTimeout(timer);
      offReady();
      offFailed();
      if (err) reject(err);
      else resolve();
    };
    const offReady = subscribeEngineReady((isReady) => {
      if (isReady) settle();
    });
    const offFailed = subscribeEngineFailed(() => settle(new Error('Engine unavailable')));
    const timer = setTimeout(() => settle(new Error('Engine not ready')), timeoutMs);
    // Node's timers have unref and React Native's do not; see the ceiling timer.
    (timer as { unref?: () => void }).unref?.();
  });
}

/**
 * The native engine reported it can't run. Mark it unavailable so `getBotMove`
 * falls back to the in-house engine, drop any in-flight request, and notify
 * subscribers so screens re-read `isEngineAvailable()`. Idempotent.
 */
function markFailed(reason: string): void {
  if (failed) return;
  failed = true;
  console.warn('Arasan unavailable:', reason);
  cancelEngineSearch(`Engine unavailable: ${reason}`);
  failedListeners.forEach((l) => l());
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

    // Native side couldn't initialize (e.g. NNUE load failed). It keeps running
    // idle rather than exiting the app; we mark it unavailable so callers use the
    // in-house engine and never send it a `go`. See globals.cpp delayedInit.
    if (line.startsWith('enginefail')) {
      markFailed(line.slice('enginefail'.length).trim() || 'init failed');
      continue;
    }

    if (line === 'uciok') {
      if (networkPath) controls?.send(`setoption name NNUE File value ${networkPath}`);
      controls?.send('isready');
      continue;
    }
    if (line === 'readyok') {
      setReady(true);
      continue;
    }

    // Score lines stream during the search; keep the deepest one for whoever
    // asked for an evaluation, and ignore them entirely for a bot move. While a
    // cancelled search still owes its answer, the lines are that search's, not
    // the live request's.
    if (pending?.kind === 'eval' && orphanedSearches === 0) {
      const info = parseUciInfoScore(line);
      if (info && info.depth >= pending.latest.depth) {
        const pvMove = info.pv[0] ? parseUciMoveString(info.pv[0]) : null;
        pending.latest = {
          cp: info.cp,
          mate: info.mate,
          depth: info.depth,
          bestMove: pvMove ?? pending.latest.bestMove,
        };
        continue;
      }
    }

    // `bestmove` ends the search, whichever kind it was. A finished position
    // answers "bestmove (none)", which parses to null — an evaluation still
    // resolves (the score lines are the point), a move request cannot.
    if (line.startsWith('bestmove')) {
      // Answers owed by cancelled searches arrive first, in order, and none of
      // them belongs to the live request. See `orphanedSearches`.
      if (orphanedSearches > 0) {
        orphanedSearches -= 1;
        continue;
      }
      const move = parseUciBestMove(line);
      const request = pending;
      if (!request) continue;

      if (request.kind === 'eval') {
        clearPending();
        request.resolve({ ...request.latest, bestMove: move ?? request.latest.bestMove });
      } else if (move) {
        clearPending();
        request.resolve(move);
      } else {
        // Settle it rather than leave it pending. The engine has already
        // answered, so a later cancel would count this search as still owing
        // an answer and swallow the next real one.
        clearPending();
        request.reject(new Error('Engine has no move in this position'));
      }
    }
  }
}

export function handleEngineError(error: string): void {
  console.warn('Arasan error:', error);
}

/**
 * Drop the in-flight search, if any, so its promise stops pending.
 *
 * Rejects with an `AbortError` — the DOM convention — because this is a normal
 * outcome (the game moved on), not a failure. Callers key off `err.name` to stay
 * quiet instead of logging it as a bot crash.
 *
 * The engine is told to `stop` too, and the answer it still owes is discarded
 * when it lands. Arasan finishes the old search before it reads the next `go`,
 * so without that its move, for a position that no longer exists, would settle
 * whichever request replaced it.
 */
export function cancelEngineSearch(reason = 'Search cancelled'): void {
  const request = pending;
  if (!request) return;
  clearPending();
  orphanedSearches += 1;
  controls?.send('stop');
  const err = new Error(reason);
  err.name = 'AbortError';
  request.reject(err);
}

/**
 * The `position` command for a state, as the engine needs to hear it.
 *
 * `position startpos moves …` is only correct for a state that descends from
 * the initial position. A state seeded from an arbitrary FEN — a puzzle, an
 * analysis setup — has a history that doesn't start there, and with an empty
 * history the engine would evaluate the START position instead of the one on
 * the board. Callers that seeded a position pass the FEN they seeded it with.
 *
 * The startpos form stays the default because it hands over the full move
 * history, which is what the engine's repetition detection needs; a FEN carries
 * the halfmove clock but not the positions that came before it.
 */
function positionCommand(gameState: ChessGameState, startFen?: string): string {
  return startFen
    ? buildUciPositionFromFen(startFen, gameState.moveHistory)
    : buildUciPositionCommand(gameState.moveHistory);
}

/**
 * Best move at the given strength — the same option/position/go sequence as
 * web's useStockfish.getBestMove, over the native transport.
 *
 * Pass `startFen` when `gameState` was seeded from a FEN rather than played out
 * from the opening; see `positionCommand`.
 */
export function getEngineBestMove(
  gameState: ChessGameState,
  targetElo: number,
  startFen?: string,
): Promise<UciBestMove> {
  return new Promise((resolve, reject) => {
    if (!controls || !started || !ready) {
      reject(new Error('Engine not ready'));
      return;
    }
    // Refuse before touching the channel. A rating the ladder hands to the
    // in-house engine must not cancel a search that is legitimately in flight,
    // nor leave `pending` pointing at a request that has already been rejected.
    const config = chessBotConfig(targetElo);
    if (config.engine !== 'arasan') {
      reject(new Error(`ELO ${targetElo} is not served by the native engine`));
      return;
    }

    // A still-pending request means the previous search was abandoned (new game
    // mid-think, or a turn effect that fired twice) — drop it, since only one
    // bestmove line can be outstanding on the single UCI channel.
    cancelEngineSearch('Superseded by a newer search');
    pending = { kind: 'move', resolve, reject };

    controls.send('setoption name UCI_LimitStrength value true');
    controls.send(`setoption name UCI_Elo value ${config.arasanUciElo}`);
    controls.send(positionCommand(gameState, startFen));
    // Depth is the budget, never movetime. Two reasons, both measured:
    // budgeting by wall clock hands a slow handset a weaker bot than a fast one
    // at the same advertised rating, and Arasan sleeps away whatever time is
    // left once it reaches its strength depth cap, so the old movetime bought
    // almost nothing.
    controls.send(`go depth ${config.depth}`);

    // The ceiling is a separate `stop`, NOT a second limit on the `go` line.
    // Arasan's parser takes one search type and the last limit wins, so
    // `go depth 4 movetime 4000` is a timed search that ignores the depth
    // entirely (measured: it ran to depth 9 and used the full budget).
    if (config.ceilingMs != null) {
      const token = pending;
      ceilingTimer = setTimeout(() => {
        if (pending === token) controls?.send('stop');
      }, config.ceilingMs);
      // React Native's setTimeout returns a number and has no unref; Node's
      // does. Under Jest an abandoned search would otherwise hold the event
      // loop open for the full ceiling and trip the "did not exit" warning.
      (ceilingTimer as { unref?: () => void }).unref?.();
    }
  });
}

/**
 * Full-strength evaluation of a position — game review's counterpart to
 * `getEngineBestMove`.
 *
 * `UCI_LimitStrength` is turned back OFF here: review has to judge moves against
 * the engine's real opinion, not against a bot deliberately weakened to some
 * player's rating. That option is sticky on the engine process, so a bot game
 * started after a review re-sets it — see `getEngineBestMove` above, which
 * always sends both option lines.
 */
export function getEngineEvaluation(
  gameState: ChessGameState,
  movetimeMs: number,
  startFen?: string,
): Promise<EngineEvaluation> {
  return new Promise((resolve, reject) => {
    if (!controls || !started || !ready) {
      reject(new Error('Engine not ready'));
      return;
    }
    cancelEngineSearch('Superseded by a newer search');
    pending = {
      kind: 'eval',
      resolve,
      reject,
      latest: { cp: null, mate: null, depth: 0, bestMove: null },
    };

    controls.send('setoption name UCI_LimitStrength value false');
    controls.send(positionCommand(gameState, startFen));
    controls.send(`go movetime ${Math.max(MIN_EVAL_TIME_MS, movetimeMs)}`);
  });
}
