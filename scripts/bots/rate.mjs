/**
 * Rate a bot configuration on the human scale, using human-rated puzzles.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/bots/rate.mjs --tier=1500
 *   ./node_modules/.bin/tsx scripts/bots/rate.mjs --tier=1500 --uciElo=2300
 *   ./node_modules/.bin/tsx scripts/bots/rate.mjs --tier=1200 --engine=ts
 *   ./node_modules/.bin/tsx scripts/bots/rate.mjs --shipped --perBin=40
 *
 * **Why this instrument exists.** Every other way of rating a bot compares it
 * to another engine, which only ever yields a number on an engine scale — and
 * an engine scale is exactly what produced the bug this harness was built to
 * find. The chess puzzles in `data/puzzles/chess.jsonl` carry Lichess Glicko
 * ratings built from hundreds of thousands of *human* attempts. Measuring which
 * of those a bot can solve therefore places it against people, with no engine
 * standing in between.
 *
 * **The method.** Bin the corpus by its human rating, sample puzzles from each
 * bin, and play each one with the configuration under test. The bin where the
 * solve rate crosses one half is the bot's rating, by the same definition the
 * puzzle pipeline already uses: the difficulty at which the outcome is even.
 *
 * **Reusing `botRatingFromCurve` backwards.** That function expects a curve
 * that *rises* — stronger bot, higher solve rate — and smooths it with an
 * isotonic (non-decreasing) fit. Here the curve *falls*: harder puzzle, lower
 * solve rate. Passing `rate: 1 - solveRate` flips it into the shape the
 * function wants, and because `1 - r = 0.5` exactly when `r = 0.5`, the
 * crossing it finds is unchanged. The out-of-range flags come out meaning the
 * right thing too: a bot failing the easiest bin reports `belowFloor`, and one
 * solving the hardest reports `aboveCeiling`.
 *
 * **What this is and is not.** It measures tactical strength — the thing
 * puzzles test. It is not a playing rating: no opening, no endgame technique,
 * no clock. Pair it with `scripts/bots/match.mjs` (ordering) and
 * `scripts/bots/blunders.mjs` (error shape). A configuration has to satisfy all
 * three before its label is honest.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

// See the same note in scripts/puzzles/calibrate.mjs: a static import of these
// fails under every loader tried; `await import()` under tsx works.
const { PUZZLE_RULES } = await import(SHARED + 'puzzles/rules.ts');
const { startPuzzle, applyPlayerMove, applyOpponentReply } = await import(
  SHARED + 'puzzles/runtime.ts'
);
const { botRatingFromCurve } = await import(SHARED + 'puzzles/calibration.ts');
const { getBestMoveElo } = await import(SHARED + 'game-logic/chess/weakEngine.ts');
const { parseUciMoveString, engineMoveTimeMs } = await import(SHARED + 'game-logic/chess/uci.ts');
const { BOT_TIERS } = await import(SHARED + 'constants/botTiers.ts');

const { ArasanHost, arasanStrength } = await import('./lib/arasanHost.mjs');
const { seedOf, withSeed } = await import('./lib/rng.mjs');

const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? true];
    }),
);

/** Puzzles sampled per rating bin. */
const PER_BIN = Number(args.perBin ?? 30);
/** Attempts per puzzle. One is the honest default — see `trial` below. */
const TRIALS = Number(args.trials ?? 1);
const BIN_WIDTH = Number(args.binWidth ?? 200);
const BIN_LO = Number(args.binLo ?? 500);
const BIN_HI = Number(args.binHi ?? 2500);

// ---------------------------------------------------------------------------
// The corpus
// ---------------------------------------------------------------------------

const CORPUS = fileURLToPath(new URL('../../data/puzzles/chess.jsonl', import.meta.url));

/**
 * Puzzles grouped into rating bins, sampled deterministically.
 *
 * Sampling is seeded by bin so that two runs measure the same puzzles and their
 * ratings can be compared. Without that, a difference between two
 * configurations could just as easily be a difference between two samples.
 */
function loadBins() {
  const rows = readFileSync(CORPUS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((p) => typeof p.rating === 'number');

  const bins = new Map();
  for (const p of rows) {
    if (p.rating < BIN_LO || p.rating >= BIN_HI) continue;
    const key = BIN_LO + Math.floor((p.rating - BIN_LO) / BIN_WIDTH) * BIN_WIDTH;
    if (!bins.has(key)) bins.set(key, []);
    bins.get(key).push(p);
  }

  const sampled = [];
  for (const [lo, all] of [...bins.entries()].sort((a, b) => a[0] - b[0])) {
    const rand = withSeed(seedOf('bin', lo), () => {
      const out = [];
      for (let i = 0; i < all.length; i++) out.push(Math.random());
      return out;
    });
    const picked = all
      .map((p, i) => ({ p, r: rand[i] }))
      .sort((a, b) => a.r - b.r)
      .slice(0, PER_BIN)
      .map((x) => x.p);
    if (picked.length > 0) {
      sampled.push({ lo, mid: lo + BIN_WIDTH / 2, puzzles: picked });
    }
  }
  return sampled;
}

// ---------------------------------------------------------------------------
// The configuration under test
// ---------------------------------------------------------------------------

function shippedConfig(tierElo) {
  return {
    label: `tier ${tierElo} (shipped)`,
    tierElo,
    engine: 'arasan',
    limitStrength: true,
    uciElo: Math.max(1000, Math.min(3450, tierElo)),
    movetimeMs: Math.max(120, engineMoveTimeMs(tierElo)),
    depth: null,
  };
}

function configFromArgs() {
  const tierElo = Number(args.tier ?? 1500);
  if (args.engine === 'ts') {
    return { label: `tier ${tierElo} (TS weak engine)`, tierElo, engine: 'ts' };
  }
  if (args.uciElo == null && !args.noLimit && args.depth == null) return shippedConfig(tierElo);
  return {
    label: args.noLimit
      ? `tier ${tierElo} (full strength, depth ${args.depth})`
      : `tier ${tierElo} (UCI_Elo ${args.uciElo})`,
    tierElo,
    engine: 'arasan',
    limitStrength: !args.noLimit,
    uciElo: Number(args.uciElo ?? tierElo),
    movetimeMs:
      args.movetime != null ? Number(args.movetime) : Math.max(120, engineMoveTimeMs(tierElo)),
    depth: args.depth != null ? Number(args.depth) : null,
  };
}

// ---------------------------------------------------------------------------
// Playing one puzzle
// ---------------------------------------------------------------------------

async function botMove(config, state, seed, engine) {
  if (config.engine === 'ts') {
    return withSeed(seed, () => {
      const m = getBestMoveElo(state, config.tierElo);
      return { from: m.from, to: m.to, promotion: m.promotion };
    });
  }
  const fen = PUZZLE_RULES.chess.encode(state);
  const uci = await engine.bestMove(fen, {
    depth: config.depth ?? undefined,
    movetimeMs: config.movetimeMs ?? undefined,
  });
  if (!uci) return null;
  const parsed = parseUciMoveString(uci);
  return parsed && { from: parsed.from, to: parsed.to, promotion: parsed.promotion };
}

/**
 * Play one puzzle once. True only for a complete, first-try solve.
 *
 * One attempt, every step required — the same rule the puzzle pipeline uses,
 * and for the same reason: a bot that finds it on the third guess has not
 * solved it, and falling off at step three is a failure, because a three-move
 * combination genuinely is harder.
 *
 * An engine that throws counts as a failure rather than crashing the run. A
 * configuration that cannot cope with a position has not solved it, which is
 * the honest reading.
 */
async function trial(config, puzzle, trialIndex, engine) {
  const rules = PUZZLE_RULES[puzzle.game];
  const seed = seedOf(puzzle.id, config.label, trialIndex);
  if (engine) await engine.newGame();

  let run = startPuzzle(puzzle, rules);
  let guard = 0;

  while (run.phase === 'playing') {
    if (++guard > 32) return false; // a line this long is a bug, not a solve
    let move;
    try {
      move = await botMove(config, run.state, seed + guard, engine);
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

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function rate(config, bins) {
  let engine = null;
  if (config.engine === 'arasan') {
    engine = new ArasanHost();
    await engine.configure({
      limitStrength: config.limitStrength,
      uciElo: config.uciElo,
      multipv: 1,
    });
  }

  const curve = [];
  for (const bin of bins) {
    let solves = 0;
    let trials = 0;
    for (const puzzle of bin.puzzles) {
      for (let t = 0; t < TRIALS; t++) {
        if (await trial(config, puzzle, t, engine)) solves++;
        trials++;
      }
    }
    const rate = solves / trials;
    curve.push({ elo: bin.mid, rate, solves, trials });
    process.stderr.write(
      `  ${String(bin.lo).padStart(4)}-${bin.lo + BIN_WIDTH}: ` +
        `${String(solves).padStart(3)}/${String(trials).padEnd(3)} = ${(rate * 100).toFixed(0)}%\n`,
    );
  }

  if (engine) await engine.quit();

  // See the header: invert the rate so the isotonic fit sees a rising curve.
  const fitted = botRatingFromCurve(curve.map((p) => ({ elo: p.elo, rate: 1 - p.rate })));
  return { config, curve, fitted };
}

function report(r) {
  const { config, fitted } = r;
  console.log('');
  console.log(`=== ${config.label} ===`);
  if (config.engine === 'arasan' && config.limitStrength) {
    console.log(`  UCI_Elo ${config.uciElo} -> Arasan strength ${arasanStrength(config.uciElo)}`);
  }
  const flag = fitted.belowFloor
    ? ' (extrapolated below the sampled range)'
    : fitted.aboveCeiling
      ? ' (extrapolated above the sampled range)'
      : '';
  console.log(`  claimed rating      ${config.tierElo}`);
  console.log(`  measured rating     ${fitted.rating}${flag}`);
  console.log(`  error               ${fitted.rating - config.tierElo >= 0 ? '+' : ''}${fitted.rating - config.tierElo}`);
}

const bins = loadBins();
console.log(
  `Corpus: ${bins.length} bins of ${BIN_WIDTH} from ${BIN_LO} to ${BIN_HI}, ` +
    `up to ${PER_BIN} puzzles each, ${TRIALS} attempt(s) per puzzle.`,
);

const configs = args.shipped
  ? BOT_TIERS.chess.map((t) => shippedConfig(t.elo))
  : [configFromArgs()];

const results = [];
for (const config of configs) {
  process.stderr.write(`\n[${config.label}]\n`);
  results.push(await rate(config, bins));
}
for (const r of results) report(r);
