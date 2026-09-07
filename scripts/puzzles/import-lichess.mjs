/**
 * Import the Lichess open puzzle database into `data/puzzles/chess.jsonl`.
 *
 * Usage — note `tsx`, not bare `node`:
 *
 *   ./node_modules/.bin/tsx scripts/puzzles/import-lichess.mjs \
 *     --csv=<path to lichess_db_puzzle.csv> [--target=2000] [--seed=1]
 *
 * `scripts/render-sfx.mjs` runs under plain `node` because the module it
 * imports is a leaf. This one reaches the chess engine, and `packages/shared`
 * imports its own modules without file extensions, which Node's ESM resolver
 * rejects. `tsx` resolves them.
 *
 * ── Provenance ──────────────────────────────────────────────────────────────
 * The database is published by Lichess under the CC0 1.0 public domain
 * dedication: attribution is a courtesy, not a requirement, and we pay it
 * anyway on every imported puzzle (`source`) and at `/licenses`.
 *
 * The **raw CSV must never enter the repo** — download it to a scratch
 * directory and point `--csv` at it. `data/puzzles/*.csv` is gitignored as a
 * second line of defence. What is committed is the derived JSONL, plus
 * `data/puzzles/LICENSE-lichess.md` naming the dump, its SHA-256 and the date,
 * because a CC0 claim you cannot date is a CC0 claim you cannot defend.
 *
 * ── What this script proves before it emits anything ─────────────────────────
 * The shipped content gate is not relaxed to fit imported data. Instead the
 * emit conditions here are the gate's assertions, applied up front:
 *
 *   - the position round-trips through `stateToFen(fenToState(x))`
 *   - the side to move is the solver
 *   - every scripted move is legal, replayed through the real engine
 *   - a `mate` claim delivers mate on the final move
 *   - a one-step mate has EXACTLY ONE mating move (the gate demands uniqueness,
 *     and plenty of Lichess `mateIn1` rows have two)
 *   - a longer mate has NO mate in one (or it is mislabelled)
 *
 * Rows failing any of these are dropped with a counted reason, not repaired.
 */

import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dynamic imports, deliberately — a static `import` of these fails under both
// loaders with "does not provide an export named …", which reads like a missing
// export and is really a resolution problem: `packages/shared` imports its own
// modules without file extensions, and Node's ESM loader claims the specifier
// before tsx can transform it. `await import()` under tsx resolves the chain.
const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;
const { ChessEngine } = await import(SHARED + 'game-logic/chess/engine.ts');
const { fenToState, stateToFen } = await import(SHARED + 'game-logic/chess/fen.ts');
const { parseUciMoveString } = await import(SHARED + 'game-logic/chess/uci.ts');
const { bandFor } = await import(SHARED + 'puzzles/bands.ts');
const { LICHESS_CSV_COLUMNS, lichessMetadata, lichessRowPasses, parseLichessRow } = await import(
  SHARED + 'puzzles/lichess.ts'
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'data', 'puzzles');
const OUT_FILE = join(OUT_DIR, 'chess.jsonl');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

if (!args.csv) {
  console.error('Missing --csv=<path to lichess_db_puzzle.csv>');
  process.exit(1);
}

const TARGET = Number(args.target ?? 2000);
const SEED = Number(args.seed ?? 1);
/** Generated ids start here; 001–099 stay reserved for hand-authored puzzles. */
const ID_BASE = 1000;

// ---------------------------------------------------------------------------
// Seeded RNG, so a run is reproducible
// ---------------------------------------------------------------------------

let rngState = SEED >>> 0;
function random() {
  // xorshift32 — the reservoir only needs a decent uniform, and this keeps the
  // script free of a dependency on the app's own RNG module.
  rngState ^= rngState << 13;
  rngState ^= rngState >>> 17;
  rngState ^= rngState << 5;
  return ((rngState >>> 0) % 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Verification — the gate's assertions, as emit conditions
// ---------------------------------------------------------------------------

/** Every legal move that delivers mate, as UCI. */
function matingMoves(state) {
  return ChessEngine.getAllLegalMoves(state)
    .filter((m) => {
      const r = ChessEngine.validateMove(state, m.from, m.to, false, 'queen');
      return r.resultingState?.isCheckmate === true;
    })
    .map((m) => `${m.from}${m.to}`);
}

/**
 * Apply the setup move and verify the whole line.
 *
 * Returns `{ position, playerColor }` or a `reason` naming why the row was
 * dropped, so the run can report where its losses went instead of silently
 * keeping a tenth of what it read.
 */
function verify(row) {
  const raw = (() => {
    try {
      return fenToState(row.fen);
    } catch {
      return null;
    }
  })();
  if (!raw) return { reason: 'undecodable-fen' };

  const setup = parseUciMoveString(row.moves[0]);
  if (!setup) return { reason: 'bad-setup-move' };
  const applied = ChessEngine.validateMove(raw, setup.from, setup.to, false, setup.promotion);
  if (!applied.valid || !applied.resultingState) return { reason: 'illegal-setup-move' };

  let state = applied.resultingState;
  const position = stateToFen(state);
  // The gate asserts this for every puzzle; a position that does not re-encode
  // to itself would drift the moment it came back from a database.
  if (stateToFen(fenToState(position)) !== position) return { reason: 'fen-round-trip' };
  if (state.isCheckmate || state.isStalemate || state.isDraw) return { reason: 'already-over' };

  const playerColor = state.currentTurn;
  const line = row.moves.slice(1);
  const mateClaimed = row.themes.some((t) => /^mateIn\d$/.test(t) || t === 'mate');
  const playerMoves = Math.ceil(line.length / 2);

  // Uniqueness, before the line is walked — a mate in one with two solutions
  // fails the shipped gate, and a "mate in two" that mates in one is mislabelled.
  if (mateClaimed) {
    const mates = matingMoves(state);
    if (playerMoves === 1) {
      if (mates.length !== 1) return { reason: 'mate-not-unique' };
      if (mates[0] !== line[0]) return { reason: 'mate-not-the-scripted-move' };
    } else if (mates.length > 0) {
      return { reason: 'shorter-mate-exists' };
    }
  }

  for (const uci of line) {
    const move = parseUciMoveString(uci);
    if (!move) return { reason: 'bad-move' };
    const result = ChessEngine.validateMove(state, move.from, move.to, false, move.promotion);
    if (!result.valid || !result.resultingState) return { reason: 'illegal-move' };
    state = result.resultingState;
  }

  if (mateClaimed && !state.isCheckmate) return { reason: 'mate-not-delivered' };
  return { position, playerColor };
}

// ---------------------------------------------------------------------------
// Read, filter, sample
// ---------------------------------------------------------------------------

/**
 * Reservoir sample per 50-point rating bucket.
 *
 * Never read 5M rows into memory, and never take the first N — the dump is not
 * shuffled, and the coverage gate wants an even spread across the whole range
 * rather than a pile in the middle where the mass is.
 */
const BUCKET = 50;
const perBucket = new Map();
const seen = new Map();
const dropped = new Map();
const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);

const capPerBucket = Math.max(4, Math.ceil(TARGET / ((2800 - 400) / BUCKET)));

console.log(`Reading ${args.csv}`);
console.log(`Target ${TARGET}, up to ${capPerBucket} per ${BUCKET}-point bucket, seed ${SEED}`);

/**
 * Refuse to run on anything that is not the Lichess dump.
 *
 * This is a provenance guard, not a parsing convenience. Every puzzle this
 * script emits carries `source: "Lichess puzzle … (CC0 1.0)"`, so pointing it
 * at some other CSV writes a **false licence claim** to disk — which is exactly
 * the class of problem the v2.0 diligence packet exists because of. Asserting
 * the dump's own header is the cheapest way to make that mistake impossible.
 *
 * (It was not hypothetical: this guard was added after a fixture CSV, generated
 * from our own engine to exercise the script, produced 106 puzzles each
 * claiming to be Lichess content.)
 *
 * **What it does not catch:** a file that copies the dump's header. A header is
 * evidence of shape, not of origin. The real assurances are the recorded
 * SHA-256 in `LICENSE-lichess.md` and the fact that the only committed corpus
 * comes from a dump someone downloaded deliberately — so if you are testing
 * this script, give your fixture a different header on purpose.
 */
function assertLichessHeader(line) {
  const cells = line.split(',').map((c) => c.trim());
  const expected = LICHESS_CSV_COLUMNS;
  const matches = expected.every((name, i) => cells[i] === name);
  if (!matches) {
    console.error(
      'Refusing to import: the first line is not the Lichess puzzle dump header.\n' +
        `  expected: ${expected.join(',')}\n` +
        `  found:    ${cells.slice(0, expected.length).join(',')}\n` +
        'Every puzzle this script emits is stamped as CC0 Lichess content, so it\n' +
        'must only ever read the Lichess dump.',
    );
    process.exit(1);
  }
}

let read = 0;
let sawHeader = false;
const rl = createInterface({
  input: createReadStream(args.csv, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

for await (const line of rl) {
  if (!sawHeader) {
    assertLichessHeader(line);
    sawHeader = true;
    continue;
  }
  read++;
  if (read % 500_000 === 0) console.log(`  …${read.toLocaleString()} rows`);

  const row = parseLichessRow(line);
  if (!row) {
    bump(dropped, 'unparseable');
    continue;
  }
  if (!lichessRowPasses(row)) {
    bump(dropped, 'filtered');
    continue;
  }

  const bucket = Math.floor(row.rating / BUCKET) * BUCKET;
  bump(seen, bucket);
  const kept = perBucket.get(bucket) ?? [];
  if (kept.length < capPerBucket) {
    kept.push(row);
  } else {
    // Classic reservoir: replace with probability capPerBucket / seen.
    const j = Math.floor(random() * seen.get(bucket));
    if (j < capPerBucket) kept[j] = row;
  }
  perBucket.set(bucket, kept);
}

console.log(`Read ${read.toLocaleString()} rows`);

// ---------------------------------------------------------------------------
// Verify and emit
// ---------------------------------------------------------------------------

const candidates = [...perBucket.entries()]
  .sort((a, b) => a[0] - b[0])
  .flatMap(([, rows]) => rows);

const puzzles = [];
let nextId = ID_BASE;
for (const row of candidates) {
  const checked = verify(row);
  if (checked.reason) {
    bump(dropped, checked.reason);
    continue;
  }
  puzzles.push(
    lichessMetadata(row, checked.position, checked.playerColor, `chess-${nextId++}`),
  );
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, puzzles.map((p) => JSON.stringify(p)).join('\n') + '\n', 'utf8');

// A CC0 claim you cannot date is a CC0 claim you cannot defend.
const sha = createHash('sha256').update(readFileSync(args.csv)).digest('hex');
writeFileSync(
  join(OUT_DIR, 'LICENSE-lichess.md'),
  [
    '# Lichess open puzzle database',
    '',
    'The chess puzzles in `chess.jsonl` whose `source` names a Lichess puzzle id are',
    'derived from the Lichess open puzzle database, released by Lichess under the',
    '**CC0 1.0 Universal** public domain dedication. Attribution is a courtesy rather',
    'than a requirement; it is given on every imported puzzle and at `/licenses`.',
    '',
    'The positions come from games played by Lichess users. What this project adds is',
    'the band assignment, the calibration, and the generated prompt and explanation.',
    '',
    `- Source file: \`${args.csv.split(/[\\/]/).pop()}\``,
    `- SHA-256: \`${sha}\``,
    `- Imported: ${new Date().toISOString().slice(0, 10)}`,
    `- Rows read: ${read}`,
    `- Puzzles emitted: ${puzzles.length}`,
    '',
    'The raw CSV is deliberately not committed; `data/puzzles/*.csv` is gitignored.',
    '',
  ].join('\n'),
  'utf8',
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`\nEmitted ${puzzles.length} puzzles → ${OUT_FILE}`);
// Sampling losses and verification losses are different things, and reporting
// only the second makes a bucket cap look like a broken importer.
const passedFilters = [...seen.values()].reduce((a, b) => a + b, 0);
console.log(
  `\n${passedFilters} rows passed the filters; ` +
    `${candidates.length} survived reservoir sampling; ` +
    `${puzzles.length} survived verification.`,
);
console.log('\nDropped:');
if (dropped.size === 0) console.log('  (nothing)');
for (const [reason, n] of [...dropped].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(8)}  ${reason}`);
}

const byBand = {};
for (const p of puzzles) {
  const id = bandFor('chess', p.rating).id;
  byBand[id] = (byBand[id] ?? 0) + 1;
}
console.log('\nBy band:');
for (const [band, n] of Object.entries(byBand)) console.log(`  ${band.padEnd(14)} ${n}`);
