/**
 * Play two bot configurations against each other and report the Elo gap.
 *
 * Usage:
 *   # order two Arasan settings against each other
 *   ./node_modules/.bin/tsx scripts/bots/match.mjs --a=uci:2000 --b=uci:2300 --games=40
 *   # anchor a setting against the Stockfish ladder (see the licence note below)
 *   ./node_modules/.bin/tsx scripts/bots/match.mjs --a=uci:2300 --b=sf:1500 --games=60
 *   # the in-house engine against Stockfish held to a fixed rating
 *   ./node_modules/.bin/tsx scripts/bots/match.mjs --a=ts:1200 --b=sf:1200 --games=60
 *
 * Configuration syntax: `uci:<n>` Arasan with UCI_LimitStrength at that UCI_Elo,
 * `depth:<n>` Arasan at full strength capped to that depth, `ts:<n>` the
 * in-house TypeScript engine at that target Elo, `sf:<n>` Stockfish with
 * UCI_LimitStrength at that UCI_Elo.
 *
 * **Why a Stockfish opponent is the anchor and not a rival.** Every other
 * instrument here answers a relative question. This one comes closest to an
 * absolute answer, because Stockfish's `UCI_Elo` is a fixed, published scale.
 * It is an engine scale, though: its authors fit it to games against another
 * engine, on CCRL's blitz list of engine-versus-engine ratings. So "draws level
 * with Stockfish at UCI_Elo 1500" means about 1500 on that list, which is not the
 * same thing as a person rated 1500. Nothing else available offers a fixed scale.
 *
 * **Licence hygiene — read before changing how Stockfish is invoked.**
 * Stockfish.js is GPL-3.0 and `apps/web/public/stockfish/README.md` is explicit
 * that it is aggregated with, not linked into, the MIT application. It is
 * spawned here as its own process speaking UCI over stdin/stdout, exactly as
 * `scripts/puzzles/lib/stockfish.mjs` already does, and the only thing crossing
 * the boundary is a number. It is never imported, never bundled, and never goes
 * near `apps/mobile` — that is the whole reason the app ships Arasan. Do not
 * "simplify" this into a require().
 *
 * **Openings.** Both engines would otherwise replay one game N times. Each pair
 * of games starts from the same short randomly-played opening, once with A as
 * White and once with B, so colour and opening are controlled and only the
 * configurations differ.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;

// See the same note in scripts/puzzles/calibrate.mjs: static imports fail under
// every loader tried; `await import()` under tsx works.
const { ChessEngine } = await import(SHARED + 'game-logic/chess/engine.ts');
const { stateToFen } = await import(SHARED + 'game-logic/chess/fen.ts');
const { parseUciMoveString, engineMoveTimeMs, clampStockfishElo } = await import(
  SHARED + 'game-logic/chess/uci.ts'
);
const { getBestMoveElo, getBestMoveWithProfile } = await import(
  SHARED + 'game-logic/chess/weakEngine.ts'
);

const { ArasanHost } = await import('./lib/arasanHost.mjs');
const { Stockfish } = await import('../puzzles/lib/stockfish.mjs');
const { seedOf, withSeed } = await import('./lib/rng.mjs');

const { fileURLToPath } = await import('node:url');

const SF_PATH = fileURLToPath(
  new URL('../../apps/web/public/stockfish/stockfish-18.0.8-lite-single.js', import.meta.url),
);

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

const GAMES = Number(args.games ?? 40);
const MAX_PLIES = Number(args.maxPlies ?? 200);
const OPENING_PLIES = Number(args.openingPlies ?? 4);
/** Resign threshold: a side this far behind by the adjudicator has lost. */
const ADJUDICATE_CP = Number(args.adjudicateCp ?? 900);
/** Consecutive plies past the threshold before the game is called. */
const ADJUDICATE_PLIES = 6;
/** Wall-clock ceiling on one adjudicator search, enforced by sending `stop`. */
const ADJUDICATE_CEILING_MS = Number(args.adjudicateCeilingMs ?? 1500);

function parseSpec(spec, fallbackElo) {
  const [kind, n] = String(spec).split(':');
  // `uci:<elo>@<depth>` is the shape the fixed ladder uses: strength pinned
  // above Arasan's blunder gate, with depth as the actual strength dial. See
  // packages/shared/src/game-logic/chess/strength.ts for why.
  const [eloPart, depthPart] = String(n ?? fallbackElo).split('@');
  const elo = Number(eloPart);
  const depth = depthPart != null ? Number(depthPart) : null;
  switch (kind) {
    case 'uci':
      return {
        kind,
        elo,
        depth,
        label: `Arasan UCI_Elo ${elo}${depth ? ` @ depth ${depth}` : ''}`,
      };
    case 'depth':
      return { kind, elo, label: `Arasan full strength, depth ${elo}` };
    case 'ts':
      return { kind, elo, label: `TS weak engine @ ${elo}` };
    case 'tsprofile': {
      // `tsprofile:<depth>/<blunderChance>/<evalNoise>` — run the in-house engine
      // on an explicit error profile rather than one its rating bands produce.
      // The bands were never measured, so fitting the weakest tiles means trying
      // profiles they cannot currently express.
      const [depth, blunderChance, evalNoise] = String(n).split('/').map(Number);
      return {
        kind,
        elo: 0,
        profile: { depth, blunderChance, evalNoise },
        label: `TS profile d${depth} blunder ${blunderChance} noise ${evalNoise}`,
      };
    }
    case 'sfskill':
      // Uncalibrated handicap, but it reaches below Stockfish's UCI_Elo floor of
      // 1320 — the only Stockfish opponent available for the weakest tiles.
      return { kind, elo, label: `Stockfish Skill Level ${elo}` };
    case 'sf': {
      // Stockfish clamps UCI_Elo into [1320, 3190] internally, so asking for
      // 1200 silently gets you 1320. Resolve it here or every rating this
      // script implies from a low setting is off by the difference.
      const effective = clampStockfishElo(elo);
      return {
        kind,
        elo: effective,
        requestedElo: elo,
        label:
          effective === elo
            ? `Stockfish UCI_Elo ${effective}`
            : `Stockfish UCI_Elo ${effective} (asked ${elo}, clamped to its floor)`,
      };
    }
    default:
      throw new Error(
        `unknown engine spec "${spec}" (want uci:/depth:/ts:/tsprofile:/sf:/sfskill:)`,
      );
  }
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

async function makePlayer(spec, movetimeMs) {
  if (spec.kind === 'ts' || spec.kind === 'tsprofile') {
    return {
      spec,
      async newGame() {},
      async move(state, _fen, seed) {
        const m = withSeed(seed, () =>
          spec.profile
            ? getBestMoveWithProfile(state, spec.profile)
            : getBestMoveElo(state, spec.elo),
        );
        const promo = m.promotion
          ? { queen: 'q', rook: 'r', bishop: 'b', knight: 'n' }[m.promotion]
          : '';
        return `${m.from}${m.to}${promo ?? ''}`;
      },
      async quit() {},
    };
  }
  if (spec.kind === 'sf' || spec.kind === 'sfskill') {
    const sf = new Stockfish(SF_PATH);
    if (spec.kind === 'sfskill') await sf.setSkill(spec.elo);
    else await sf.setElo(spec.elo);
    return {
      spec,
      newGame: () => sf.newGame(),
      move: (_state, fen) => sf.bestMove(fen, movetimeMs),
      quit: () => sf.quit(),
    };
  }
  const engine = new ArasanHost({ hashMb: 32 });
  await engine.configure(
    spec.kind === 'uci'
      ? { limitStrength: true, uciElo: spec.elo, multipv: 1 }
      : { limitStrength: false, multipv: 1 },
  );
  return {
    spec,
    newGame: () => engine.newGame(),
    move: (_state, fen) =>
      engine.bestMove(
        fen,
        spec.kind === 'depth'
          ? { depth: spec.elo }
          : spec.depth != null
            ? { depth: spec.depth, movetimeMs }
            : { movetimeMs },
      ),
    quit: () => engine.quit(),
  };
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

/**
 * A short random opening, replayed identically for both games of a pair.
 *
 * Uniformly random legal moves rather than a book: no book ships with the app,
 * and the aim here is only to stop N games being one game repeated.
 */
function openingMoves(seed) {
  let state = ChessEngine.newGame();
  const moves = [];
  withSeed(seed, () => {
    for (let i = 0; i < OPENING_PLIES; i++) {
      const legal = ChessEngine.getAllLegalMoves(state);
      if (legal.length === 0) return;
      const m = legal[Math.floor(Math.random() * legal.length)];
      moves.push(m);
      state = ChessEngine.executeMove(state, m.from, m.to, false, 'queen');
    }
  });
  return moves;
}

/** 1 for a White win, 0 for Black, 0.5 for a draw. */
async function playGame(white, black, opening, adjudicator, gameSeed) {
  await white.newGame();
  await black.newGame();
  if (adjudicator) await adjudicator.newGame();

  let state = ChessEngine.newGame();
  for (const m of opening) state = ChessEngine.executeMove(state, m.from, m.to, false, 'queen');

  let losingStreak = 0;
  let streakSide = null;

  for (let ply = 0; ply < MAX_PLIES; ply++) {
    if (state.isCheckmate) return state.currentTurn === 'white' ? 0 : 1;
    if (state.isStalemate || state.isDraw) return 0.5;

    const mover = state.currentTurn === 'white' ? white : black;
    const fen = stateToFen(state);
    let uci;
    try {
      uci = await mover.move(state, fen, gameSeed + ply);
    } catch {
      // An engine that fails to answer forfeits. Silently scoring it a draw
      // would hide a broken configuration inside a plausible-looking result.
      return state.currentTurn === 'white' ? 0 : 1;
    }
    if (!uci) return state.currentTurn === 'white' ? 0 : 1;
    const parsed = parseUciMoveString(uci);
    if (!parsed) return state.currentTurn === 'white' ? 0 : 1;
    const check = ChessEngine.validateMove(state, parsed.from, parsed.to, false, parsed.promotion);
    if (!check.valid) return state.currentTurn === 'white' ? 0 : 1;
    state = ChessEngine.executeMove(state, parsed.from, parsed.to, false, parsed.promotion);

    // Adjudicate hopeless positions rather than playing them out. Weak bots
    // shuffle for fifty moves in a lost endgame, which costs most of the run's
    // machine time and changes no result.
    //
    // A failure here is NOT a forfeit — the adjudicator is not a player. Let it
    // propagate: a run that cannot judge positions is producing meaningless
    // numbers and should stop saying anything. (An earlier version swallowed it
    // and two whole matches exited silently with no result at all.)
    if (adjudicator && ply % 2 === 1) {
      const nextFen = stateToFen(state);
      if (state.isCheckmate || state.isStalemate || state.isDraw) continue;
      // A ceiling, not a budget. Without it a depth-10 search under process
      // contention starved for the driver's full 300s guard and killed the run.
      const { lines } = await adjudicator.search(nextFen, {
        depth: 10,
        movetimeMs: ADJUDICATE_CEILING_MS,
      });
      const top = lines[0];
      if (!top) continue;
      const cp = top.mate != null ? (top.mate > 0 ? 10000 : -10000) : top.cp;
      const losing = cp < -ADJUDICATE_CP ? state.currentTurn : cp > ADJUDICATE_CP ? (state.currentTurn === 'white' ? 'black' : 'white') : null;
      if (losing && losing === streakSide) {
        if (++losingStreak >= ADJUDICATE_PLIES) return losing === 'white' ? 0 : 1;
      } else {
        streakSide = losing;
        losingStreak = losing ? 1 : 0;
      }
    }
  }
  return 0.5;
}

// ---------------------------------------------------------------------------
// The match
// ---------------------------------------------------------------------------

const specA = parseSpec(args.a ?? 'uci:1500');
const specB = parseSpec(args.b ?? 'sf:1500');
const MOVETIME = Number(args.movetime ?? engineMoveTimeMs(1500));

// Both hooks, not just the rejection one: the driver's timeout fires from a
// timer callback, which surfaces as an uncaught exception and otherwise leaves
// the run with an empty stdout file and no clue why.
for (const signal of ['unhandledRejection', 'uncaughtException']) {
  process.on(signal, (err) => {
    console.log(`
MATCH FAILED (${signal}): ${err?.stack ?? err}`);
    process.exit(1);
  });
}

const a = await makePlayer(specA, MOVETIME);
const b = await makePlayer(specB, MOVETIME);
const adjudicator = args.noAdjudicate ? null : new ArasanHost({ hashMb: 64 });
if (adjudicator) await adjudicator.configure({ limitStrength: false, multipv: 1 });

console.log(`A: ${specA.label}`);
console.log(`B: ${specB.label}`);
console.log(`${GAMES} games, ${MOVETIME}ms per move, ${OPENING_PLIES} random opening plies.\n`);

let scoreA = 0;
let wins = 0;
let draws = 0;
let losses = 0;

for (let pair = 0; pair < Math.ceil(GAMES / 2); pair++) {
  const opening = openingMoves(seedOf('opening', pair));
  for (const aIsWhite of [true, false]) {
    const seed = seedOf('game', pair, aIsWhite);
    const result = await playGame(
      aIsWhite ? a : b,
      aIsWhite ? b : a,
      opening,
      adjudicator,
      seed,
    );
    const forA = aIsWhite ? result : 1 - result;
    scoreA += forA;
    if (forA === 1) wins++;
    else if (forA === 0.5) draws++;
    else losses++;
    process.stderr.write(
      `  pair ${pair + 1} ${aIsWhite ? 'A=W' : 'A=B'} -> ${forA}  (running ${wins}W ${draws}D ${losses}L)\n`,
    );
  }
}

await a.quit();
await b.quit();
if (adjudicator) await adjudicator.quit();

const n = wins + draws + losses;
const p = scoreA / n;
// Standard Elo inversion. A clean sweep has no finite Elo difference, so the
// score is nudged inside the open interval rather than reporting Infinity.
const pc = Math.min(1 - 0.5 / n, Math.max(0.5 / n, p));
const elo = -400 * Math.log10(1 / pc - 1);
// Standard error of a mean of {0, 0.5, 1} outcomes, pushed through the same
// curve to give a usable band rather than a false point estimate.
const se = Math.sqrt((p * (1 - p)) / n) || 0.5 / n;
const hi = Math.min(1 - 0.5 / n, p + 1.96 * se);
const lo = Math.max(0.5 / n, p - 1.96 * se);

console.log('');
console.log(`A scored ${scoreA}/${n} (${wins}W ${draws}D ${losses}L) = ${(p * 100).toFixed(1)}%`);
console.log(`Elo(A) - Elo(B) = ${elo >= 0 ? '+' : ''}${elo.toFixed(0)}`);
console.log(
  `  95% band ${(-400 * Math.log10(1 / lo - 1)).toFixed(0)} .. ${(-400 * Math.log10(1 / hi - 1)).toFixed(0)}`,
);
if (specB.kind === 'sf') {
  console.log(`  implied rating for A on Stockfish's engine scale: ~${Math.round(specB.elo + elo)}`);
}
