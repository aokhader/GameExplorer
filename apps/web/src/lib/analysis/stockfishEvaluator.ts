import type { PieceType } from '@finesse/shared';
import type { RawChessEval } from '@finesse/shared';
import { getStockfishEnginePath, getStockfishThreads, isMultiThreadSupported } from '../stockfishEngine';

const UCI_PROMOTION_MAP: Record<string, PieceType> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
};

export interface ChessEvaluator {
  /** Resolves once the engine has answered `isready`. */
  ready: Promise<void>;
  /**
   * Score one position. Resolves with the engine's final verdict for that
   * search — side-to-move relative, exactly as UCI reports it, because
   * `createChessAnalysis` owns the flip to White-positive.
   */
  evaluate(fen: string, movetimeMs: number): Promise<RawChessEval>;
  /** Clear the hash table between games so evals can't bleed across them. */
  newGame(): void;
  dispose(): void;
}

/**
 * A promise-per-position Stockfish evaluator — the web counterpart to mobile's
 * `getEngineEvaluation` on the native Arasan service.
 *
 * Deliberately NOT built on `useStockfishAnalysis`: that hook is a *live* view
 * of one position, with a debounce and a deepening ladder that keep refining
 * whatever the user is looking at. Review asks a different question — score
 * exactly this position, once, within a budget, and tell me when you're done —
 * and a scan of a 60-move game issues that question sixty times in a row. The
 * two cannot share a worker either: the analysis hook keeps its search running,
 * and UCI is a single channel.
 *
 * Requests are therefore serialised here. A search is never interrupted; the
 * next one starts when the current `bestmove` lands, which is what makes each
 * promise correspond to exactly one position.
 */
export function createChessEvaluator(): ChessEvaluator {
  const worker = new Worker(getStockfishEnginePath());

  let resolveReady: () => void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  interface Pending {
    fen: string;
    movetimeMs: number;
    resolve: (value: RawChessEval) => void;
    reject: (reason: Error) => void;
  }

  const queue: Pending[] = [];
  let active: Pending | null = null;
  let disposed = false;
  // Best score seen in this search's `info` lines. `bestmove` carries the move
  // but no score, so the last scored info line is the verdict.
  let latest: { cp: number | null; mate: number | null } = { cp: null, mate: null };

  const parseMove = (uci: string | undefined): RawChessEval['bestMove'] => {
    if (!uci || uci === '(none)' || uci.length < 4) return null;
    const promotionChar = uci.length === 5 ? uci[4] : undefined;
    return {
      from: uci.substring(0, 2),
      to: uci.substring(2, 4),
      promotion: promotionChar ? UCI_PROMOTION_MAP[promotionChar] : undefined,
    };
  };

  const runNext = () => {
    if (disposed || active || queue.length === 0) return;
    active = queue.shift()!;
    latest = { cp: null, mate: null };
    worker.postMessage(`position fen ${active.fen}`);
    worker.postMessage(`go movetime ${active.movetimeMs}`);
  };

  worker.onmessage = (e: MessageEvent) => {
    const message = typeof e.data === 'string' ? e.data : (e.data as { data?: string })?.data;
    if (typeof message !== 'string') return;

    if (message === 'uciok') {
      if (isMultiThreadSupported()) {
        worker.postMessage(`setoption name Threads value ${getStockfishThreads()}`);
      }
      worker.postMessage('isready');
      return;
    }

    if (message === 'readyok') {
      resolveReady();
      runNext();
      return;
    }

    if (!active) return;

    if (message.startsWith('info') && message.includes('score')) {
      const cpMatch = message.match(/score cp (-?\d+)/);
      const mateMatch = message.match(/score mate (-?\d+)/);
      // A mate score supersedes a cp score and vice versa — never merge them.
      if (mateMatch) latest = { cp: null, mate: parseInt(mateMatch[1], 10) };
      else if (cpMatch) latest = { cp: parseInt(cpMatch[1], 10), mate: null };
      return;
    }

    if (message.startsWith('bestmove')) {
      const done = active;
      active = null;
      done.resolve({
        cp: latest.cp,
        mate: latest.mate,
        bestMove: parseMove(message.split(' ')[1]),
      });
      runNext();
    }
  };

  worker.postMessage('uci');

  return {
    ready,
    evaluate(fen, movetimeMs) {
      if (disposed) return Promise.reject(new Error('Evaluator disposed'));
      return new Promise<RawChessEval>((resolve, reject) => {
        queue.push({ fen, movetimeMs, resolve, reject });
        runNext();
      });
    },
    newGame() {
      worker.postMessage('ucinewgame');
    },
    dispose() {
      disposed = true;
      // Anything still waiting must settle, or a caller awaits forever. This is
      // the same shape the engine uses for a superseded search, so the analysis
      // loop's existing `AbortError` check swallows it without surfacing an error.
      const abort = new Error('Evaluator disposed');
      abort.name = 'AbortError';
      if (active) active.reject(abort);
      queue.forEach((p) => p.reject(abort));
      queue.length = 0;
      active = null;
      worker.terminate();
    },
  };
}
