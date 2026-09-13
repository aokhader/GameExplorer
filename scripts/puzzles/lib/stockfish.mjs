/**
 * Drive Stockfish as a separate process speaking UCI.
 *
 * **Licence hygiene, and why this shape.** Stockfish.js is GPL-3.0 and
 * `apps/web/public/stockfish/README.md` is explicit that it is *aggregated
 * with*, not linked into, the MIT application. Spawning it as its own process
 * and talking UCI over stdin/stdout keeps that true: nothing here is imported
 * into shipped source, and the only thing that crosses the boundary is a rating
 * number, which is not a derivative work. Do not "simplify" this by requiring
 * the module — that would be the one change that alters the repo's licensing.
 *
 * **The two things that do not work**, both found by measurement rather than
 * guessed (Spike 2):
 *   - `node stockfish.js` with stdin piped and CLOSED produces no output at
 *     all. The WASM boot is async and the process exits the moment stdin ends.
 *     stdin has to stay open.
 *   - `require()`-ing the module hands back a bare function with no
 *     `postMessage`, so the worker-style API the web app uses is not available
 *     under Node.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

/** One engine process, reused across many positions. */
export class Stockfish {
  #proc;
  #lines;
  #queue = [];
  #ready;

  constructor(enginePath) {
    this.#proc = spawn(process.execPath, [enginePath], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.#lines = createInterface({ input: this.#proc.stdout });
    this.#lines.on('line', (line) => {
      for (const waiter of [...this.#queue]) {
        if (waiter.match(line)) {
          this.#queue.splice(this.#queue.indexOf(waiter), 1);
          waiter.resolve(line);
        }
      }
    });
    this.#ready = this.#handshake();
  }

  /**
   * Resolves with the first line satisfying `match`.
   *
   * The timeout is deliberately enormous. It exists to catch an engine that has
   * genuinely died, not to bound a search: a calibration run boots a dozen or
   * more of these at once, and a WASM boot under that much contention took long
   * enough to trip a 60s guard — which failed the whole run for no reason but
   * impatience.
   */
  #await(match, timeoutMs = 300_000) {
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve };
      this.#queue.push(waiter);
      setTimeout(() => {
        const i = this.#queue.indexOf(waiter);
        if (i >= 0) {
          this.#queue.splice(i, 1);
          reject(new Error(`Stockfish timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs).unref?.();
    });
  }

  #send(cmd) {
    this.#proc.stdin.write(`${cmd}\n`);
  }

  async #handshake() {
    this.#send('uci');
    await this.#await((l) => l.startsWith('uciok'));
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
  }

  /** Pin the engine to one tier for the whole run. */
  async setElo(elo) {
    await this.#ready;
    this.#send('setoption name UCI_LimitStrength value true');
    this.#send(`setoption name UCI_Elo value ${elo}`);
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
  }

  /**
   * Pin the engine to a `Skill Level` (0-20) instead of a `UCI_Elo`.
   *
   * The two are different mechanisms and must not be mixed: `UCI_Elo` claims a
   * rating and refuses to go below 1320, while `Skill Level` is an uncalibrated
   * handicap that reaches further down. That makes it the only Stockfish rung
   * available for opponents weaker than 1320 — useful as a *relative* yardstick,
   * never as an absolute anchor, because nothing maps a skill number to a rating.
   *
   * Additive: nothing in the puzzle pipeline calls this.
   */
  async setSkill(level) {
    await this.#ready;
    this.#send('setoption name UCI_LimitStrength value false');
    this.#send(`setoption name Skill Level value ${Math.max(0, Math.min(20, level))}`);
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
  }

  /**
   * Clear the hash. Call between PUZZLES, not between moves.
   *
   * Between puzzles it is necessary: otherwise a search carries a table built
   * on an unrelated position, and a puzzle's rating would depend on what was
   * calibrated before it. Between moves of the same puzzle it is actively
   * wrong — the shipped bot keeps its table across a game, so clearing it here
   * would measure a weaker engine than the one the player faces, and pay two
   * extra round trips per move for the privilege.
   */
  async newGame() {
    await this.#ready;
    this.#send('ucinewgame');
    this.#send('isready');
    await this.#await((l) => l.startsWith('readyok'));
  }

  /**
   * Best move from a FEN, as a raw UCI string ("e2e4"), or null for a finished
   * position ("bestmove (none)").
   */
  async bestMove(fen, movetimeMs) {
    await this.#ready;
    this.#send(`position fen ${fen}`);
    this.#send(`go movetime ${movetimeMs}`);
    const line = await this.#await((l) => l.startsWith('bestmove'), movetimeMs + 30_000);
    const move = line.split(/\s+/)[1];
    return !move || move === '(none)' ? null : move;
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
