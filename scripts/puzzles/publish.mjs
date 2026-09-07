/**
 * Turn `data/puzzles/*.jsonl` into the two things the apps actually read.
 *
 * Usage:
 *   ./node_modules/.bin/tsx scripts/puzzles/publish.mjs [--core=100]
 *
 * Two outputs, and the split is the whole architecture:
 *
 * 1. **Served index + pages** — `apps/web/public/puzzles/<game>/index.json`
 *    (band totals and ids) plus `<band>-<n>.json` pages of 200. Fetched a page
 *    at a time and cached on the device. This is the depth.
 * 2. **Bundled core** — `packages/shared/src/constants/puzzles/generated/`,
 *    a fixed quota per band compiled into the app. This is the floor: it is
 *    what a fresh install with no network has ever seen.
 *
 * The corpus itself is deliberately NOT bundled. `packages/shared` sets
 * `"react-native": "./src/index.ts"`, so Metro parses this package's source on
 * every cold boot — and the full chess corpus is 5.2MB, which is a boot-time
 * regression on exactly the devices that matter.
 *
 * Run after an import or a mining run. Both outputs are generated; edit the
 * corpus, never these.
 */

const SHARED = new URL('../../packages/shared/src/', import.meta.url).href;
const { PUZZLE_BANDS, bandFor, MIN_CORE_PUZZLES_PER_BAND } = await import(SHARED + 'puzzles/bands.ts');
const { byProgression } = await import(SHARED + 'puzzles/source.ts');
// The hand-authored sets, NOT `PUZZLES` — that one already folds in the
// generated core, and re-publishing the core would duplicate it into the chunks.
const { CHESS_PUZZLES, CHECKERS_PUZZLES, REVERSI_PUZZLES, GO_PUZZLES } = await import(
  SHARED + 'constants/puzzles/index.ts'
);
const AUTHORED = {
  chess: CHESS_PUZZLES,
  checkers: CHECKERS_PUZZLES,
  reversi: REVERSI_PUZZLES,
  go: GO_PUZZLES,
};

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CORPUS_DIR = join(ROOT, 'data', 'puzzles');
const CHUNK_DIR = join(ROOT, 'apps', 'web', 'public', 'puzzles');
const CORE_DIR = join(ROOT, 'packages', 'shared', 'src', 'constants', 'puzzles', 'generated');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);

/** Puzzles per band compiled into the app. */
const CORE_PER_BAND = Number(args.core ?? 100);

/**
 * Puzzles per served page. Sized so a page fits comfortably in AsyncStorage on
 * a phone (~100KB) — see the paging comment below.
 */
const PAGE_SIZE = Number(args.page ?? 200);

const GAMES = ['chess', 'checkers', 'reversi', 'go'];

/**
 * Spread the core evenly across a band's rating range rather than taking the
 * first N.
 *
 * The corpus is in progression order, so the first N of a band are all clustered
 * at its bottom edge — which would satisfy a count check and leave the offline
 * player meeting only the easiest end of every band. Picking at even intervals
 * is what makes the bundled set feel like the band it claims to be.
 */
function spread(list, n) {
  if (list.length <= n) return list;
  const step = list.length / n;
  return Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]);
}

let anyCore = false;
const summary = [];

for (const game of GAMES) {
  const file = join(CORPUS_DIR, `${game}.jsonl`);
  if (!existsSync(file)) {
    // Publish an EMPTY index rather than nothing.
    //
    // Without it the fetch source asks for a file that does not exist, and a
    // 404 is not free: Next runs its whole routing pipeline to produce one, and
    // under load that took **over five seconds** — long enough that the puzzle
    // screen had not painted before Playwright gave up, on precisely the three
    // games with no corpus. An empty index answers instantly, and the layered
    // source already treats an all-empty reply as a miss and falls through to
    // the bundled set, which is the same outcome by a much faster road.
    const dir = join(CHUNK_DIR, game);
    mkdirSync(dir, { recursive: true });
    const empty = { pageSize: PAGE_SIZE, bands: {} };
    for (const band of PUZZLE_BANDS[game]) empty.bands[band.id] = { total: 0, ids: [] };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(empty), 'utf8');
    summary.push(`${game.padEnd(9)} — no corpus yet; empty index published`);
    continue;
  }

  const mined = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  // The served set is authored ∪ mined, not the mined corpus alone.
  //
  // This is load-bearing. The fetched source *replaces* the bundled one when it
  // answers, so publishing only the mined corpus quietly removes the twenty
  // hand-authored chess puzzles — the ones with real written explanations, and
  // the ones `byProgression` puts first precisely so a new player meets them.
  // They vanished from the web app entirely before this was noticed, with no
  // error anywhere: the route loaded and served a mined puzzle instead.
  const authored = AUTHORED[game] ?? [];
  const seen = new Set(mined.map((p) => p.id));
  const puzzles = [...authored.filter((p) => !seen.has(p.id)), ...mined];

  // --- served index + paged band files -------------------------------------
  //
  // Paged rather than one file per band, for two reasons that turned out to be
  // the same reason. A chess band is ~850KB whole, which is too large to put in
  // AsyncStorage — so a device cache, the thing that actually makes the corpus
  // work offline, could not hold one. It is also a large download to serve one
  // puzzle. At 200 per page both problems go away: ~100KB, cacheable on every
  // platform, and a player working through a band in order pulls one page at a
  // time as they need it.
  //
  // The index carries every id, which is what lets `countByBand` and
  // `idsByBand` answer without touching a page at all — and those two are on
  // the screen's load path, where `nextPuzzle` needs exactly one page.
  const gameChunkDir = join(CHUNK_DIR, game);
  mkdirSync(gameChunkDir, { recursive: true });

  // Clear the directory first. Page counts shrink as well as grow — a band that
  // loses puzzles leaves orphan pages behind, and a stale page is worse than a
  // missing one: it is served, it parses, and it quietly hands back content the
  // corpus no longer contains.
  for (const stale of readdirSync(gameChunkDir)) {
    if (stale.endsWith('.json')) rmSync(join(gameChunkDir, stale));
  }

  const core = [];
  const counts = [];
  const index = { pageSize: PAGE_SIZE, bands: {} };

  for (const band of PUZZLE_BANDS[game]) {
    // Sorted by `byProgression`, the same comparator the in-memory source uses.
    // The fetch source serves in *index order*, so if the published order were
    // merely "whatever the corpus file happened to hold", the two sources would
    // hand a player different puzzles for the same request — and the fallback
    // would silently reorder the set the moment the network dropped.
    const inBand = puzzles
      .filter((p) => bandFor(game, p.rating).id === band.id)
      .sort(byProgression);
    index.bands[band.id] = { total: inBand.length, ids: inBand.map((p) => p.id) };

    for (let page = 0; page * PAGE_SIZE < inBand.length || page === 0; page++) {
      const slice = inBand.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      writeFileSync(
        join(gameChunkDir, `${band.id}-${page}.json`),
        JSON.stringify(slice),
        'utf8',
      );
      if (slice.length === 0) break;
    }

    // Slice the core from the MINED puzzles only. The authored ones are already
    // compiled in from `constants/puzzles/<game>.ts`, so including them here
    // puts the same id in `PUZZLES` twice — which is not merely untidy: it made
    // the band's solved count go up by two per solve, because a duplicated id
    // is counted once per appearance.
    const authoredIds = new Set(authored.map((p) => p.id));
    const picked = spread(
      inBand.filter((p) => !authoredIds.has(p.id)),
      CORE_PER_BAND,
    );
    core.push(...picked);
    counts.push(`${band.id} ${inBand.length}/${picked.length}`);

    if (inBand.length > 0 && picked.length < MIN_CORE_PUZZLES_PER_BAND) {
      console.warn(
        `  ! ${game}/${band.id}: only ${picked.length} bundled, below the ` +
          `${MIN_CORE_PUZZLES_PER_BAND} the coverage gate requires`,
      );
    }
  }

  writeFileSync(join(gameChunkDir, 'index.json'), JSON.stringify(index), 'utf8');

  // --- bundled core --------------------------------------------------------
  mkdirSync(CORE_DIR, { recursive: true });
  const CONST = `${game.toUpperCase()}_CORE_PUZZLES`;
  // A JSON string parsed at runtime, not an object literal. Engines parse
  // `JSON.parse("…")` substantially faster than the equivalent literal, and
  // this module sits on the cold-boot path of every native launch. It also
  // keeps the generated file to one line, so a regenerated corpus does not
  // produce a diff nobody can read.
  writeFileSync(
    join(CORE_DIR, `${game}.core.ts`),
    [
      '// GENERATED by scripts/puzzles/publish.mjs — DO NOT EDIT.',
      '//',
      `// A ${CORE_PER_BAND}-per-band slice of data/puzzles/${game}.jsonl, spread evenly across`,
      '// each band rather than taken from its bottom edge. This is the set a fresh',
      '// install with no network has; the rest is fetched a band at a time and cached.',
      '//',
      '// Parsed from a string rather than written as an object literal: this module is',
      '// on the cold-boot path (Metro parses packages/shared source on every launch)',
      '// and JSON.parse is markedly faster than evaluating an equivalent literal.',
      "import type { Puzzle } from '../../../puzzles/types';",
      '',
      `export const ${CONST}: Puzzle[] = JSON.parse(`,
      `  ${JSON.stringify(JSON.stringify(core))}`,
      ') as Puzzle[];',
      '',
    ].join('\n'),
    'utf8',
  );

  anyCore = true;
  const chunkBytes = puzzles.reduce((n, p) => n + JSON.stringify(p).length, 0);
  summary.push(
    `${game.padEnd(9)} corpus ${String(puzzles.length).padStart(6)}  ` +
      `core ${String(core.length).padStart(4)}  ` +
      `served ${(chunkBytes / 1024 / 1024).toFixed(1)}MB  ` +
      `core ${(JSON.stringify(core).length / 1024).toFixed(0)}KB`,
  );
  console.log(`${game}: ${counts.join(', ')}`);
}

if (!anyCore) {
  console.error('\nNo corpus files found under data/puzzles/. Run an importer first.');
  process.exit(1);
}

console.log('\n' + summary.join('\n'));
console.log(`\nChunks → ${CHUNK_DIR}`);
console.log(`Core   → ${CORE_DIR}`);
