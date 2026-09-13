/**
 * Measure how badly a bot configuration actually errs.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/bots/blunders.mjs --tier=1500 --games=10
 *   ./node_modules/.bin/tsx scripts/bots/blunders.mjs --shipped        # every tier, as configured today
 *   ./node_modules/.bin/tsx scripts/bots/blunders.mjs --uciElo=2300 --games=10
 *   ./node_modules/.bin/tsx scripts/bots/blunders.mjs --tier=1500 --noLimit --depth=6
 *
 * **What it measures, and why this one and not strength.** The complaint that
 * started this was not "the bot is weak" but "the bot makes mistakes a weaker
 * player would not make". Those are different claims and only the second one
 * explains why a rating label feels dishonest. So this grades the *shape* of
 * the errors: for every move the subject plays, how much did it throw away?
 *
 * **How a move is graded.** Scores are side-to-move relative, as UCI defines
 * them. If the reference engine says the best the mover can do in position P is
 * `best(P)`, and after the subject plays m the best the *opponent* can do is
 * `best(P+m)`, then m was worth `-best(P+m)` to the mover and it cost
 *
 *     loss = best(P) - (-best(P+m))
 *
 * Self-play means P+m is simply the next position, so one reference search per
 * ply covers both terms — the "after" search of one ply is the "before" search
 * of the next. Two engines run: a full-strength reference at a fixed depth, and
 * the subject at whatever configuration is being measured.
 *
 * **Both sides are the subject.** This is self-play at one setting, so every
 * ply is a graded sample. That doubles the data per game and keeps the position
 * distribution honest — a bot that only ever faced a strong opponent would be
 * measured in positions it would never reach on its own.
 *
 * Mate scores are clamped rather than converted to centipawns. A position that
 * is already lost cannot be "blundered" in a way this instrument should count,
 * and letting a mate score dominate the mean would hide the ordinary errors
 * that the whole question is about.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

// Static `import` of these fails under every loader tried — see the same note
// in scripts/puzzles/calibrate.mjs. `await import()` under tsx works.
const { ChessEngine } = await import(SHARED + 'game-logic/chess/engine.ts');
const { stateToFen } = await import(SHARED + 'game-logic/chess/fen.ts');
const { parseUciMoveString, engineMoveTimeMs } = await import(SHARED + 'game-logic/chess/uci.ts');
const { BOT_TIERS } = await import(SHARED + 'constants/botTiers.ts');
const { getBestMoveElo } = await import(SHARED + 'game-logic/chess/weakEngine.ts');
const { chessBotConfig } = await import(SHARED + 'game-logic/chess/strength.ts');

const { ArasanHost, arasanStrength } = await import('./lib/arasanHost.mjs');
const { seedOf, withSeed } = await import('./lib/rng.mjs');

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

const GAMES = Number(args.games ?? 6);
const MAX_PLIES = Number(args.maxPlies ?? 160);
/**
 * Reference depth, and the threads it gets.
 *
 * The reference — not the subject — is what makes a run slow: it searches every
 * ply of every game at full strength. Depth 10 already sees a hung piece
 * several moves out, which is the judgement this instrument actually needs, and
 * it is several times cheaper than 14. Extra threads make its search
 * nondeterministic in the small, which does not matter for "did that move throw
 * away a piece" and does matter for wall-clock time.
 */
const REF_DEPTH = Number(args.refDepth ?? 10);
const REF_THREADS = Number(args.refThreads ?? 2);
/** A piece, and a queen, in centipawns — the two thresholds a player notices. */
const PIECE_CP = 300;
const QUEEN_CP = 800;
/** Above this the position is already decided; grading it teaches nothing. */
const DECIDED_CP = 1500;

// ---------------------------------------------------------------------------
// One measured configuration
// ---------------------------------------------------------------------------

/**
 * The configuration the app ships today for a given tier: the user-facing Elo
 * handed straight to UCI_Elo, with UCI_LimitStrength on and the move time from
 * the shared formula. Reproduced here rather than imported because the point of
 * the run is to compare it against alternatives.
 */
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
  // The in-house engine is the candidate for the sub-1400 band, where web
  // already runs it and mobile does not. Grading it on the same axis as Arasan
  // is the whole point of offering it here.
  if (args.engine === 'ts') {
    return { label: `tier ${tierElo} (TS weak engine)`, tierElo, engine: 'ts' };
  }
  if (args.uciElo == null && !args.noLimit && args.depth == null) return shippedConfig(tierElo);
  return {
    engine: 'arasan',
    label: args.noLimit
      ? `tier ${tierElo} (full strength, depth ${args.depth ?? REF_DEPTH})`
      : `tier ${tierElo} (UCI_Elo ${args.uciElo})`,
    tierElo,
    limitStrength: !args.noLimit,
    uciElo: Number(args.uciElo ?? tierElo),
    movetimeMs: args.movetime != null ? Number(args.movetime) : Math.max(120, engineMoveTimeMs(tierElo)),
    depth: args.depth != null ? Number(args.depth) : null,
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/** Side-to-move-relative score in centipawns, mates clamped. */
function scoreOf(lines) {
  const top = lines[0];
  if (!top) return null;
  if (top.mate != null) return top.mate > 0 ? DECIDED_CP * 2 : -DECIDED_CP * 2;
  return top.cp;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** One move from the configuration under test, as a UCI string. */
async function subjectMove(config, state, fen, subject, seed) {
  if (config.engine === 'ts') {
    const m = withSeed(seed, () => getBestMoveElo(state, config.tierElo));
    const promo = m.promotion ? { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[m.promotion] : '';
    return `${m.from}${m.to}${promo ?? ''}`;
  }
  return subject.bestMove(fen, {
    depth: config.depth ?? undefined,
    movetimeMs: config.movetimeMs ?? undefined,
  });
}

async function measure(config) {
  const subject = config.engine === 'ts' ? null : new ArasanHost({ hashMb: 32 });
  const reference = new ArasanHost({ hashMb: 128, threads: REF_THREADS });

  if (subject) {
    await subject.configure({
      limitStrength: config.limitStrength,
      uciElo: config.uciElo,
      multipv: 1,
    });
  }
  await reference.configure({ limitStrength: false, multipv: 1 });

  const losses = [];
  let plies = 0;
  let skippedDecided = 0;

  for (let game = 0; game < GAMES; game++) {
    if (subject) await subject.newGame();
    await reference.newGame();

    let state = ChessEngine.newGame();
    let fen = stateToFen(state);
    // The "before" score for the first ply. Every later ply reuses the search
    // already done for the position it moved into.
    let before = scoreOf((await reference.search(fen, { depth: REF_DEPTH })).lines);

    for (let ply = 0; ply < MAX_PLIES; ply++) {
      if (state.isCheckmate || state.isStalemate || state.isDraw) break;

      const uci = await subjectMove(config, state, fen, subject, seedOf(config.label, game, ply));
      if (!uci) break;
      const parsed = parseUciMoveString(uci);
      if (!parsed) throw new Error(`unparseable move from engine: ${uci}`);

      const check = ChessEngine.validateMove(state, parsed.from, parsed.to, false, parsed.promotion);
      if (!check.valid) throw new Error(`engine played an illegal move ${uci} in ${fen}`);
      state = ChessEngine.executeMove(state, parsed.from, parsed.to, false, parsed.promotion);
      fen = stateToFen(state);
      plies++;

      const after = state.isCheckmate
        ? -DECIDED_CP * 2
        : state.isStalemate || state.isDraw
          ? 0
          : scoreOf((await reference.search(fen, { depth: REF_DEPTH })).lines);

      // Only grade moves made in a position that was still a contest.
      if (before != null && after != null && Math.abs(before) < DECIDED_CP) {
        losses.push(Math.max(0, before - -after));
      } else {
        skippedDecided++;
      }
      before = after;
    }
    process.stderr.write(`  game ${game + 1}/${GAMES} done (${losses.length} graded moves)\n`);
  }

  if (subject) await subject.quit();
  await reference.quit();

  const sorted = [...losses].sort((a, b) => a - b);
  const mean = losses.reduce((a, b) => a + b, 0) / (losses.length || 1);
  return {
    config,
    plies,
    graded: losses.length,
    skippedDecided,
    meanCpLoss: Math.round(mean),
    medianCpLoss: Math.round(percentile(sorted, 50)),
    p95CpLoss: Math.round(percentile(sorted, 95)),
    overPieceRate: losses.filter((l) => l >= PIECE_CP).length / (losses.length || 1),
    overQueenRate: losses.filter((l) => l >= QUEEN_CP).length / (losses.length || 1),
  };
}

function report(r) {
  console.log('');
  console.log(`=== ${r.config.label} ===`);
  if (r.config.engine === 'ts') {
    console.log('  in-house minimax (packages/shared weakEngine), ELO_BANDS config');
  } else {
    const s = arasanStrength(r.config.uciElo);
    console.log(
      `  UCI_LimitStrength ${r.config.limitStrength}` +
        (r.config.limitStrength ? `, UCI_Elo ${r.config.uciElo} -> Arasan strength ${s}` : '') +
        `, ${r.config.depth ? `go depth ${r.config.depth}` : `go movetime ${r.config.movetimeMs}`}`,
    );
  }
  console.log(`  graded moves        ${r.graded} (of ${r.plies} plies; ${r.skippedDecided} already decided)`);
  console.log(`  mean cp loss        ${r.meanCpLoss}`);
  console.log(`  median cp loss      ${r.medianCpLoss}`);
  console.log(`  95th pct cp loss    ${r.p95CpLoss}`);
  console.log(`  lost >= a piece     ${(r.overPieceRate * 100).toFixed(1)}%`);
  console.log(`  lost >= a queen     ${(r.overQueenRate * 100).toFixed(1)}%`);
}

/**
 * What the app ACTUALLY plays today, read from the shipped ladder rather than
 * reproduced here. `--shipped` reproduces the old identity mapping instead, so
 * the two can be compared side by side.
 */
function ladderConfig(tierElo) {
  const c = chessBotConfig(tierElo);
  if (c.engine === 'ts') {
    return { label: `tier ${tierElo} (ladder: TS engine)`, tierElo, engine: 'ts' };
  }
  return {
    label: `tier ${tierElo} (ladder: Arasan d${c.depth})`,
    tierElo,
    engine: 'arasan',
    limitStrength: true,
    uciElo: c.arasanUciElo,
    depth: c.depth,
    // The ceiling is deliberately NOT applied here. It is a slow-device safety
    // net, and letting it bite would measure the guard rather than the ladder.
    movetimeMs: null,
  };
}

// A calibration run that dies must say so. Without this an engine crash exits
// the process with an unsettled top-level await and no diagnosis at all.
for (const signal of ['unhandledRejection', 'uncaughtException']) {
  process.on(signal, (err) => {
    console.log(`
RUN FAILED (${signal}): ${err?.stack ?? err}`);
    process.exit(1);
  });
}

const configs = args.shipped
  ? BOT_TIERS.chess.map((t) => shippedConfig(t.elo))
  : args.ladder
    ? BOT_TIERS.chess.map((t) => ladderConfig(t.elo))
    : [configFromArgs()];

console.log(
  `Grading ${configs.length} configuration(s): ${GAMES} self-play games each, ` +
    `reference depth ${REF_DEPTH}.`,
);

const results = [];
for (const config of configs) {
  process.stderr.write(`\n[${config.label}]\n`);
  results.push(await measure(config));
}
for (const r of results) report(r);
