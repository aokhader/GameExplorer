import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChessGameState, UciBestMove } from '@gameexplorer/shared';
import {
  // The shared helpers are engine-neutral (mobile drives Arasan through them);
  // this hook is web's real Stockfish, so alias them back to Stockfish names.
  ENGINE_MIN_ELO as STOCKFISH_MIN_ELO,
  buildUciPositionCommand,
  clampStockfishElo,
  parseUciBestMove,
  engineMoveTimeMs as stockfishMoveTimeMs,
} from '@gameexplorer/shared';
import {
  getStockfishEnginePath,
  getStockfishThreads,
  isMultiThreadSupported,
} from '../lib/stockfishEngine';

/**
 * ELO threshold above which we hand off to Stockfish (the shared
 * `ENGINE_MIN_ELO`, which mobile's native Arasan service also uses).
 * Below it, callers must use the chess engine worker's getBotMove
 * (useChessEngine) so the weak engine's minimax never runs on the main thread.
 */
export { STOCKFISH_MIN_ELO };

/**
 * Minimum think time (ms) shown in the UI. The engine may compute faster;
 * the bot page Promise.all()s this with the engine call to pad it.
 */
export function thinkTimeForElo(elo: number): number {
  if (elo < 800)  return 400;
  if (elo < 1200) return 650;
  if (elo < 1400) return 900;
  if (elo < 1800) return 1100;
  return 1400;
}

export type StockfishMove = UciBestMove;

/**
 * How long `getFullStrengthMove` waits for the engine to load. The worker is
 * created when a game starts and downloads ~7 MB of WASM, so a hint asked in the
 * first seconds of a game can arrive before the engine is up.
 */
const ENGINE_LOAD_WAIT_MS = 30_000;

export interface UseStockfishOptions {
  /**
   * When false, the Stockfish worker is not created and its ~7 MB WASM is not
   * downloaded. Lets callers defer the heavy engine until the user actually
   * starts a game instead of paying for it on a setup/browse screen.
   * Defaults to true so existing callers keep their eager behaviour.
   */
  enabled?: boolean;
}

export function useStockfish({ enabled = true }: UseStockfishOptions = {}) {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const moveResolverRef = useRef<((move: StockfishMove) => void) | null>(null);
  const moveRejecterRef = useRef<((err: Error) => void) | null>(null);
  // Answers still owed to searches nobody waits for any more. `stop` makes a
  // cancelled search reply at once — but it does reply, and without this count
  // that stale `bestmove` would resolve the next caller with a move for a
  // different position (a rematch starts while the last game's bot is thinking).
  const staleAnswersRef = useRef(0);
  // `isReady` mirrored into a ref, plus whoever is waiting for it to turn true —
  // for a caller that would rather wait for the engine than be refused.
  const isReadyRef = useRef(false);
  const readyWaitersRef = useRef(new Set<() => void>());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;

    workerRef.current = new Worker(getStockfishEnginePath());
    workerRef.current.postMessage('uci');
    if (isMultiThreadSupported()) {
      // Multi-threaded build (cross-origin isolated page): reach the
      // configured strength in less wall-clock time per move.
      workerRef.current.postMessage(`setoption name Threads value ${getStockfishThreads()}`);
    }
    // One fresh-game signal per worker lifetime (= one game; see getBestMove).
    workerRef.current.postMessage('ucinewgame');

    workerRef.current.onmessage = (e) => {
      const message = typeof e.data === 'string' ? e.data : e.data?.data;
      if (!message) return;

      if (message === 'uciok') {
        setIsReady(true);
        isReadyRef.current = true;
        readyWaitersRef.current.forEach((wake) => wake());
        readyWaitersRef.current.clear();
        workerRef.current?.postMessage('isready');
      }

      const bestMove = parseUciBestMove(message);
      if (bestMove) {
        if (staleAnswersRef.current > 0) {
          staleAnswersRef.current -= 1;
          return;
        }
        if (moveResolverRef.current) {
          moveResolverRef.current(bestMove);
          moveResolverRef.current = null;
          moveRejecterRef.current = null;
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      moveResolverRef.current = null;
      moveRejecterRef.current = null;
      staleAnswersRef.current = 0;
      isReadyRef.current = false;
      setIsReady(false);
    };
  }, [enabled]);

  /**
   * Abandon the search in flight, if there is one: stop the engine, discard the
   * answer it still sends, and reject the waiting caller with an `AbortError`.
   * Starting a new search does this first, so two callers never share one reply.
   */
  const cancelSearch = useCallback(() => {
    const worker = workerRef.current;
    const reject = moveRejecterRef.current;
    if (!moveResolverRef.current || !worker) return;
    worker.postMessage('stop');
    staleAnswersRef.current += 1;
    moveResolverRef.current = null;
    moveRejecterRef.current = null;
    reject?.(new DOMException('Search cancelled', 'AbortError'));
  }, []);

  const getBestMove = useCallback(
    (gameState: ChessGameState, targetElo: number): Promise<StockfishMove> => {
      return new Promise((resolve, reject) => {
        if (targetElo < STOCKFISH_MIN_ELO) {
          // Weak strengths belong in the chess engine worker (getBotMove) —
          // running the JS minimax here would block the main thread.
          reject(new Error(`Stockfish handles ELO ${STOCKFISH_MIN_ELO}+; use useChessEngine().getBotMove for weaker bots`));
          return;
        }
        if (!workerRef.current || !isReady) {
          reject(new Error('Stockfish not ready'));
          return;
        }

        cancelSearch();
        moveResolverRef.current = resolve;
        moveRejecterRef.current = reject;

        // No ucinewgame here: the worker lives for exactly one game (it is
        // created when the game starts), so keeping the hash between moves
        // makes each successive search faster.
        workerRef.current.postMessage('setoption name UCI_LimitStrength value true');
        workerRef.current.postMessage(`setoption name UCI_Elo value ${clampStockfishElo(targetElo)}`);
        workerRef.current.postMessage('setoption name Skill Level value 20');
        workerRef.current.postMessage(buildUciPositionCommand(gameState.moveHistory));
        workerRef.current.postMessage(`go movetime ${stockfishMoveTimeMs(targetElo)}`);
      });
    },
    [isReady, cancelSearch],
  );

  /** Resolves once the engine is up, waiting at most `timeoutMs` for it. */
  const whenReady = useCallback((timeoutMs: number): Promise<void> => {
    if (isReadyRef.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const wake = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        readyWaitersRef.current.delete(wake);
        reject(new Error('Stockfish did not load in time'));
      }, timeoutMs);
      readyWaitersRef.current.add(wake);
    });
  }, []);

  /**
   * The engine's own best move, with strength limiting switched off — for a
   * training hint, which is the best move whatever the player's rating. If the
   * engine is still loading this waits for it rather than refusing, so an early
   * hint still comes from Stockfish. The option is sticky on the worker. That is
   * safe only because `getBestMove` sends it again before every bot move.
   */
  const getFullStrengthMove = useCallback(
    async (gameState: ChessGameState, movetimeMs: number): Promise<StockfishMove> => {
      await whenReady(ENGINE_LOAD_WAIT_MS);
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error('Stockfish is not running'));
          return;
        }

        cancelSearch();
        moveResolverRef.current = resolve;
        moveRejecterRef.current = reject;

        worker.postMessage('setoption name UCI_LimitStrength value false');
        worker.postMessage(buildUciPositionCommand(gameState.moveHistory));
        worker.postMessage(`go movetime ${movetimeMs}`);
      });
    },
    [whenReady, cancelSearch],
  );

  return { isReady, getBestMove, getFullStrengthMove, cancelSearch };
}
