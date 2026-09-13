/**
 * Drive a host build of the vendored Arasan engine over UCI.
 *
 * This is the calibration counterpart to `scripts/puzzles/lib/stockfish.mjs`
 * and deliberately presents the same shape, so one harness can measure either
 * engine. The difference is what each is for: Stockfish is an optional external
 * cross-check, while this is *the engine the mobile app actually ships*, built
 * from the same sources by `apps/mobile/modules/react-native-arasan/host/`.
 *
 * Build the binary first — see that CMakeLists for the command. Point this at
 * it with ARASAN_HOST_BIN, or let the default below find it.
 *
 * Four traps, all found by running it:
 *
 *   1. **A Windows NNUE path must use backslashes.** `absolutePath()` in
 *      globals.cpp locates the drive colon and then tests the next character
 *      against PATH_CHAR, so "C:/x/y.nnue" is judged *relative* and gets the
 *      engine's own directory prepended. The file then fails to open.
 *   2. **A failed network load is not fatal to the engine, only to the
 *      measurement.** Arasan carries on and scores every position 0.00, so a
 *      whole calibration run completes and produces numbers that mean nothing.
 *      `#handshake` therefore *requires* the "loaded network" line and throws
 *      without it. Never soften this into a warning.
 *   3. **`quit` on the same pipe cuts a running search short.** Arasan polls
 *      stdin during search, so a batch of commands ending in `quit` returns a
 *      depth-1 bestmove rather than the depth asked for. Always wait for
 *      `bestmove` before sending anything else.
 *   4. **`go depth N movetime M` silently ignores the depth.** Arasan's parser
 *      assigns one search type and the LAST limit wins, so that command is a
 *      *timed* search — measured, it ran to depth 9 and used the full 2.8s
 *      where `go depth 4` finished in 2ms. A wall-clock ceiling on a depth
 *      search therefore has to be sent separately as `stop`, which `search`
 *      does. `go nodes` is not implemented in this build at all.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));

const DEFAULT_BIN =
  process.env.ARASAN_HOST_BIN ??
  (process.platform === 'win32'
    ? 'C:/ge-build/arasan-host/arasan-host.exe'
    : '/tmp/ge-build/arasan-host/arasan-host');

const DEFAULT_NNUE = resolve(
  REPO,
  'apps/mobile/modules/react-native-arasan/assets/arasanv8-20260622.nnue',
);

/** Arasan's own bounds, from options.h MIN_RATING / MAX_RATING. */
export const ARASAN_UCI_ELO_MIN = 1000;
export const ARASAN_UCI_ELO_MAX = 3450;

/**
 * Arasan's internal strength, as options.h computes it from UCI_Elo. Exposed
 * because the strength number — not the Elo — is what selects the depth cap and
 * the suboptimal-move behaviour, so every calibration result is really indexed
 * by this.
 */
export function arasanStrength(uciElo) {
  const clamped = Math.max(ARASAN_UCI_ELO_MIN, Math.min(ARASAN_UCI_ELO_MAX, uciElo));
  return Math.max(
    0,
    Math.min(
      100,
      Math.trunc(
        (100 * (clamped - ARASAN_UCI_ELO_MIN)) / (ARASAN_UCI_ELO_MAX - ARASAN_UCI_ELO_MIN),
      ),
    ),
  );
}

/** One engine process, reused across many positions. */
export class ArasanHost {
  #proc;
  #lines;
  #queue = [];
  #ready;
  #info = [];
  #failed = null;
  #exited = null;
  /** A small tail of engine output, purely so a crash can say what preceded it. */
  #recent = [];
  /** The position of the search in flight, so a crash names something reproducible. */
  #lastFen = null;

  constructor({ bin = DEFAULT_BIN, nnue = DEFAULT_NNUE, threads = 1, hashMb = 32 } = {}) {
    if (!existsSync(bin)) {
      throw new Error(
        `Arasan host binary not found at ${bin}. Build it first (see ` +
          `apps/mobile/modules/react-native-arasan/host/CMakeLists.txt) or set ARASAN_HOST_BIN.`,
      );
    }
    if (!existsSync(nnue)) {
      throw new Error(`Arasan network not found at ${nnue}.`);
    }
    this.#proc = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.#lines = createInterface({ input: this.#proc.stdout });
    this.#lines.on('line', (line) => this.#onLine(line));
    // The vendoring patch in globals.cpp prints `enginefail <what>` where
    // upstream called exit(). It can arrive on either stream.
    createInterface({ input: this.#proc.stderr }).on('line', (line) => this.#onLine(line));

    // A dead engine must be loud. Every waiter here is armed with an unref'd
    // timer, so if the process exits nothing is left holding the event loop:
    // Node simply exits mid-run with "unsettled top-level await" and no clue
    // which engine died or why. Rejecting the queue turns that into an error
    // naming the exit code and the last thing the engine said.
    this.#proc.on('exit', (code, signal) => {
      this.#exited = `engine exited (code ${code}, signal ${signal})`;
      const where = this.#lastFen ? ` Searching: ${this.#lastFen}.` : '';
      const detail =
        where + (this.#recent.length ? ` Last output: ${this.#recent.slice(-3).join(' | ')}` : '');
      for (const waiter of this.#queue.splice(0)) {
        waiter.reject?.(new Error(`${this.#exited}.${detail}`));
      }
    });

    this.#ready = this.#handshake({ threads, hashMb, nnue });
  }

  #onLine(line) {
    this.#recent.push(line);
    if (this.#recent.length > 8) this.#recent.shift();
    if (line.startsWith('enginefail')) this.#failed = line.trim();
    if (line.startsWith('info ') && line.includes(' pv ')) this.#info.push(line);
    for (const waiter of [...this.#queue]) {
      if (waiter.match(line)) {
        this.#queue.splice(this.#queue.indexOf(waiter), 1);
        waiter.resolve(line);
      }
    }
  }

  /** Resolves with the first line satisfying `match`. */
  #await(match, timeoutMs = 300_000) {
    return new Promise((res, rej) => {
      if (this.#exited) {
        rej(new Error(this.#exited));
        return;
      }
      const waiter = { match, resolve: res, reject: rej };
      this.#queue.push(waiter);
      setTimeout(() => {
        const i = this.#queue.indexOf(waiter);
        if (i >= 0) {
          this.#queue.splice(i, 1);
          rej(new Error(`Arasan timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs).unref?.();
    });
  }

  #send(cmd) {
    this.#proc.stdin.write(`${cmd}\n`);
  }

  async #handshake({ threads, hashMb, nnue }) {
    this.#send('uci');
    await this.#await((l) => l.startsWith('uciok'));

    // Backslashes, or the path is treated as relative — see trap 1 in the
    // header. `resolve` already returns them on Windows; be explicit anyway so
    // an env-supplied forward-slash path still works.
    const nnuePath = process.platform === 'win32' ? resolve(nnue).split('/').join(sep) : nnue;

    const loaded = this.#await((l) => /loaded network from file/i.test(l), 120_000).then(
      () => true,
      () => false,
    );
    this.#send(`setoption name NNUE File value ${nnuePath}`);
    // No book ships with the app either, so playing out of book here would
    // measure an engine the player never faces. Off explicitly, not by accident.
    this.#send('setoption name OwnBook value false');
    this.#send(`setoption name Threads value ${threads}`);
    this.#send(`setoption name Hash value ${hashMb}`);
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));

    // Trap 2: without this the run completes and every score is 0.00.
    if (!(await loaded)) {
      throw new Error(
        `Arasan did not load its network from ${nnuePath}. Every evaluation would be ` +
          `0.00 and the whole run would be meaningless.`,
      );
    }
    this.#throwIfFailed();
  }

  #throwIfFailed() {
    if (this.#exited) throw new Error(this.#exited);
    if (this.#failed) throw new Error(`Arasan reported ${this.#failed}`);
  }

  /**
   * Configure strength. Pass `limitStrength: false` for a full-strength
   * reference search — that is what the blunder instrument grades against.
   */
  async configure({ limitStrength, uciElo, multipv = 1 } = {}) {
    await this.#ready;
    this.#send(`setoption name MultiPV value ${multipv}`);
    if (limitStrength) {
      this.#send('setoption name UCI_LimitStrength value true');
      this.#send(
        `setoption name UCI_Elo value ${Math.max(
          ARASAN_UCI_ELO_MIN,
          Math.min(ARASAN_UCI_ELO_MAX, uciElo),
        )}`,
      );
    } else {
      this.#send('setoption name UCI_LimitStrength value false');
    }
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
    this.#throwIfFailed();
  }

  /** Clear the hash. Between games or puzzles, never between moves. */
  async newGame() {
    await this.#ready;
    this.#send('ucinewgame');
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
  }

  /**
   * Search a position and return the bestmove plus every MultiPV line at the
   * final depth.
   *
   * **You cannot ask Arasan for "depth N, but no longer than M".** Its `go`
   * parser assigns a single search type and the LAST limit on the line wins, so
   * `go depth 4 movetime 4000` is a *timed* search that ignores the depth
   * entirely — measured here, it ran to depth 9 and used the full 2.8s, which
   * is the exact opposite of what the command reads like. A wall-clock ceiling
   * on a depth search therefore has to be imposed from outside, by sending
   * `stop`, which is what this does. The shipped engine service needs the same
   * treatment.
   *
   * `go nodes` is not implemented in this build at all — protocol.cpp parses
   * only `infinite`, `depth` and `movetime`.
   */
  async search(fen, { depth, movetimeMs } = {}) {
    await this.#ready;
    this.#info = [];
    this.#lastFen = fen;
    this.#send(`position fen ${fen}`);
    if (depth == null && movetimeMs == null) {
      throw new Error('search needs a depth or a movetime');
    }

    let ceiling;
    if (depth != null) {
      // Depth is the budget; movetime becomes a ceiling enforced by `stop`.
      this.#send(`go depth ${depth}`);
      if (movetimeMs != null) {
        ceiling = setTimeout(() => this.#send('stop'), movetimeMs);
        ceiling.unref?.();
      }
    } else {
      this.#send(`go movetime ${movetimeMs}`);
    }

    let line;
    try {
      line = await this.#await((l) => l.startsWith('bestmove'), (movetimeMs ?? 0) + 300_000);
    } finally {
      if (ceiling) clearTimeout(ceiling);
    }
    this.#throwIfFailed();
    const move = line.split(/\s+/)[1];
    return {
      bestMove: !move || move === '(none)' ? null : move,
      lines: parseInfoLines(this.#info),
    };
  }

  /** Convenience: just the move. */
  async bestMove(fen, limits) {
    return (await this.search(fen, limits)).bestMove;
  }

  async quit() {
    try {
      this.#send('quit');
    } catch {
      /* already gone */
    }
    this.#lines.close();
    this.#proc.kill();
  }
}

/**
 * Reduce a run of `info` lines to the deepest line per MultiPV slot.
 *
 * Scores stay side-to-move relative, exactly as UCI defines them — the same
 * convention `parseUciInfoScore` uses in packages/shared. Callers that want a
 * White-positive number flip the sign themselves.
 */
export function parseInfoLines(lines) {
  const best = new Map();
  for (const line of lines) {
    const pv = line.match(/ pv (.+)/);
    if (!pv) continue;
    const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
    const slot = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
    const cp = line.match(/score cp (-?\d+)/);
    const mate = line.match(/score mate (-?\d+)/);
    if (!cp && !mate) continue;
    const prev = best.get(slot);
    if (prev && prev.depth > depth) continue;
    best.set(slot, {
      slot,
      depth,
      cp: cp ? Number(cp[1]) : null,
      mate: mate ? Number(mate[1]) : null,
      move: pv[1].trim().split(/\s+/)[0],
      pv: pv[1].trim().split(/\s+/),
    });
  }
  return [...best.values()].sort((a, b) => a.slot - b.slot);
}
