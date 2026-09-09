/**
 * Rate puzzles by asking the bot ladder to solve them.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/puzzles/calibrate.mjs --game=chess --sample=360
 *   ./node_modules/.bin/tsx scripts/puzzles/calibrate.mjs --game=checkers --all
 *   ./node_modules/.bin/tsx scripts/puzzles/calibrate.mjs --fit          # fit + emit only
 *   ./node_modules/.bin/tsx scripts/puzzles/calibrate.mjs --rate --game=go  # apply to a corpus
 *
 * **What it measures.** For each puzzle and each of the six bot tiers, play the
 * puzzle as a player would — one attempt, every step required — and record how
 * often that tier solves it. The ELO where the solve rate crosses one half is
 * the puzzle's bot rating. The maths lives in
 * `packages/shared/src/puzzles/calibration.ts` and is unit-tested; this script
 * is the disk, the engines and the parallelism.
 *
 * **One attempt per trial, every step required.** A bot that finds it on the
 * third guess has not solved it, and falling off at step 3 is a failure — a
 * three-move combination genuinely *is* harder, and that is the whole thing the
 * rating is supposed to capture.
 *
 * **Why chess is only sampled.** Lichess ratings come from hundreds of
 * thousands of human attempts and are strictly better evidence than a 32-trial
 * bot ladder. Bot-calibrating the whole imported corpus would spend hours to
 * produce a worse number than the one already in the file. The sample exists
 * for one job: fitting the bot→human anchor map, which is what lets a
 * self-mined checkers puzzle claim a rating that means the same thing.
 *
 * **Determinism, honestly.** The three in-house engines take their randomness
 * from `Math.random`, which is seeded here per (puzzle, tier, trial) — so those
 * tiers reproduce exactly. Stockfish does not: `UCI_LimitStrength` picks among
 * candidate moves at random and `go movetime` is wall-clock bound. That is not
 * a flaw to engineer away — it is the actual bot a player faces, and sampling
 * it is the point. Stockfish tiers therefore reproduce in aggregate, not
 * bit-exactly, and the cache stops that mattering in practice.
 *
 * GPL note: Stockfish runs as a separate process speaking UCI and is never
 * imported. See `lib/stockfish.mjs`.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

// Static `import` of these fails under every loader tried (.mjs/.mts, node and
// tsx) with "does not provide an export named …", which reads like a missing
// export and is really a resolution failure. `await import()` under tsx works.
const { PUZZLE_RULES } = await import(SHARED + 'puzzles/rules.ts');
const { startPuzzle, applyPlayerMove, applyOpponentReply } = await import(
  SHARED + 'puzzles/runtime.ts'
);
const {
  botRatingFromCurve,
  fitCalibration,
  humanRating,
  CALIBRATION_TIERS,
  TRIALS_PER_TIER,
  EARLY_STOP_TRIALS,
} = await import(SHARED + 'puzzles/calibration.ts');
const { fitLeastSquares, goDesignRow, goModelFrom, goStructuralRating } = await import(
  SHARED + 'puzzles/calibration.ts'
);
const { boardDesignRow, boardModelFrom, boardStructuralRating, fitQuantileMap } = await import(
  SHARED + 'puzzles/calibration.ts'
);
const { boardFeaturesFor } = await import(SHARED + 'puzzles/boardRating.ts');
const { solveTsumego } = await import(SHARED + 'game-logic/go/tsumego.ts');
const { GoEngine } = await import(SHARED + 'game-logic/go/engine.ts');
const { getBestMoveElo } = await import(SHARED + 'game-logic/chess/weakEngine.ts');
const { getBestCheckersMove } = await import(SHARED + 'game-logic/checkers/weakEngine.ts');
const { getBestReversiMove } = await import(SHARED + 'game-logic/reversi/weakEngine.ts');
const { ENGINE_MIN_ELO, clampStockfishElo, engineMoveTimeMs, parseUciMoveString } = await import(
  SHARED + 'game-logic/chess/uci.ts'
);
const { CHESS_PUZZLES, CHECKERS_PUZZLES, REVERSI_PUZZLES, GO_PUZZLES } = await import(
  SHARED + 'constants/puzzles/index.ts'
);
const { PUZZLE_BANDS } = await import(SHARED + 'puzzles/bands.ts');

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Stockfish } from './lib/stockfish.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = join(ROOT, 'data', 'puzzles');
const CACHE_FILE = join(CORPUS_DIR, 'calibration.json');
const ENGINE_PATH = join(ROOT, 'apps', 'web', 'public', 'stockfish', 'stockfish-18.0.8-lite-single.js');

/**
 * Bumped whenever the measurement changes meaning — a retuned engine, a
 * different trial count, a changed movetime formula. It is part of every cache
 * key, so a bump invalidates everything at once. That is correct and it should
 * be loud: old numbers and new ones must never sit in the same artifact.
 */
const ENGINE_IDENTITY = 'ts-weak@1 + stockfish-18.0.8-lite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

/**
 * Trials per tier for THIS run.
 *
 * Defaults to the documented 32. The anchor-fit run legitimately uses fewer:
 * its output is six bucket means over ~40 puzzles each, so per-puzzle noise
 * averages out, and Stockfish tiers are stochastic enough that they almost
 * never hit the unanimous early stop — which is where the machine time goes.
 * Recorded in the cache key, so a run at one trial count never mixes with
 * another.
 */
const MAX_TRIALS = Number(args.trials ?? TRIALS_PER_TIER);

const AUTHORED = {
  chess: CHESS_PUZZLES,
  checkers: CHECKERS_PUZZLES,
  reversi: REVERSI_PUZZLES,
  go: GO_PUZZLES,
};

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, and good enough to decorrelate trials. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(...parts) {
  return parseInt(createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8), 16);
}

const realRandom = Math.random;
/** Replace the global for the duration of one trial, then put it back. */
function withSeed(seed, fn) {
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = realRandom;
  }
}

// ---------------------------------------------------------------------------
// The bot façade
// ---------------------------------------------------------------------------

/**
 * One move from the tier's bot, in the same shape `PuzzleRules` speaks.
 *
 * Async only because chess above `ENGINE_MIN_ELO` is a child process; the
 * other three answer synchronously inside a seeded scope.
 */
async function botMove(game, state, elo, seed, engines) {
  if (game === 'chess') {
    if (elo >= ENGINE_MIN_ELO) {
      const engine = engines.get('chess');
      const fen = PUZZLE_RULES.chess.encode(state);
      const uci = await engine.bestMove(fen, engineMoveTimeMs(elo));
      if (!uci) return null;
      const parsed = parseUciMoveString(uci);
      return parsed && { from: parsed.from, to: parsed.to, promotion: parsed.promotion };
    }
    return withSeed(seed, () => {
      const m = getBestMoveElo(state, elo);
      return { from: m.from, to: m.to, promotion: m.promotion };
    });
  }
  if (game === 'checkers') {
    return withSeed(seed, () => {
      const m = getBestCheckersMove(state, elo);
      return { from: m.from, to: m.to };
    });
  }
  if (game === 'reversi') {
    return withSeed(seed, () => {
      const m = getBestReversiMove(state, elo);
      return { from: m.position, to: m.position };
    });
  }
  throw new Error(`No bot façade for ${game}`);
}

/**
 * Play one puzzle once. Returns true only for a complete, first-try solve.
 *
 * An engine that throws — no legal moves in a position it should not have
 * reached, a Stockfish timeout — counts as a failure rather than crashing the
 * run. A tier that cannot cope with a position has not solved it, which is the
 * honest reading, and 360 puzzles is too many to stop on one.
 */
async function trial(puzzle, rules, elo, trialIndex, engines) {
  const seed = seedOf(puzzle.id, elo, trialIndex);
  const engine = engines.get('chess');
  if (engine && puzzle.game === 'chess' && elo >= ENGINE_MIN_ELO) await engine.newGame();
  let run = startPuzzle(puzzle, rules);
  let guard = 0;

  while (run.phase === 'playing') {
    if (++guard > 32) return false; // a line this long is a bug, not a solve
    let move;
    try {
      move = await botMove(puzzle.game, run.state, elo, seed + guard, engines);
    } catch {
      return false;
    }
    if (!move) return false;

    const step = applyPlayerMove(run, rules, move);
    if (step.result === 'wrong' || step.result === 'ignored') return false;
    run = step.run;
    if (run.phase === 'replying') run = applyOpponentReply(run, rules);
  }

  return run.phase === 'solved';
}

/**
 * The solve rate at one tier, stopping early once the answer is not in doubt.
 *
 * Nearly all tiers come back unanimous — a bot either sees the tactic or it
 * does not — and the early stop is where almost all of the machine time is
 * saved. Only genuinely borderline tiers, which are the ones the crossing is
 * interpolated between, pay for the full 32.
 */
async function rateAtTier(puzzle, rules, elo, engines) {
  // ONE engine per worker, re-pinned per tier rather than one process per tier.
  // Tiers are measured sequentially, so three idle engines per worker bought
  // nothing and cost everything: sixteen workers meant forty-eight WASM
  // processes on twenty cores, and they starved each other during boot badly
  // enough to trip the driver's hang guard and fail the run.
  const engine = engines.get('chess');
  if (engine && elo >= ENGINE_MIN_ELO) await engine.setElo(clampStockfishElo(elo));

  let solves = 0;
  let trials = 0;
  while (trials < MAX_TRIALS) {
    if (await trial(puzzle, rules, elo, trials, engines)) solves++;
    trials++;
    if (trials >= EARLY_STOP_TRIALS && (solves === 0 || solves === trials)) break;
  }
  return { elo, rate: solves / trials, solves, trials };
}

/**
 * The cache key is the puzzle's CONTENT, not its id.
 *
 * Editing one puzzle then invalidates exactly that puzzle, and renaming one
 * invalidates nothing. Keyed on the id instead, an edited position would keep
 * serving the rating of the position it used to be — silently, and forever.
 */
function contentKey(puzzle) {
  return createHash('sha256')
    .update(
      [
        puzzle.position,
        puzzle.steps.map((s) => `${s.move}>${s.reply ?? ''}`).join(','),
        puzzle.goal,
        (puzzle.region ?? []).join(','),
        puzzle.target ?? '',
        ENGINE_IDENTITY,
        String(MAX_TRIALS),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/** Stratified by rating so the anchor fit has data at every knot. */
function stratifiedSample(puzzles, target, seed = 1) {
  const rng = mulberry32(seed);
  const buckets = new Map();
  for (const p of puzzles) {
    const b = Math.floor(p.rating / 200) * 200;
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(p);
  }
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  const per = Math.max(1, Math.ceil(target / keys.length));
  const out = [];
  for (const k of keys) {
    const list = buckets.get(k);
    // Fisher-Yates with the seeded generator, so the sample is reproducible.
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    out.push(...list.slice(0, per));
  }
  return out;
}

function loadCorpus(game) {
  const file = join(CORPUS_DIR, `${game}.jsonl`);
  const mined = existsSync(file)
    ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const seen = new Set(mined.map((p) => p.id));
  return [...(AUTHORED[game] ?? []).filter((p) => !seen.has(p.id)), ...mined];
}

function readCache() {
  if (!existsSync(CACHE_FILE)) return { engine: ENGINE_IDENTITY, entries: {} };
  const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  if (cache.engine !== ENGINE_IDENTITY) {
    console.warn(`! cache was built by "${cache.engine}"; discarding`);
    return { engine: ENGINE_IDENTITY, entries: {} };
  }
  return cache;
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

async function measure(game, puzzles, shard) {
  const rules = PUZZLE_RULES[game];
  const tiers = CALIBRATION_TIERS[game];
  const engines = new Map();

  if (game === 'chess' && tiers.some((e) => e >= ENGINE_MIN_ELO)) {
    engines.set('chess', new Stockfish(ENGINE_PATH));
  }

  const results = {};
  const started = Date.now();
  let done = 0;

  // Checkpoint after every puzzle. A full chess run is tens of minutes of
  // engine time across a dozen processes, and losing all of it to one Ctrl-C
  // is the difference between a job you can interrupt and one you cannot.
  const checkpoint = shard === undefined ? null : join(CORPUS_DIR, `calibration.shard-${shard.replace('/', '-')}.json`);
  if (checkpoint && existsSync(checkpoint)) Object.assign(results, JSON.parse(readFileSync(checkpoint, 'utf8')));

  for (const puzzle of puzzles) {
    const curve = [];
    for (const elo of tiers) curve.push(await rateAtTier(puzzle, rules, elo, engines));
    const rating = botRatingFromCurve(curve);
    results[contentKey(puzzle)] = {
      id: puzzle.id,
      game,
      bot: rating.rating,
      belowFloor: rating.belowFloor,
      aboveCeiling: rating.aboveCeiling,
      human: puzzle.rating,
      curve: curve.map((c) => ({ elo: c.elo, solves: c.solves, trials: c.trials })),
    };
    done++;
    if (checkpoint) writeFileSync(checkpoint, JSON.stringify(results), 'utf8');
    if (done % 5 === 0 || done === puzzles.length) {
      const rate = (Date.now() - started) / done / 1000;
      const left = ((puzzles.length - done) * rate) / 60;
      process.stderr.write(
        `[${shard ?? '0'}] ${done}/${puzzles.length}  ${rate.toFixed(1)}s/puzzle  ~${left.toFixed(0)}min left\n`,
      );
    }
  }

  for (const sf of engines.values()) await sf.quit();
  return results;
}

// ---------------------------------------------------------------------------
// Go - structural rating, because the ladder cannot rate it
// ---------------------------------------------------------------------------

/**
 * The three numbers a Go problem's difficulty is read from.
 *
 * All of them fall out of the exhaustive proof that already ran, so rating a Go
 * problem costs no search of its own - which is the compensation for not being
 * able to measure it the way the other three games are measured.
 */
function goFeatures(puzzle) {
  const state = PUZZLE_RULES.go.decode(puzzle.position);
  const solved = solveTsumego(state, {
    region: puzzle.region,
    target: puzzle.target,
    goal: puzzle.goal,
  });
  const choices = GoEngine.getAllLegalMoves(state).filter((m) => puzzle.region.includes(m)).length;
  return {
    regionSize: puzzle.region.length,
    logNodes: Math.log10(Math.max(1, solved.nodes)),
    losingMoves: Math.max(0, choices - solved.winningMoves.length),
  };
}

/**
 * Fit the structural model to the HAND-RATED Go problems.
 *
 * Fourteen points and five coefficients is not much, which is exactly why
 * `fitLeastSquares` carries a ridge. The error is printed rather than hidden: a
 * model this small should be read with its error bars in view, and if it stops
 * reproducing the author's own ratings that is the signal to stop trusting it.
 */
function fitGo() {
  const hand = GO_PUZZLES;
  const features = hand.map(goFeatures);
  const coef = fitLeastSquares(features.map(goDesignRow), hand.map((p) => p.rating));
  const model = goModelFrom(coef);
  const errs = features.map((f, i) => goStructuralRating(f, model) - hand[i].rating);
  return {
    model,
    n: hand.length,
    mae: Math.round(errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length),
    worst: Math.round(Math.max(...errs.map(Math.abs))),
  };
}

// ---------------------------------------------------------------------------
// Checkers and reversi - structural rating
// ---------------------------------------------------------------------------

/**
 * Fit the structural model for one board game against the bot ladder, using
 * ONLY the puzzles the ladder actually measured.
 *
 * Out-of-ladder readings are INCLUDED, after trying it both ways. They are
 * extrapolations rather than crossings, so the first attempt excluded them - but
 * a model fitted only to the middle can only predict the middle, and both ends
 * of the scale collapsed: checkers Master fell to 2 puzzles and every Beginner
 * band stayed empty. The extrapolated ratings are still ordered by a real
 * quantity (the solve rate at the end tier), and ordering is what a band uses.
 *
 * Reports its own quality rather than just returning coefficients: Spearman rho
 * against the bot ratings is the number that says whether the model learned
 * anything, and it is printed so a weak fit cannot ship unnoticed.
 */
function fitBoard(game, cache) {
  const corpus = loadCorpus(game);

  const rows = [];
  const targets = [];
  const featureList = [];
  // Indexed by CONTENT, never by id. The cache stores an id for readability but
  // it is not the key, and pairing on it is silently wrong the moment a corpus
  // is renumbered - which happened, and produced a fit between one puzzle's
  // features and another puzzle's rating.
  for (const puzzle of corpus) {
    const entry = cache.entries[contentKey(puzzle)];
    if (!entry || entry.game !== game) continue;
    const rating = botOf(entry);
    const f = boardFeaturesFor(puzzle);
    featureList.push(f);
    rows.push(boardDesignRow(f));
    // The target is the BOT rating, not the chess-anchored "human" one.
    //
    // The bands are defined from each game's own `BOT_TIERS` - Club in checkers
    // means the 1100 checkers bot - so the bot-ELO scale is the frame the bands
    // are already stated in, and rating against it directly is a measurement
    // rather than a transfer. Routing through the chess map instead added an
    // assumption AND compressed the bottom: its lowest output is ~790, so no
    // checkers puzzle could ever land in a band that ends at 650, however easy
    // it was. The cost is that a 1200 checkers rating is no longer claimed to be
    // "as hard as a 1200 chess puzzle" - which was always the weakest claim here
    // and is now simply not made.
    targets.push(rating.rating);
  }
  if (rows.length < 20) return { model: null, spread: [], n: rows.length, mae: 0, rho: 0 };

  const model = boardModelFrom(fitLeastSquares(rows, targets));
  // Restore the spread least squares shrank away, without moving any rank.
  const raw = featureList.map((f) => boardStructuralRating(game, f, model));
  const spread = fitQuantileMap(raw, targets);
  const predicted = featureList.map((f) => boardStructuralRating(game, f, model, spread));
  const errs = predicted.map((v, i) => v - targets[i]);
  const mae = Math.round(errs.reduce((a, e) => a + Math.abs(e), 0) / errs.length);

  // Spearman rho: does the model put them in the right ORDER? Absolute error
  // can look respectable while the ranking is noise, and a band only ever uses
  // the ordering.
  const rank = (values) => {
    const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = Array(values.length);
    idx.forEach(([, i], r) => (out[i] = r));
    return out;
  };
  const a = rank(targets);
  const b = rank(predicted);
  const n = a.length;
  const d2 = a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  return { model, spread, n, mae, rho };
}

/**
 * How well a fitted board model agrees with the HAND-RATED puzzles.
 *
 * Not a fit target and deliberately not a gate — the twelve checkers and ten
 * reversi hand ratings are one author's judgement on a narrow mid-range, while
 * the model is on the bot-ELO scale spanning the whole ladder. They measure
 * different things, so absolute error between them is not meaningful.
 *
 * It is emitted anyway because the disagreement is the honest weakness of this
 * whole approach: a bot-derived rating says how hard a position is *for an
 * engine*, and engine-easy is not human-easy. A depth-1 search sees a capture
 * instantly that a person has to spot. Anyone reading these coefficients should
 * see that number next to them.
 */
function anchorAgreement(game, model, spread) {
  const hand = AUTHORED[game] ?? [];
  if (hand.length < 3 || !model) return { n: hand.length, mae: 0, rho: 0, bias: 0 };
  const predicted = hand.map((p) => boardStructuralRating(game, boardFeaturesFor(p), model, spread));
  const actual = hand.map((p) => p.rating);
  const errs = predicted.map((v, i) => v - actual[i]);
  const rank = (values) => {
    const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = Array(values.length);
    idx.forEach(([, i], r) => (out[i] = r));
    return out;
  };
  const a = rank(actual);
  const b = rank(predicted);
  const n = a.length;
  const d2 = a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
  return {
    n,
    mae: Math.round(errs.reduce((s, e) => s + Math.abs(e), 0) / n),
    rho: Number((1 - (6 * d2) / (n * (n * n - 1))).toFixed(3)),
    bias: Math.round(errs.reduce((s, e) => s + e, 0) / n),
  };
}

// ---------------------------------------------------------------------------
// Fit and emit
// ---------------------------------------------------------------------------

/**
 * Re-derive a puzzle's bot rating from its stored solve curve.
 *
 * The cache holds the MEASUREMENT - solves and trials at each tier - and the
 * rating is computed from it on every read rather than trusted from the file.
 * That is what makes a change to the rating formula cost nothing: the
 * extrapolation past the ladder's ends was added after 967 puzzles had been
 * measured, and re-rating all of them took milliseconds instead of hours.
 */
function botOf(entry) {
  return botRatingFromCurve(entry.curve.map((c) => ({ elo: c.elo, rate: c.solves / c.trials })));
}

/**
 * Knot positions, one virtual tier past each end of the ladder.
 *
 * Puzzles outside the ladder are extrapolated to ratings outside it too, and
 * they need somewhere to bucket. Without these they fold into the end knots and
 * drag them toward ratings those tiers never measured.
 */
function knotPositions(game) {
  const tiers = CALIBRATION_TIERS[game];
  const n = tiers.length;
  return [tiers[0] - (tiers[1] - tiers[0]), ...tiers, tiers[n - 1] + (tiers[n - 1] - tiers[n - 2])];
}

function emit(cache) {
  const entries = Object.values(cache.entries);
  // Every chess sample, including the ones outside the ladder.
  //
  // They used to be excluded, on the reasoning that an extrapolated rating is
  // weaker evidence. But excluding them threw away the entire bottom of the
  // scale: the 48 below-floor puzzles have Lichess ratings with a median of 764
  // and a minimum of 517, and without them the fitted map's lowest output was
  // 966 - so no puzzle in any game could ever land in a Beginner band.
  const chess = entries.filter((e) => e.game === 'chess');

  // The anchor map is fitted on CHESS ONLY, because chess is the only game with
  // an independent human rating to fit against. The other three transfer it -
  // an assumption, stated as one, not a measurement.
  const knots = fitCalibration(
    knotPositions('chess'),
    chess.map((e) => ({ bot: botOf(e).rating, human: e.human })),
  );

  const residuals = chess.map((e) => humanRating('chess', botOf(e).rating, knots) - e.human);
  const mae = residuals.length
    ? residuals.reduce((a, r) => a + Math.abs(r), 0) / residuals.length
    : 0;

  const outDir = join(ROOT, 'packages', 'shared', 'src', 'constants', 'puzzles', 'generated');
  mkdirSync(outDir, { recursive: true });
  const go = fitGo();
  const board = {
    checkers: fitBoard('checkers', cache),
    reversi: fitBoard('reversi', cache),
  };
  const anchors = {
    checkers: anchorAgreement('checkers', board.checkers.model, board.checkers.spread),
    reversi: anchorAgreement('reversi', board.reversi.model, board.reversi.spread),
  };
  const payload = {
    fittedAt: new Date().toISOString().slice(0, 10),
    engine: ENGINE_IDENTITY,
    samples: chess.length,
    meanAbsoluteError: Math.round(mae),
    knots,
  };

  writeFileSync(
    join(outDir, 'calibration.ts'),
    [
      '// GENERATED by scripts/puzzles/calibrate.mjs — DO NOT EDIT.',
      '//',
      '// The bot→human rating map, fitted on a stratified sample of Lichess chess',
      '// puzzles where both numbers are known. Applying it to checkers, reversi and Go',
      '// is a MODELLING ASSUMPTION, not a measurement — see puzzles/calibration.ts.',
      '//',
      `// Fitted ${payload.fittedAt} on ${payload.samples} puzzles by ${payload.engine}.`,
      `// Mean absolute error against the Lichess ratings: ${payload.meanAbsoluteError}.`,
      "import type { BoardStructuralModel, CalibrationKnot, GoStructuralModel, QuantileKnot } from '../../../puzzles/calibration';",
      '',
      `export const CALIBRATION_FITTED_AT = ${JSON.stringify(payload.fittedAt)};`,
      `export const CALIBRATION_ENGINE = ${JSON.stringify(payload.engine)};`,
      `export const CALIBRATION_SAMPLES = ${payload.samples};`,
      `export const CALIBRATION_MAE = ${payload.meanAbsoluteError};`,
      '',
      'export const BOT_TO_HUMAN_KNOTS: readonly CalibrationKnot[] = ' +
        `${JSON.stringify(knots)};`,
      '',
      '// Go is rated STRUCTURALLY, not by the bot ladder. Its MCTS bot solved 1 of',
      '// 14 shipped tsumego at any tier and scored HIGHER at the weak tiers than the',
      '// strong ones, so there is no solve-rate crossing to interpolate. These four',
      '// coefficients are fitted by ridge least squares to the hand-rated problems.',
      `// Fitted to ${go.n} problems; mean absolute error ${go.mae}, worst ${go.worst}.`,
      `export const GO_STRUCTURAL_MAE = ${go.mae};`,
      'export const GO_STRUCTURAL_MODEL: GoStructuralModel = ' + `${JSON.stringify(go.model)};`,
      '',
      '// Checkers and reversi are rated structurally too, and for a related reason:',
      '// the weakest calibration tier is a depth-1 search with a ~50% blunder rate,',
      '// which is both a one-move-puzzle solver AND lucky when branching is small.',
      '// Fitted against the bot ladder over the range it genuinely measured.',
      `// checkers: n=${board.checkers.n}, MAE ${board.checkers.mae}, Spearman ${board.checkers.rho.toFixed(2)}`,
      `// reversi:  n=${board.reversi.n}, MAE ${board.reversi.mae}, Spearman ${board.reversi.rho.toFixed(2)}`,
      'export const BOARD_STRUCTURAL_MODELS: Record<string, BoardStructuralModel> = ' +
        `${JSON.stringify({ checkers: board.checkers.model, reversi: board.reversi.model })};`,
      '// The quantile map that restores the spread least squares shrinks away. It is',
      '// monotone, so it changes every rating and no ranking.',
      'export const BOARD_RATING_SPREAD: Record<string, QuantileKnot[]> = ' +
        `${JSON.stringify({ checkers: board.checkers.spread, reversi: board.reversi.spread })};`,
      '',
      '// Agreement with the HAND-RATED puzzles. Recorded, not gated: these are one',
      "// author's judgement over a narrow mid-range and the model is on the bot-ELO",
      '// scale, so they measure different things. It is here because it is the honest',
      '// weakness of a bot-derived rating - engine-easy is not human-easy.',
      `// checkers: n=${anchors.checkers.n} MAE ${anchors.checkers.mae} bias ${anchors.checkers.bias} Spearman ${anchors.checkers.rho}`,
      `// reversi:  n=${anchors.reversi.n} MAE ${anchors.reversi.mae} bias ${anchors.reversi.bias} Spearman ${anchors.reversi.rho}`,
      'export const BOARD_ANCHOR_AGREEMENT: Record<string, { n: number; mae: number; rho: number; bias: number }> = ' +
        `${JSON.stringify(anchors)};`,
      'export const BOARD_STRUCTURAL_FIT: Record<string, { n: number; mae: number; rho: number }> = ' +
        `${JSON.stringify({
          checkers: { n: board.checkers.n, mae: board.checkers.mae, rho: Number(board.checkers.rho.toFixed(3)) },
          reversi: { n: board.reversi.n, mae: board.reversi.mae, rho: Number(board.reversi.rho.toFixed(3)) },
        })};`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`\nFitted ${knots.length} knots on ${chess.length} chess samples (MAE ${Math.round(mae)}):`);
  for (const k of knots) console.log(`  bot ${String(k.bot).padStart(4)} → human ${String(k.human).padStart(4)}  (n=${k.samples})`);
  console.log(
    `\nGo structural model fitted to ${go.n} hand-rated problems: MAE ${go.mae}, worst ${go.worst}`,
  );
  for (const [g, fit] of Object.entries(board)) {
    console.log(
      `${g.padEnd(9)} structural fit: n=${fit.n}  MAE ${fit.mae}  Spearman ${fit.rho.toFixed(2)}` +
        (fit.rho < 0.5 ? '   <-- WEAK, do not trust this to rate' : ''),
    );
  }
  const flagged = entries.map(botOf).filter((r) => r.aboveCeiling || r.belowFloor);
  if (flagged.length) {
    console.log(
      `\n${flagged.length} of ${entries.length} puzzles fell outside the ladder ` +
        `(${flagged.filter((r) => r.aboveCeiling).length} above, ${flagged.filter((r) => r.belowFloor).length} below) ` +
        `and are rated by extrapolating one tier past its end.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Apply the fit back to a corpus
// ---------------------------------------------------------------------------

/**
 * Replace a mined corpus's placeholder ratings with calibrated ones.
 *
 * Kept separate from mining on purpose. A miner's job is to prove a position is
 * a puzzle; deciding how hard it is takes engines, time and a fitted model, and
 * folding the two together would mean re-mining every time the calibration
 * moved. It also keeps the honest thing possible: a freshly mined corpus says
 * `rating: 1100` for everything, which is visibly a placeholder rather than a
 * plausible-looking number nobody measured.
 *
 * Chess is refused outright. Its ratings are Lichess Glicko from hundreds of
 * thousands of human attempts, and overwriting them with a 16-trial bot ladder
 * would be replacing better evidence with worse.
 */
function rate(game, cache) {
  if (game === 'chess') {
    console.error('Refusing to re-rate chess: its Lichess ratings are better evidence.');
    process.exit(1);
  }
  const file = join(CORPUS_DIR, `${game}.jsonl`);
  if (!existsSync(file)) {
    console.error(`No corpus at ${file}. Mine one first.`);
    process.exit(1);
  }
  const puzzles = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

  const chess = Object.values(cache.entries).filter((e) => e.game === 'chess');
  const knots = fitCalibration(
    knotPositions('chess'),
    chess.map((e) => ({ bot: botOf(e).rating, human: e.human })),
  );
  const goModel = game === 'go' ? fitGo().model : null;
  const boardFit = game === 'go' ? null : fitBoard(game, cache);
  if (boardFit && !boardFit.model) {
    console.error(`Not enough measured ${game} puzzles to fit a structural model.`);
    process.exit(1);
  }
  if (boardFit) {
    console.log(
      `structural model: n=${boardFit.n}  MAE ${boardFit.mae}  Spearman ${boardFit.rho.toFixed(2)}`,
    );
  }

  const bands = PUZZLE_BANDS[game];
  let rated = 0;
  let unmeasured = 0;

  for (const p of puzzles) {
    // Structural for all three, and for the same reason each time: the bot
    // ladder is the instrument that CALIBRATED the model, not the thing that
    // rates a puzzle.
    //
    // Applied to every puzzle rather than only below the floor, so there is one
    // scale and no seam. A hybrid would hand two puzzles of the same true
    // difficulty ratings a band apart depending on which side of the ladder's
    // floor they happened to fall, which is worse than a model that is
    // uniformly approximate.
    //
    // Recomputed from the position rather than read off the row, so a
    // hand-edited corpus cannot move a rating.
    let rating;
    if (game === 'go') {
      rating = goStructuralRating(goFeatures(p), goModel);
    } else {
      rating = boardStructuralRating(game, boardFeaturesFor(p), boardFit.model, boardFit.spread);
    }
    p.rating = rating;
    // Three words cannot express six bands, so `difficulty` is kept as the
    // coarse label it always was and derived from the band rather than guessed.
    const index = bands.findIndex((b) => rating >= b.min && rating < b.max);
    p.difficulty = index <= 1 ? 'easy' : index <= 3 ? 'medium' : 'hard';
    delete p.features;
    rated++;
  }

  writeFileSync(file, puzzles.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');
  console.log(`${game}: rated ${rated} of ${puzzles.length}` + (unmeasured ? `, ${unmeasured} not yet measured` : ''));

  const counts = bands.map((b) => puzzles.filter((p) => p.rating >= b.min && p.rating < b.max).length);
  console.log(bands.map((b, i) => `  ${b.label.padEnd(13)} ${String(counts[i]).padStart(4)}`).join('\n'));
}

const cache = readCache();

if (args.rate) {
  rate(args.game ?? 'checkers', cache);
  process.exit(0);
}

if (args.fit) {
  emit(cache);
  process.exit(0);
}

if (args.shard !== undefined) {
  // A worker. Measure its slice and print it; the parent merges.
  const [i, n] = args.shard.split('/').map(Number);
  const game = args.game;
  const all = selectPuzzles(game);
  const mine = all.filter((_, idx) => idx % n === i);
  const checkpoint = join(CORPUS_DIR, `calibration.shard-${i}-${n}.json`);
  const already = existsSync(checkpoint) ? JSON.parse(readFileSync(checkpoint, 'utf8')) : {};
  const todo = mine.filter((p) => !(contentKey(p) in already));
  const results = { ...already, ...(await measure(game, todo, `${i}/${n}`)) };
  writeFileSync(checkpoint, JSON.stringify(results), 'utf8');
  process.stdout.write(JSON.stringify(results));
  process.exit(0);
}

function selectPuzzles(game) {
  const corpus = loadCorpus(game);
  const pool = args.all ? corpus : stratifiedSample(corpus, Number(args.sample ?? 360));
  return pool.filter((p) => !(contentKey(p) in cache.entries)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

const game = args.game ?? 'chess';
const todo = selectPuzzles(game);
if (todo.length === 0) {
  console.log(`${game}: nothing to measure — all ${args.all ? 'corpus' : 'sampled'} puzzles are cached.`);
  emit(cache);
  process.exit(0);
}

const jobs = Math.max(1, Math.min(Number(args.jobs ?? availableParallelism() - 2), todo.length));
console.log(`${game}: measuring ${todo.length} puzzles across ${jobs} workers…`);

if (jobs === 1) {
  Object.assign(cache.entries, await measure(game, todo, '0'));
} else {
  // Staggered, because every chess worker boots three WASM Stockfish processes
  // and a stampede of them starves each other at exactly the moment they are
  // least able to say so.
  const results = await Promise.all(
    Array.from({ length: jobs }, (_, i) =>
      new Promise((resolve) => setTimeout(resolve, i * 2000)).then(() =>
      new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
            fileURLToPath(import.meta.url),
            `--game=${game}`,
            `--shard=${i}/${jobs}`,
            ...(args.all ? ['--all'] : [`--sample=${args.sample ?? 360}`]),
          ],
          { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] },
        );
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        // A failed shard yields what it checkpointed rather than failing the
        // run. Losing fifteen workers' measurements because the sixteenth hit
        // a dead engine is not a trade worth making, and the missing puzzles
        // are simply picked up by the next invocation.
        child.on('exit', (code) => {
          if (code === 0) return resolve(JSON.parse(out));
          console.warn(`! shard ${i} exited ${code}; keeping its checkpoint`);
          const file = join(CORPUS_DIR, `calibration.shard-${i}-${jobs}.json`);
          resolve(existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
        });
      })),
    ),
  );
  for (const r of results) Object.assign(cache.entries, r);
}

mkdirSync(CORPUS_DIR, { recursive: true });
writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');

// The per-worker checkpoints have served their purpose the moment the merged
// cache is on disk. Leaving them behind is not merely untidy: a later run with a
// different worker count would ignore them while they sat there looking current.
for (const stale of readdirSync(CORPUS_DIR)) {
  if (stale.startsWith('calibration.shard-')) rmSync(join(CORPUS_DIR, stale), { force: true });
}
console.log(`\nCache → ${CACHE_FILE} (${Object.keys(cache.entries).length} puzzles)`);
emit(cache);
