/**
 * The playout policy — how a simulated game is played out.
 *
 * A Monte-Carlo search never evaluates a position; it plays the game to the end
 * and lets the result stand in for an evaluation. So the *quality of the
 * playout* is the whole evaluation function, and uniform random play is a very
 * bad one. It is survivable on 81 points, where a group either lives or dies
 * within a few moves either way. On 361 points it mostly is not, which is why
 * offering 13×13 and 19×19 needed this file rather than a bigger playout budget.
 *
 * What survived measurement is one rule: **sometimes answer atari next to the
 * last move** — save a chain of ours that has just been reduced to one liberty,
 * or take an opponent chain that has. Otherwise play a uniformly random legal
 * point that is not one of our own eyes.
 *
 * It is deliberately *local*: candidates come from the points around the move
 * just played. A policy that scanned the board every move would be better Go
 * and far too slow to be worth it; the urgent reply is next to the last move
 * almost every time.
 *
 * Two other rules were written, measured, and deleted. What they were and why
 * they lost is recorded above `FULL_POLICY`, because both looked obviously
 * correct and both made the bot worse.
 */

import {
  EMPTY,
  groupSingleLiberty,
  isEye,
  isSelfAtari,
  playFast,
  scoreFast,
  type FastBoard,
  type Geometry,
  type Scratch,
} from '../fastBoard';

/** Enough for the neighbours of a point plus the liberties they imply. */
const MAX_LOCAL_CANDIDATES = 16;

export interface PolicyOptions {
  /**
   * Probability of answering atari near the last move, 0–1.
   *
   * A *probability*, not a switch, and that is the central lesson of this file.
   * A rule applied every single time makes the playout play better Go and makes
   * the search worse: every simulation from a position then follows the same
   * forced sequence, so thousands of playouts explore one line instead of
   * thousands, and the estimate they average is confidently wrong. Randomising
   * the rule keeps the knowledge and keeps the diversity.
   */
  tactics: number;
  /**
   * Refuse self-atari in the random fallback. Measured harmful; kept only so
   * the ablation that condemned it can still be re-run.
   */
  avoidSelfAtari: boolean;
}

/**
 * The shipped policy. Both numbers are measured, and the measurements are the
 * reason this file is as short as it is.
 *
 * Games against an otherwise identical search playing uniformly random
 * playouts, colours alternated — 10 games at 9×9 (120 playouts), 6 at 13×13
 * (80 playouts), reported as wins and average final lead:
 *
 * ```
 *                                             9×9           13×13
 *   answer atari ALWAYS, refuse self-atari   1/10   −40     0/6   −169
 *   answer atari always, self-atari allowed  3/10   −34     2/6    −29
 *   answer atari p=0.75                      4/10    +4
 *   answer atari p=0.5                       5/10    −8     5/6    +99
 *   answer atari p=0.25                      7/10   +14     5/6    +87
 *   answer atari p=0.5 AND 3×3 patterns      3/10   −24
 * ```
 *
 * Three findings, all counter-intuitive, all worth keeping:
 *
 * 1. **A deterministic tactical rule is worse than no rule at all.** Answering
 *    atari every time is better Go and a worse search — see `tactics`.
 *    Randomising it turned a 3/10 loss into a 7/10 win without changing a line
 *    of the rule itself.
 * 2. **Refusing self-atari in the random fallback is harmful**, badly enough to
 *    swamp everything else. It reads like an obvious improvement — self-atari is
 *    a beginner's blunder — but a playout is not trying to play well, it is
 *    trying to sample how the position resolves. Forbidding a whole class of
 *    move stops groups dying that should die, so playouts report dead groups
 *    alive and the search inherits that verdict.
 * 3. **A hand-written 3×3 pattern set made things worse and was deleted.** Four
 *    shapes — hane, cut and two edge patterns — measured neutral on their own
 *    and −24 points alongside the tactical rule. That is a verdict on *those
 *    four shapes*, not on the technique: MoGo's set was tuned over far more
 *    patterns and far more compute. Anyone re-adding patterns now has a number
 *    to beat.
 *
 * The gain is much larger at 13×13 (+87) than at 9×9 (+14), which is exactly
 * the expected shape: the bigger the board, the less a uniform playout tells
 * you, and the more a little knowledge is worth.
 */
export const FULL_POLICY: PolicyOptions = {
  tactics: 0.25,
  avoidSelfAtari: false,
};

/** Uniform random play — the baseline every measurement above is against. */
export const UNIFORM_POLICY: PolicyOptions = {
  tactics: 0,
  avoidSelfAtari: false,
};

/** A reusable candidate buffer, one per search. */
export const createLocalBuffer = (): Int16Array => new Int16Array(MAX_LOCAL_CANDIDATES);

/**
 * Moves worth playing immediately in answer to `last`, written into `out`.
 * Returns how many were found.
 *
 * Both halves look only at chains touching the point just played:
 *  - an opponent chain there with one liberty can be **captured**, which is
 *    almost always right and is what makes playouts resolve capture races
 *    instead of wandering past them;
 *  - one of ours with one liberty is in **atari**, and its single liberty is
 *    the move that saves it — unless playing there is itself self-atari, in
 *    which case the group is lost and pretending otherwise wastes the playout.
 */
function urgentMoves(
  board: FastBoard,
  geo: Geometry,
  last: number,
  color: number,
  scratch: Scratch,
  out: Int16Array,
): number {
  const { neighbors, neighborCount } = geo;
  const base = last * 4;
  let count = 0;

  for (let i = 0; i < neighborCount[last] && count < MAX_LOCAL_CANDIDATES; i++) {
    const neighbor = neighbors[base + i];
    const stone = board[neighbor];
    if (stone === EMPTY) continue;

    const liberty = groupSingleLiberty(board, geo, neighbor, scratch);
    if (liberty < 0) continue;
    if (stone === color && isSelfAtari(board, geo, liberty, color, scratch)) continue;
    out[count++] = liberty;
  }

  // The stone just played can itself be in atari, and taking it is a reply the
  // loop above misses — it walks the neighbours of `last`, not `last` itself.
  if (count < MAX_LOCAL_CANDIDATES && board[last] !== EMPTY && board[last] !== color) {
    const liberty = groupSingleLiberty(board, geo, last, scratch);
    if (liberty >= 0) out[count++] = liberty;
  }

  return count;
}

/**
 * Try `count` candidates from `list` in a random order, playing the first that
 * is legal and not one of our own eyes. Returns the point played, or −1.
 */
function tryCandidates(
  board: FastBoard,
  geo: Geometry,
  list: Int16Array,
  count: number,
  color: number,
  random: () => number,
  scratch: Scratch,
): number {
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (count - i));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;

    const idx = list[i];
    if (board[idx] !== EMPTY) continue;
    if (isEye(board, geo, idx, color)) continue;
    if (playFast(board, geo, idx, color, scratch)) return idx;
  }
  return -1;
}

/**
 * One move for `color`, applied to the board. Returns the point played, or −1
 * when there is nothing left but to pass.
 *
 * The random fallback is a partial Fisher–Yates over `scratch.order`, which
 * gives a uniform choice with an early exit: a playable point is usually found
 * in the first few draws, and the full scan only happens near the end.
 *
 * A point refused only for self-atari is remembered rather than discarded. Late
 * in a playout almost every remaining point is self-atari, and a player who
 * passed with points still on the board would hand the playout a final score
 * nobody would ever have reached.
 */
export function policyMove(
  board: FastBoard,
  geo: Geometry,
  color: number,
  last: number,
  random: () => number,
  scratch: Scratch,
  options: PolicyOptions,
  local: Int16Array,
): number {
  if (last >= 0) {
    if (options.tactics > 0 && random() < options.tactics) {
      const count = urgentMoves(board, geo, last, color, scratch, local);
      const played = tryCandidates(board, geo, local, count, color, random, scratch);
      if (played >= 0) return played;
    }
  }

  const order = scratch.order;
  const n = geo.points;
  let fallback = -1;

  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (n - i));
    const swap = order[i];
    order[i] = order[j];
    order[j] = swap;

    const idx = order[i];
    if (board[idx] !== EMPTY) continue;
    if (isEye(board, geo, idx, color)) continue;

    if (options.avoidSelfAtari && isSelfAtari(board, geo, idx, color, scratch)) {
      if (fallback < 0) fallback = idx;
      continue;
    }
    if (playFast(board, geo, idx, color, scratch)) return idx;
  }

  if (fallback >= 0 && playFast(board, geo, fallback, color, scratch)) return fallback;
  return -1;
}

/**
 * Play the position out and return the final area difference (black − white),
 * komi excluded.
 *
 * `onMove` is how RAVE collects its statistics: every point played in the
 * simulation is reported with the colour that played it, which is the whole of
 * the all-moves-as-first heuristic. It is optional so the same playout serves a
 * search that does not want the bookkeeping.
 *
 * The move cap guarantees termination: playouts skip the superko test, so a ko
 * could in principle be recaptured forever. In practice play exhausts the board
 * long before the cap.
 */
export function policyPlayout(
  board: FastBoard,
  geo: Geometry,
  colorToMove: number,
  lastMove: number,
  random: () => number,
  scratch: Scratch,
  options: PolicyOptions,
  local: Int16Array,
  onMove?: (idx: number, color: number) => void,
): number {
  let color = colorToMove;
  let last = lastMove;
  let passes = 0;
  const cap = geo.points * 3;

  for (let move = 0; move < cap && passes < 2; move++) {
    const played = policyMove(board, geo, color, last, random, scratch, options, local);
    if (played === -1) {
      passes++;
    } else {
      passes = 0;
      last = played;
      onMove?.(played, color);
    }
    color = color === 1 ? 2 : 1;
  }

  return scoreFast(board, geo, scratch);
}
