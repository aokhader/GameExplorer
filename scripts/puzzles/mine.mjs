/**
 * Mine puzzles for the games that have no public corpus to import.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/puzzles/mine.mjs --game=checkers --target=300 --seed=1
 *   ./node_modules/.bin/tsx scripts/puzzles/mine.mjs --game=reversi  --target=300 --seed=1
 *
 * Chess has Lichess; checkers and reversi have us. This finds positions where
 * one move is decisively better than every other, proves it with the same
 * analyser the content gate uses, plays the line out, and emits only what
 * already passes.
 *
 * **The rule this script exists to honour: the emit conditions ARE the gate's
 * assertions.** Every check in `constants/puzzles/puzzles.test.ts` is applied
 * here as a condition of writing the line out at all. Nothing is emitted in the
 * hope that the gate will accept it, and the gate is never relaxed to admit
 * what was emitted. Under volume pressure that is the first thing that gets
 * quietly given up, so it is written down here and enforced in `verify`.
 *
 * **Deviation from the plan, deliberate.** The plan sampled checkers positions
 * directly — pieces scattered on dark squares, a random subset kinged. Both
 * games instead snapshot positions out of **played-out games**, which is what
 * the plan already specified for reversi. Random construction has to
 * re-implement every legality rule the engine already knows (no man on its
 * crowning row, no floating group, a reachable material balance) and gets a
 * board that could not occur in play even when it passes. Playing games out
 * gets reachability for free and reaches sparse endgames anyway, because that
 * is what the end of a game is. One code path now serves both games.
 *
 * Deterministic from `--seed`. Appends to `data/puzzles/<game>.jsonl` and never
 * rewrites an existing id.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

// `await import` rather than static `import`: shared's internal imports are
// extensionless, which every static loader tried rejects with a message that
// reads like a missing export and is really a resolution failure.
const { PUZZLE_RULES } = await import(SHARED + 'puzzles/rules.ts');
const { startPuzzle, applyPlayerMove, applyOpponentReply } = await import(
  SHARED + 'puzzles/runtime.ts'
);
const { CheckersEngine } = await import(SHARED + 'game-logic/checkers/engine.ts');
const { ReversiEngine } = await import(SHARED + 'game-logic/reversi/engine.ts');
const { analyzeCheckersPosition, getBestCheckersMove } = await import(
  SHARED + 'game-logic/checkers/weakEngine.ts'
);
const { analyzeReversiPosition, getBestReversiMove } = await import(
  SHARED + 'game-logic/reversi/weakEngine.ts'
);
const { CHECKERS_PUZZLES, REVERSI_PUZZLES } = await import(SHARED + 'constants/puzzles/index.ts');

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = join(ROOT, 'data', 'puzzles');

/**
 * The depth the CONTENT GATE searches at. Not a tuning knob: the gate asserts
 * the key move is this analyser's best move at exactly this depth, so mining
 * at any other depth would emit puzzles the build then rejects.
 */
const ANALYZER_DEPTH = 6;

/**
 * Longest line to script. Beyond this a puzzle stops being one.
 *
 * Was 12, and that was too many. A twelve-ply line is four to six moves the
 * player must find in a row, which is not a puzzle so much as a game with one
 * legal continuation — and it broke calibration outright: requiring every step
 * meant 106 of 300 checkers puzzles were never solved by ANY bot tier, so they
 * all pinned at the ladder's ceiling with no spread between them.
 */
const MAX_PLIES = 8;

/**
 * Longest line a `win-game` puzzle may claim.
 *
 * A win the player has to walk four moves to reach is still a win worth
 * showing. Past that the interest has moved from "find the shot" to "do not
 * blunder for a while", which the mode is not for.
 */
const MAX_WIN_STEPS = 4;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

// ---------------------------------------------------------------------------
// Seeded randomness — the engines take theirs from the global
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const realRandom = Math.random;
function withSeed(seed, fn) {
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}

// ---------------------------------------------------------------------------
// Per-game bindings
// ---------------------------------------------------------------------------

const GAMES = {
  checkers: {
    rules: PUZZLE_RULES.checkers,
    authored: CHECKERS_PUZZLES,
    initial: () => CheckersEngine.newGame(),
    legal: (s) => CheckersEngine.getAllLegalMoves(s),
    /** A move as the puzzle format writes it, chain spelled out when ambiguous. */
    encodeMove: (s, m) => {
      const twin = CheckersEngine.getAllLegalMoves(s).filter(
        (x) => x.from === m.from && x.to === m.to,
      );
      // The gate rejects a (from, to) that resolves to two chains, because
      // `validateMove` picks one with `.find()` and the player cannot say which.
      // The full path form the parser already accepts disambiguates it.
      return twin.length > 1 && m.path?.length > 1 ? [m.from, ...m.path].join('') : m.from + m.to;
    },
    apply: (s, m) => CheckersEngine.validateMove(s, m.from, m.to).resultingState,
    analyze: (s, d) => analyzeCheckersPosition(s, d),
    bestMoveKey: (m) => (m ? `${m.from}${m.to}` : null),
    moveKey: (m) => `${m.from}${m.to}`,
    bot: (s, elo) => {
      const m = getBestCheckersMove(s, elo);
      return { from: m.from, to: m.to };
    },
    /** Roughly a man. Below this the "best" move is a preference, not a point. */
    minMargin: 120,
    /** Pieces left, at which a position is an endgame worth posing. */
    interesting: (s) => {
      const pieces = s.board.flat().filter(Boolean).length;
      return pieces >= 4 && pieces <= 12 && !s.isGameOver;
    },
    themesFor: (facts) =>
      facts.maxCaptures >= 2 ? ['double-jump', 'shot'] : facts.captures > 0 ? ['shot'] : ['trapped-piece'],
  },

  reversi: {
    rules: PUZZLE_RULES.reversi,
    authored: REVERSI_PUZZLES,
    initial: () => ReversiEngine.newGame(),
    legal: (s) => ReversiEngine.getAllLegalMoves(s).map((p) => ({ from: p, to: p })),
    encodeMove: (_s, m) => m.to,
    apply: (s, m) => ReversiEngine.validateMove(s, m.to).resultingState,
    analyze: (s, d) => {
      const a = analyzeReversiPosition(s, d);
      return { score: a.score, bestMove: a.bestMove ? { from: a.bestMove.position, to: a.bestMove.position } : null };
    },
    bestMoveKey: (m) => (m ? m.to : null),
    moveKey: (m) => m.to,
    bot: (s, elo) => {
      const m = getBestReversiMove(s, elo);
      return { from: m.position, to: m.position };
    },
    /** A corner is worth about 40 on this scale, so 8 is a real edge. */
    minMargin: 8,
    /**
     * Few enough empties that the line can be played to the end of the game.
     *
     * The upper bound is tied to `MAX_PLIES`, not chosen for taste. A reversi
     * game ends when the board fills, so a position with N empties takes about
     * N plies to finish — and a line longer than `MAX_PLIES` can never be
     * emitted as a win, which means every ply of its expensive walk was thrown
     * away. Started at 14 and mining ran at roughly 26 seconds a puzzle against
     * under one for checkers; at 8 the walk finishes inside the budget and the
     * depth-6 searches it needs are a fraction of the size.
     */
    interesting: (s) => {
      const empties = 64 - s.board.flat().filter(Boolean).length;
      return empties >= 6 && empties <= 8 && !s.isGameOver;
    },
    themesFor: (facts) => (facts.corner ? ['corner'] : facts.parity ? ['parity'] : ['wedge']),
  },
};

// ---------------------------------------------------------------------------
// Position supply
// ---------------------------------------------------------------------------

/**
 * Every position a played-out game passes through.
 *
 * Both sides play at a random tier per game so the snapshots are not all from
 * one strength's idea of a game — a corpus mined entirely from 2000-rated play
 * has no beginner-band positions in it at all.
 */
function playGame(g, seed) {
  const rng = mulberry32(seed);
  const elos = [500, 800, 1100, 1400, 1700, 2000];
  const white = elos[Math.floor(rng() * elos.length)];
  const black = elos[Math.floor(rng() * elos.length)];

  let state = g.initial();
  const states = [];
  for (let ply = 0; ply < 200 && !state.isGameOver; ply++) {
    if (g.rules.mustPass?.(state)) {
      state = g.rules.executePass(state);
      continue;
    }
    const moves = g.legal(state);
    if (moves.length === 0) break;
    states.push(state);
    const elo = state.currentTurn === 'white' ? white : black;
    const move = withSeed(seed + ply, () => g.bot(state, elo));
    const next = g.apply(state, move);
    if (!next) break;
    state = next;
  }
  return states;
}

/**
 * Every legal move scored from the side to move's point of view, best first.
 *
 * The analysers return only the best move, so the margin — the whole basis for
 * "this position has a point" — has to be computed by iterating the root here.
 * Children are searched one ply shallower so the totals line up with the
 * root search the gate runs.
 */
function rootScan(g, state) {
  const forMover = (score) => (state.currentTurn === 'white' ? score : -score);
  return g
    .legal(state)
    .map((move) => {
      const child = g.apply(state, move);
      if (!child) return null;
      return { move, value: forMover(g.analyze(child, ANALYZER_DEPTH - 1).score) };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Line building
// ---------------------------------------------------------------------------

/**
 * Play the position out — the solver finding the best move, the opponent
 * answering with theirs — into the `{move, reply}` pairs the format wants.
 *
 * Passes are never scripted. The runtime settles them itself (`mustPass` +
 * `executePass`), and the gate rejects a pass appearing in the data, so a
 * position the opponent cannot answer simply hands the move back.
 */
function buildLine(g, start) {
  const playerColor = start.currentTurn;
  const steps = [];
  let state = start;

  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (state.isGameOver) break;
    if (g.rules.mustPass?.(state)) {
      state = g.rules.executePass(state);
      continue;
    }

    // The BEST MOVE only — one search, not one per legal move.
    //
    // `rootScan` exists to measure the margin at the opening position, and
    // that is the only place a margin is wanted. Calling it at every ply made
    // line building cost N searches a ply for a number nothing read, which was
    // most of the mining time.
    const analysed = g.analyze(state, ANALYZER_DEPTH).bestMove;
    if (!analysed) break;
    const best = g.legal(state).find((m) => g.moveKey(m) === g.moveKey(analysed));
    if (!best) break;
    const encoded = g.encodeMove(state, best);
    const next = g.apply(state, best);
    if (!next) break;

    if (state.currentTurn === playerColor) {
      steps.push({ move: encoded });
    } else {
      // An opponent move with no preceding player move cannot happen: the loop
      // always starts on the player's turn and `settle` keeps it alternating.
      if (steps.length === 0) break;
      steps[steps.length - 1].reply = encoded;
    }
    state = next;
  }

  // A trailing reply with no answer would leave the runtime mid-step.
  while (steps.length > 0 && steps[steps.length - 1].move === undefined) steps.pop();
  return { steps, final: state, playerColor };
}

// ---------------------------------------------------------------------------
// Verification — the gate's assertions, applied before emitting
// ---------------------------------------------------------------------------

function verify(g, puzzle) {
  const rules = g.rules;

  // Round-trips, starts on the player's turn, is not already over.
  const state = rules.decode(puzzle.position);
  if (rules.encode(state) !== puzzle.position) return 'position does not round-trip';
  if (rules.currentTurn(state) !== puzzle.playerColor) return 'wrong side to move';
  if (rules.isGameOver(state)) return 'position is already over';
  if (g.legal(state).length === 0) return 'no legal moves';
  if (rules.mustPass?.(state)) return 'opens on a forced pass';

  // No scripted pass, and no ambiguous chain.
  let walk = state;
  for (const step of puzzle.steps) {
    for (const raw of [step.move, step.reply].filter((m) => m !== undefined)) {
      if (/pass/i.test(raw)) return 'scripts a pass';
      const move = rules.parseMove(raw);
      const matching = g.legal(walk).filter((m) => m.from === move.from && m.to === move.to);
      if (matching.length !== 1) return `'${raw}' resolves to ${matching.length} chains`;
      const next = rules.validateMove(walk, move).resultingState;
      if (!next) return `'${raw}' is not legal`;
      walk = next;
    }
  }

  // The key move is the analyser's best move, at the gate's own depth.
  const best = g.analyze(state, ANALYZER_DEPTH).bestMove;
  if (g.bestMoveKey(best) !== g.bestMoveKey(rules.parseMove(puzzle.steps[0].move))) {
    return 'the key move is not the engine’s best move';
  }

  // The line runs through the real runtime and ends solved.
  let run = startPuzzle(puzzle, rules);
  for (const step of puzzle.steps) {
    const played = applyPlayerMove(run, rules, rules.parseMove(step.move));
    if (played.result !== 'correct' && played.result !== 'solved') {
      return `step came back '${played.result}'`;
    }
    run = played.run;
    if (step.reply !== undefined) run = applyOpponentReply(run, rules);
  }
  if (run.phase !== 'solved') return 'line does not end solved';

  // The goal is delivered.
  if (puzzle.goal === 'win-game') {
    if (!run.state.isGameOver) return 'claims win-game but the game is not over';
    if (run.state.winner !== puzzle.playerColor) return 'claims win-game but did not win';
  }
  if (puzzle.goal === 'best-move' && puzzle.game === 'reversi') {
    const played = rules.validateMove(state, rules.parseMove(puzzle.steps[0].move)).resultingState;
    const forPlayer = (s) => (puzzle.playerColor === 'white' ? s : -s);
    if (forPlayer(g.analyze(played, ANALYZER_DEPTH).score) <= 0) {
      return 'the best move does not leave the solver better';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

/**
 * Positions are de-duplicated by the position itself, not by a game index — the
 * same endgame is reached by many games, and a corpus that ships one shape
 * eight times looks larger than it is.
 */
function positionKey(position) {
  return createHash('sha256').update(position).digest('hex').slice(0, 16);
}

function describe(g, state, move, steps, goal) {
  const captures = g === GAMES.checkers ? countCaptures(state, move) : 0;
  const maxCaptures = captures;
  const corner = ['a1', 'a8', 'h1', 'h8'].includes(move.to);
  const themes = g.themesFor({ captures, maxCaptures, corner, parity: steps.length >= 3 });
  return { themes };
}

function countCaptures(state, move) {
  const m = CheckersEngine.getAllLegalMoves(state).find(
    (x) => x.from === move.from && x.to === move.to,
  );
  return m ? m.captures.length : 0;
}

const game = args.game;
if (!GAMES[game]) {
  console.error(`--game must be one of ${Object.keys(GAMES).join(', ')}`);
  process.exit(1);
}
const g = GAMES[game];
const target = Number(args.target ?? 300);
const baseSeed = Number(args.seed ?? 1);

mkdirSync(CORPUS_DIR, { recursive: true });

/**
 * One miner per game at a time, enforced with an exclusive lock file.
 *
 * Ids come from a counter seeded off the corpus's current maximum, and each
 * process keeps its own `seenPositions`. Two miners on the same game therefore
 * hand out the SAME ids to different puzzles and re-mine each other's
 * positions — which is not hypothetical: three concurrent runs produced 1,444
 * rows carrying 497 distinct ids and 836 distinct positions, and the coverage
 * gate caught it only at the very end. (They were concurrent by accident:
 * killing the shell that launched a miner does not kill the miner.)
 *
 * `wx` fails if the file exists, which is the whole mechanism.
 */
const lock = join(CORPUS_DIR, `.${game}.mining.lock`);
try {
  closeSync(openSync(lock, 'wx'));
} catch {
  console.error(
    `Another ${game} miner holds ${lock}.\n` +
      `If you are sure none is running, delete that file and try again.`,
  );
  process.exit(1);
}
const releaseLock = () => {
  try {
    rmSync(lock, { force: true });
  } catch {
    /* already gone */
  }
};
process.on('exit', releaseLock);
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    releaseLock();
    process.exit(1);
  });
}

const file = join(CORPUS_DIR, `${game}.jsonl`);
const existing = existsSync(file)
  ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

const seenPositions = new Set([
  ...existing.map((p) => positionKey(p.position)),
  ...g.authored.map((p) => positionKey(p.position)),
]);
let nextId = existing.reduce((n, p) => Math.max(n, Number(p.id.split('-')[1])), 999) + 1;

const rejected = {};
let emitted = 0;
let games = 0;

console.log(`Mining ${game}: target ${target}, seed ${baseSeed}…`);

for (let gameIndex = 0; emitted < target && gameIndex < 20_000; gameIndex++) {
  games++;
  const states = playGame(g, baseSeed * 100_003 + gameIndex);

  for (const state of states) {
    if (emitted >= target) break;
    if (!g.interesting(state)) continue;

    const position = g.rules.encode(state);
    const key = positionKey(position);
    if (seenPositions.has(key)) continue;

    const scan = rootScan(g, state);
    if (scan.length < 2) continue;
    const margin = scan[0].value - scan[1].value;
    if (margin < g.minMargin) {
      rejected['margin too small'] = (rejected['margin too small'] ?? 0) + 1;
      continue;
    }

    const { steps, final, playerColor } = buildLine(g, state);
    if (steps.length === 0) continue;

    // A line that does not finish the game is a ONE-MOVE puzzle.
    //
    // `best-move` asks "what is the best move here", and answering it should
    // take one move. Scripting six of them asked the player to walk a line
    // nobody claimed anything about — and made the puzzle unrateable, because a
    // bot has to get all six right to count as having solved it.
    const won =
      final.isGameOver && final.winner === playerColor && steps.length <= MAX_WIN_STEPS;
    const goal = won ? 'win-game' : 'best-move';
    const line = won ? steps : [{ move: steps[0].move }];
    const { themes } = describe(g, state, g.rules.parseMove(line[0].move), line, goal);

    const puzzle = {
      id: `${game}-${nextId}`,
      game,
      position,
      playerColor,
      goal,
      prompt:
        goal === 'win-game'
          ? `${playerColor === 'white' ? 'White' : 'Black'} to play and win.`
          : `${playerColor === 'white' ? 'White' : 'Black'} to play. Find the best move.`,
      // A placeholder rating. `calibrate.mjs` replaces it with a measured one
      // before publish; shipping this number would be inventing a difficulty.
      difficulty: 'medium',
      rating: 1100,
      themes,
      steps: line,
      explanation:
        goal === 'win-game'
          ? 'This line is forced, and it ends the game.'
          : 'Every other move gives the advantage back.',
      source: `Mined from self-play (seed ${baseSeed}), verified by the ${game} analyser at depth ${ANALYZER_DEPTH}.`,
    };

    const problem = verify(g, puzzle);
    if (problem) {
      rejected[problem] = (rejected[problem] ?? 0) + 1;
      continue;
    }

    appendFileSync(file, JSON.stringify(puzzle) + '\n', 'utf8');
    seenPositions.add(key);
    nextId++;
    emitted++;
    if (emitted % 25 === 0) console.log(`  ${emitted}/${target} (${games} games)`);
  }
}

console.log(`\n${game}: emitted ${emitted} from ${games} games → ${file}`);
if (Object.keys(rejected).length) {
  console.log('\nRejected:');
  for (const [why, n] of Object.entries(rejected).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${why}`);
  }
}
console.log('\nNext: calibrate to replace the placeholder ratings, then publish.');
