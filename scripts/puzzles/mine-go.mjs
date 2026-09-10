/**
 * Compose Go life-and-death problems by enumerating eye shapes.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/puzzles/mine-go.mjs --target=60
 *
 * Separate from `mine.mjs` because nothing about it is the same. Checkers and
 * reversi are *mined* — positions are sampled out of played games and tested
 * for a margin. Go is **composed**: the interesting positions are eye shapes,
 * there are not many of them, and they are enumerated rather than stumbled on.
 * A whole-board Go bot is also useless here — Spike 1 measured it solving 1 of
 * 14 shipped tsumego at any tier, because MCTS averages random playouts and a
 * three-point eye space needs an exact reading.
 *
 * **The proof standard is unchanged, and at the easy end it got stricter.**
 * `solveTsumego` searches the region exhaustively and a shape is emitted only
 * when what it comes back with is written down *completely*: the winning first
 * move, and — where more than one move wins — every other one, in
 * `PuzzleStep.also`. Nothing here is heuristic.
 *
 * Insisting the answer be UNIQUE is what used to keep this composer out of the
 * Beginner band, and it was the wrong bar. Measured over the whole enumeration,
 * every single candidate that rates below 650 has more than one winning move —
 * multiplicity is not incidental to easy life-and-death, it is what makes it
 * easy. What actually protects the player is completeness, because the runtime
 * calls a move wrong precisely by not finding it in the set: a winning move
 * left out is somebody being told "not quite" and then shown a refutation of a
 * move that cannot be refuted.
 *
 * Two conditions replace uniqueness, and both are stricter than it sounds:
 *
 * - **Passing must not win.** If the goal is already achieved then the position
 *   is settled and there is nothing to find, however many moves keep it that
 *   way. This is the real "is there a puzzle here" test, and uniqueness was
 *   only ever standing in for it.
 * - **Every accepted move must settle the fight on the spot.** The data holds
 *   one line and `reply` is one string, so a set of answers that each lead
 *   somewhere different cannot be written down. In practice this is no
 *   restriction on the easy end and rules the harder shapes out of the set.
 *
 * **The plan's pass-alive check is deliberately not applied.** It proposed
 * discarding any shape whose surrounding wall is not unconditionally alive by
 * Benson's criterion. Measured against the shipped set, that rejects *all
 * fourteen*: a one-thick wall on an otherwise empty 9×9 has no eyes and is
 * never pass-alive. It is not the standard this repo actually holds, and
 * adopting it would have produced an empty corpus and a red build. What stands
 * in its place is the condition the content gate really needs — the target's
 * every liberty lies inside the region, so it cannot run — plus a soundness
 * floor of two outside liberties per enclosing group, so the frame cannot be
 * captured from the part of the board the problem does not draw.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

const { PUZZLE_RULES } = await import(SHARED + 'puzzles/rules.ts');
const { startPuzzle, applyPlayerMove, applyOpponentReply } = await import(
  SHARED + 'puzzles/runtime.ts'
);
const { solveTsumego } = await import(SHARED + 'game-logic/go/tsumego.ts');
const { getGroup } = await import(SHARED + 'game-logic/go/moves.ts');
const { getStoneAt, getOpponentColor } = await import(SHARED + 'game-logic/go/utils.ts');
const { GoEngine } = await import(SHARED + 'game-logic/go/engine.ts');
const { GO_PUZZLES } = await import(SHARED + 'constants/puzzles/index.ts');

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = join(ROOT, 'data', 'puzzles');
const SIZE = 9;

/** The gate's own ceiling on how wide a fight may be drawn. */
const MAX_REGION = 12;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

const point = (row, col) => String.fromCharCode(97 + col) + (row + 1);
const onBoard = (row, col) => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
const neighbours = (row, col) =>
  [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]].filter(([r, c]) => onBoard(r, c));

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/**
 * The classical eye shapes, as offsets. These are the shapes life-and-death is
 * actually *about* — the ones whose vital points are worth knowing — which is
 * why they are written out rather than generated as arbitrary connected blobs.
 * A random six-point blob is a position; a rabbity six is a lesson.
 */
const SHAPES = {
  'straight-three': [[0, 0], [0, 1], [0, 2]],
  'bent-three': [[0, 0], [0, 1], [1, 0]],
  'square-four': [[0, 0], [0, 1], [1, 0], [1, 1]],
  'straight-four': [[0, 0], [0, 1], [0, 2], [0, 3]],
  'bent-four': [[0, 0], [0, 1], [0, 2], [1, 0]],
  'pyramid-four': [[0, 0], [0, 1], [0, 2], [1, 1]],
  'bulky-five': [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1]],
  'crossed-five': [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]],
  'straight-five': [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
  'rabbity-six': [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [1, 2]],
  'bulky-six': [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]],
  'flower-six': [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 1]],
  // Seven and eight points reach the Master band, which nothing smaller does:
  // the structural model reads region size hardest of the four features, and a
  // six-point space tops out around 1800. They also cost the most to settle,
  // so they sit at the end where the node limit bites first.
  'straight-six': [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]],
  'ell-seven': [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2]],
  'comb-seven': [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 1], [1, 3]],
  'stair-seven': [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [1, 3], [2, 3]],
  'rect-eight': [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3]],
  'plus-eight': [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [1, 3], [2, 1], [2, 2]],
};

/**
 * Where a shape is anchored. Corner and edge problems are the common ones and
 * the board edge does half the enclosing work; a centre problem needs a full
 * ring of stones and is a different (harder) kind of question.
 */
const ANCHORS = [
  { name: 'corner', row: 0, col: 0 },
  { name: 'edge', row: 0, col: 3 },
  { name: 'centre', row: 3, col: 3 },
];

// ---------------------------------------------------------------------------
// Board construction
// ---------------------------------------------------------------------------

const template = PUZZLE_RULES.go.decode(GO_PUZZLES[0].position);

function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

/** Encode through the rules, then decode, so the position round-trips by construction. */
function toPosition(board, turn) {
  return PUZZLE_RULES.go.encode({ ...template, board, currentTurn: turn });
}

/**
 * Build one candidate: an eye space, the defender's wall around it, and the
 * attacker's stones sealing that wall in.
 *
 * Returns null when the shape does not fit on the board at this anchor, or when
 * the construction produces something that could not stand in a real game.
 */
function compose(shape, anchor, defender, fills) {
  const attacker = getOpponentColor(defender);
  const board = emptyBoard();

  const eye = shape.map(([dr, dc]) => [anchor.row + dr, anchor.col + dc]);
  if (eye.some(([r, c]) => !onBoard(r, c))) return null;
  const eyeKeys = new Set(eye.map(([r, c]) => `${r},${c}`));

  // The defender's group is everything orthogonally touching the eye space.
  const wall = [];
  for (const [r, c] of eye) {
    for (const [nr, nc] of neighbours(r, c)) {
      if (!eyeKeys.has(`${nr},${nc}`) && !wall.some(([a, b]) => a === nr && b === nc)) {
        wall.push([nr, nc]);
      }
    }
  }
  for (const [r, c] of wall) board[r][c] = defender;

  // The attacker seals that group in, so its only liberties are the eye space.
  const wallKeys = new Set(wall.map(([r, c]) => `${r},${c}`));
  const seal = [];
  for (const [r, c] of wall) {
    for (const [nr, nc] of neighbours(r, c)) {
      const k = `${nr},${nc}`;
      if (!eyeKeys.has(k) && !wallKeys.has(k) && !seal.some(([a, b]) => a === nr && b === nc)) {
        seal.push([nr, nc]);
      }
    }
  }
  for (const [r, c] of seal) board[r][c] = attacker;

  // Stones already played inside the eye space — a throw-in, or the defender
  // having started. This is where most of the variety comes from: the same
  // shape with one stone in it is a different problem, and often a harder one.
  for (const [idx, colour] of fills) {
    const [r, c] = eye[idx];
    board[r][c] = colour === 'd' ? defender : attacker;
  }

  const region = eye.map(([r, c]) => point(r, c));
  if (region.length > MAX_REGION) return null;

  // Every stone standing must have a liberty — a group with none is a diagram,
  // not a position.
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === null) continue;
      const group = getGroup(board, point(r, c), SIZE);
      if (!group || group.liberties.length === 0) return null;
    }
  }

  // The target must be sealed: every liberty inside the region, or the answer
  // would depend on a part of the board the problem never drew.
  const target = point(wall[0][0], wall[0][1]);
  if (getStoneAt(board, target) !== defender) return null;
  const group = getGroup(board, target, SIZE);
  if (!group || group.liberties.some((l) => !region.includes(l))) return null;

  // Soundness floor: the sealing stones must not be capturable from outside the
  // region, or the frame the problem rests on is not actually settled.
  for (const [r, c] of seal) {
    const g = getGroup(board, point(r, c), SIZE);
    if (!g) continue;
    if (g.liberties.filter((l) => !region.includes(l)).length < 2) return null;
  }

  return { board, region, target, defender, attacker };
}

// ---------------------------------------------------------------------------
// Symmetry
// ---------------------------------------------------------------------------

/**
 * The board under all eight symmetries of the square, smallest string wins.
 *
 * Without this the same shape ships up to eight times — once per rotation and
 * reflection — which makes a corpus look larger than it is and puts what is
 * visibly the same problem in front of a player repeatedly.
 */
function canonicalKey(board, turn) {
  let best = null;
  let b = board;
  for (let flip = 0; flip < 2; flip++) {
    for (let rot = 0; rot < 4; rot++) {
      const s = b.map((row) => row.map((c) => (c === 'black' ? 'X' : c === 'white' ? 'O' : '.')).join('')).join('');
      if (best === null || s < best) best = s;
      b = b[0].map((_, i) => b.map((row) => row[i]).reverse()); // rotate 90°
    }
    b = b.map((row) => [...row].reverse()); // mirror, then rotate again
  }
  return `${best} ${turn}`;
}

// ---------------------------------------------------------------------------
// Solve and build the line
// ---------------------------------------------------------------------------

/**
 * Does this winning move end the fight there and then?
 *
 * The condition a set of accepted answers has to meet. One line can only be
 * written down if every move in the set arrives at the same place — settled —
 * because after that there is nothing left for the data to say.
 *
 * Returns the resulting state so the caller does not search twice.
 */
function settlesOutright(current, move, region, target, goal, opponent) {
  const played = GoEngine.validateMove(current, move);
  if (!played.valid || !played.resultingState) return null;
  const after = played.resultingState;
  if (getStoneAt(after.board, target) === null) {
    // Captured. Only a kill can end that way, and it is as settled as it gets.
    return goal === 'kill' ? after : null;
  }
  try {
    const rebuttal = solveTsumego(
      { ...after, currentTurn: opponent },
      { region, target, goal: goal === 'kill' ? 'live' : 'kill' },
    );
    return rebuttal.solved ? null : after;
  } catch {
    return null;
  }
}

/**
 * Which of several equally-winning moves the line is written around.
 *
 * A tiebreak, not a judgement. `solveTsumego` has proved these moves are
 * *equally* winning, so nothing here may claim one is better — the runtime's
 * copy is careful about that too. What it must be is deterministic, or the same
 * shape composed twice would ship two different main lines.
 *
 * Ordered by how concrete the move is: taking the stones off the board beats
 * settling the position with them still standing, and leaving the defender
 * fewer replies beats leaving them more. Board order breaks what is left.
 */
function canonicalFirst(current, moves, region, target, opponent) {
  return [...moves].sort((a, b) => {
    const score = (move) => {
      const played = GoEngine.validateMove(current, move);
      const after = played.resultingState;
      if (!after) return [2, 99];
      const captured = getStoneAt(after.board, target) === null ? 0 : 1;
      const replies = GoEngine.getAllLegalMoves({ ...after, currentTurn: opponent }).filter((m) =>
        region.includes(m),
      ).length;
      return [captured, replies];
    };
    const [ca, ra] = score(a);
    const [cb, rb] = score(b);
    return ca - cb || ra - rb || (a < b ? -1 : 1);
  });
}

/**
 * Play the problem out, one proved move at a time, until the opponent can no
 * longer achieve the opposite goal.
 *
 * That end condition is exactly the gate's "delivers the goal at the end of the
 * line" assertion, so a line built this way satisfies it by construction. It
 * usually terminates in one or two moves, which is also the shape the shipped
 * Go puzzles have.
 */
function buildLine(state, region, target, goal) {
  const defender = getStoneAt(state.board, target);
  const attacker = getOpponentColor(defender);
  const solver = goal === 'kill' ? attacker : defender;
  const opponent = getOpponentColor(solver);
  const oppositeGoal = goal === 'kill' ? 'live' : 'kill';

  const steps = [];
  let current = state;
  let firstSolve = null;

  for (let ply = 0; ply < 6; ply++) {
    let solved;
    try {
      solved = solveTsumego(current, { region, target, goal });
    } catch {
      return null; // node limit — the region is too wide to settle
    }
    if (!solved.solved) return null;

    if (ply === 0) {
      firstSolve = solved;
      // Doing nothing already achieves the goal, so there is nothing to find.
      // This is the bar uniqueness used to stand in for, and unlike uniqueness
      // it is about the position rather than about how many ways there are to
      // hold it.
      if (solved.winningMoves.includes('pass')) return null;

      if (solved.winningMoves.length > 1) {
        // Every accepted move has to arrive at the same place, because one line
        // is all the data can hold. Nothing further is scripted — that is what
        // makes the set expressible, and what the content gate re-proves.
        for (const candidate of solved.winningMoves) {
          if (!settlesOutright(current, candidate, region, target, goal, opponent)) return null;
        }
        const ordered = canonicalFirst(current, solved.winningMoves, region, target, opponent);
        return { steps: [{ move: ordered[0], also: ordered.slice(1) }], firstSolve };
      }
    }
    const move = solved.winningMoves[0];
    if (move === 'pass') return null;

    const played = GoEngine.validateMove(current, move);
    if (!played.valid || !played.resultingState) return null;
    steps.push({ move });
    current = played.resultingState;

    if (getStoneAt(current.board, target) === null) break; // captured outright

    let rebuttal;
    try {
      rebuttal = solveTsumego({ ...current, currentTurn: opponent }, { region, target, goal: oppositeGoal });
    } catch {
      return null;
    }
    if (!rebuttal.solved) break; // settled — the line is complete

    // The opponent's most stubborn reply: the one that leaves the solver the
    // fewest ways to win. Deterministic, and it produces the line a player
    // would actually have to read rather than the first legal answer.
    const replies = rebuttal.winningMoves.filter((m) => m !== 'pass');
    if (replies.length === 0) break;
    let bestReply = null;
    let fewest = Infinity;
    for (const reply of replies.sort()) {
      const after = GoEngine.validateMove({ ...current, currentTurn: opponent }, reply);
      if (!after.valid || !after.resultingState) continue;
      try {
        const next = solveTsumego(after.resultingState, { region, target, goal });
        if (next.solved && next.winningMoves.length < fewest) {
          fewest = next.winningMoves.length;
          bestReply = { move: reply, state: after.resultingState };
        }
      } catch {
        /* skip a reply we cannot settle */
      }
    }
    if (!bestReply) break;
    steps[steps.length - 1].reply = bestReply.move;
    current = bestReply.state;
  }

  return { steps, firstSolve };
}

// ---------------------------------------------------------------------------
// Verification — the gate's Go assertions, before emitting
// ---------------------------------------------------------------------------

/** The side that answers the solver, for a puzzle already known to be well formed. */
function opponentOf(state, puzzle) {
  const defender = getStoneAt(state.board, puzzle.target);
  return puzzle.goal === 'kill' ? defender : getOpponentColor(defender);
}

function verify(puzzle) {
  const rules = PUZZLE_RULES.go;
  const state = rules.decode(puzzle.position);

  if (rules.encode(state) !== puzzle.position) return 'position does not round-trip';
  if (state.size !== 9) return 'not a 9×9 board';
  if (rules.isGameOver(state)) return 'already over';
  if (GoEngine.getAllLegalMoves(state).length === 0) return 'no legal moves';
  if (puzzle.region.length > MAX_REGION) return 'region too wide';
  if (new Set(puzzle.region).size !== puzzle.region.length) return 'region repeats a point';
  if (puzzle.goalValue !== undefined) return 'goalValue is a chess field';

  const defender = getStoneAt(state.board, puzzle.target);
  if (defender === null) return 'target is an empty point';
  const mover = puzzle.goal === 'kill' ? getOpponentColor(defender) : defender;
  if (state.currentTurn !== mover) return 'wrong side to move';
  if (puzzle.playerColor !== mover) return 'playerColor disagrees with the goal';

  const group = getGroup(state.board, puzzle.target, state.size);
  if (group.liberties.some((l) => !puzzle.region.includes(l))) return 'the target can escape';

  for (const step of puzzle.steps) {
    if (step.move === 'pass' || step.reply === 'pass') return 'scripts a pass';
  }

  const solved = solveTsumego(state, { region: puzzle.region, target: puzzle.target, goal: puzzle.goal });
  if (!solved.solved) return 'not solvable as stated';
  if (solved.winningMoves.includes('pass')) return 'the goal is already achieved — nothing to find';

  // Set equality with what the solver found, in both directions — the same
  // assertion the content gate makes, so nothing is emitted that it would then
  // reject. The second direction is the one that matters: a winning move left
  // out of `also` is a player being told a correct answer is wrong.
  const accepted = [puzzle.steps[0].move, ...(puzzle.steps[0].also ?? [])];
  if (accepted.slice().sort().join(',') !== solved.winningMoves.slice().sort().join(',')) {
    return `accepts ${accepted.join('/')} but ${solved.winningMoves.join('/')} work`;
  }
  if (puzzle.steps[0].also?.length) {
    // The gate allows a set only on a single-step line with no reply, because a
    // second accepted move at a ply that owes an answer makes the data a tree.
    if (puzzle.steps.length !== 1 || puzzle.steps[0].reply !== undefined) {
      return 'alternatives on a line that continues';
    }
    for (const alternative of puzzle.steps[0].also) {
      if (!settlesOutright(state, alternative, puzzle.region, puzzle.target, puzzle.goal, opponentOf(state, puzzle))) {
        return `${alternative} does not settle the fight`;
      }
    }
  }

  // Walk the line through the real runtime.
  let run = startPuzzle(puzzle, rules);
  for (const step of puzzle.steps) {
    const played = applyPlayerMove(run, rules, rules.parseMove(step.move));
    if (played.result !== 'correct' && played.result !== 'solved') return `step came back '${played.result}'`;
    run = played.run;
    if (step.reply !== undefined) run = applyOpponentReply(run, rules);
  }
  if (run.phase !== 'solved') return 'line does not end solved';

  // The goal is delivered: the opponent can no longer turn it around.
  if (getStoneAt(run.state.board, puzzle.target) === null) {
    return puzzle.goal === 'kill' ? null : 'the target was captured in a live puzzle';
  }
  const opponentGoal = puzzle.goal === 'kill' ? 'live' : 'kill';
  const opponent = puzzle.goal === 'kill' ? defender : getOpponentColor(defender);
  const rebuttal = solveTsumego(
    { ...run.state, currentTurn: opponent },
    { region: puzzle.region, target: puzzle.target, goal: opponentGoal },
  );
  if (rebuttal.solved) return `${opponent} can still ${opponentGoal}`;
  return null;
}

/**
 * What to say about the answer, given how many moves there are.
 *
 * The old copy said "every other move lets the group make two eyes" on every
 * problem this composer emitted. That was true while the answer was forced and
 * would be a plain falsehood on a shape with three answers — the kind of thing
 * a player checks against the board and stops trusting the mode over.
 */
function explain(goal, answers) {
  if (answers === 1) {
    return goal === 'kill'
      ? 'This is the vital point of the shape — every other move lets the group make two eyes.'
      : 'This is the only point that makes room for two eyes.';
  }
  // Both sentences lean on the condition that got these problems emitted at
  // all: passing does not win. For a kill that means the group WOULD live if
  // left alone, and for a live puzzle it means the group dies if left alone.
  // Saying anything more — that the shape cannot hold two eyes, say — would be
  // the sort of claim a player checks against the board and stops trusting.
  return goal === 'kill'
    ? `The group is one move away from living, and ${answers} different points deny it. ` +
        'The line plays one of them; the others are just as good.'
    : `Left alone the group dies; ${answers} different points save it. ` +
        'The line plays one of them; the others are just as good.';
}

// ---------------------------------------------------------------------------
// Enumerate
// ---------------------------------------------------------------------------

mkdirSync(CORPUS_DIR, { recursive: true });
const file = join(CORPUS_DIR, 'go.jsonl');
const existing = existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const seen = new Set();
for (const p of [...existing, ...GO_PUZZLES]) {
  seen.add(canonicalKey(PUZZLE_RULES.go.decode(p.position).board, p.playerColor === 'black' ? 'b' : 'w'));
}
let nextId = existing.reduce((n, p) => Math.max(n, Number(p.id.split('-')[1])), 999) + 1;

const target = Number(args.target ?? 60);
const rejected = {};
let emitted = 0;
let tried = 0;

/** Nothing in the eye space, one stone in it, or two. */
function* fillSets(size) {
  yield [];
  for (let i = 0; i < size; i++) {
    yield [[i, 'a']];
    yield [[i, 'd']];
  }
  for (let i = 0; i < size; i++) {
    for (let j = i + 1; j < size; j++) {
      yield [[i, 'a'], [j, 'd']];
      yield [[i, 'd'], [j, 'a']];
    }
  }
}

console.log(`Composing Go problems: target ${target}…`);

outer: for (const [shapeName, shape] of Object.entries(SHAPES)) {
  for (const anchor of ANCHORS) {
    for (const defender of ['black', 'white']) {
      for (const fills of fillSets(shape.length)) {
        for (const goal of ['kill', 'live']) {
          if (emitted >= target) break outer;
          tried++;

          const composed = compose(shape, anchor, defender, fills);
          if (!composed) continue;

          const solver = goal === 'kill' ? composed.attacker : composed.defender;
          const position = toPosition(composed.board, solver);
          const state = PUZZLE_RULES.go.decode(position);

          const key = canonicalKey(state.board, solver === 'black' ? 'b' : 'w');
          if (seen.has(key)) continue;

          // A region offering exactly one legal move is not a problem — there
          // is nothing to find, and `solveTsumego` calling that single move
          // "forced" is true but vacuous. Checked before the search, because
          // it is the cheap half.
          const choices = GoEngine.getAllLegalMoves(state).filter((m) =>
            composed.region.includes(m),
          ).length;
          if (choices < 2) {
            rejected['only one legal move in the region'] =
              (rejected['only one legal move in the region'] ?? 0) + 1;
            continue;
          }

          const built = buildLine(state, composed.region, composed.target, goal);
          if (!built) {
            rejected['not forced / not solvable'] = (rejected['not forced / not solvable'] ?? 0) + 1;
            continue;
          }

          const puzzle = {
            id: `go-${nextId}`,
            game: 'go',
            position,
            playerColor: solver,
            goal,
            region: composed.region,
            target: composed.target,
            prompt: `${solver === 'black' ? 'Black' : 'White'} to play and ${goal === 'kill' ? 'kill' : 'live'}.`,
            difficulty: 'medium',
            // Replaced by `calibrate.mjs --game=go`, which fits the structural
            // model to the hand-rated fourteen. Shipping this number would be
            // inventing a difficulty.
            rating: 1100,
            // `vital-point` is a claim of uniqueness, so it is only earned when
            // the answer really is the only one. A shape with several answers
            // is an eye-shape problem, which is what it was all along.
            themes: [
              built.steps[0].also?.length || composed.region.length <= 3
                ? 'eye-shape'
                : 'vital-point',
            ],
            steps: built.steps,
            explanation: explain(goal, 1 + (built.steps[0].also?.length ?? 0)),
            source: `Composed from the ${shapeName} eye shape, proved exhaustively by solveTsumego.`,
          };

          const problem = verify(puzzle);
          if (problem) {
            rejected[problem] = (rejected[problem] ?? 0) + 1;
            continue;
          }

          appendFileSync(file, JSON.stringify(puzzle) + '\n', 'utf8');
          seen.add(key);
          nextId++;
          emitted++;
          if (emitted % 10 === 0) console.log(`  ${emitted}/${target} (${tried} shapes tried)`);
        }
      }
    }
  }
}

console.log(`\ngo: emitted ${emitted} from ${tried} candidate shapes → ${file}`);
if (Object.keys(rejected).length) {
  console.log('\nRejected:');
  for (const [why, n] of Object.entries(rejected).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${why}`);
  }
}
