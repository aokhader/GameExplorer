// One-shot migration, 2026-09-16: mirror every stored checkers square.
//
// The board was drawn as its own mirror image — a1 light, play on the other
// diagonal set, the double corner on White's left. `isDarkSquare` now says a1
// is dark, which moves the playable squares one file across, so everything that
// names a square had to move with them. A left-right mirror is the transform
// that does it: it maps the old dark set onto the new one (7 is odd, so the
// coordinate sum changes parity) and it is a symmetry of checkers, so every
// position stays legal and every solution stays the solution.
//
// Two encodings to mirror:
//
//   - **Algebraic** (`e2c8`, and prose like "c2–e4–g6"): mirror the file letter,
//     a<->h, b<->g, c<->f, d<->e. The rank is untouched; mirroring ranks instead
//     would swap the two players' home rows, which is a different game.
//   - **PDN numbers** (`W:W26,27:B6,15,22,23`): each rank holds four of them in
//     file order, so a mirror reverses each group of four. The numbering rule
//     itself did not change — `pdn.ts` still counts left to right from Black's
//     back rank — which is why interop with real .pdn files survives this.
//
// Run with `node scripts/checkers/mirror-corpus.mjs [--check]`. Idempotent it is
// NOT: running it twice mirrors back. `--check` reports what it would do.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CHECK = process.argv.includes('--check');

/** a<->h, b<->g, c<->f, d<->e. */
export function mirrorFile(letter) {
  return String.fromCharCode(97 + (7 - (letter.charCodeAt(0) - 97)));
}

/** `e2` -> `d2`. */
function mirrorSquare(square) {
  return mirrorFile(square[0]) + square.slice(1);
}

/** Every `[a-h][1-8]` in a string, including the pairs that spell a move. */
function mirrorSquaresIn(text) {
  return text.replace(/[a-h][1-8]/g, mirrorSquare);
}

/** `26` -> `27`: reverse the four numbers a rank holds. */
export function mirrorPdnNumber(n) {
  const index = n - 1;
  const rank = Math.floor(index / 4);
  return rank * 4 + (3 - (index % 4)) + 1;
}

/**
 * `W:W26,27:B6,15,22,23` — mirror every square number in a checkers FEN.
 *
 * Each side's list is re-sorted ascending afterwards, because mirroring reverses
 * the order within a rank and `stateToCheckersFen` writes them ascending. The
 * puzzle tests re-encode every position and compare it to the stored string, so
 * an unsorted list is a failure even though it describes the same board.
 * `K` prefixes travel with their number.
 */
function mirrorPosition(fen) {
  const parts = fen.trim().split(':');
  if (parts.length !== 3) throw new Error(`not a checkers FEN: ${fen}`);
  const [side, ...lists] = parts;
  const mirroredLists = lists.map((list) => {
    const tag = list[0];
    const body = list.slice(1);
    if (body === '') return list;
    const squares = body.split(',').map((token) => {
      const king = token[0] === 'K' || token[0] === 'k';
      const n = mirrorPdnNumber(Number(king ? token.slice(1) : token));
      return { n, king };
    });
    squares.sort((a, b) => a.n - b.n);
    return tag + squares.map(({ n, king }) => (king ? `K${n}` : `${n}`)).join(',');
  });
  return [side, ...mirroredLists].join(':');
}

/**
 * One puzzle. `position` is PDN, everything else that names a square is
 * algebraic — including the prose, which walks the reader through named squares
 * and would otherwise describe the pre-mirror board.
 */
function mirrorPuzzle(puzzle) {
  const out = { ...puzzle, position: mirrorPosition(puzzle.position) };
  if (Array.isArray(puzzle.steps)) {
    out.steps = puzzle.steps.map((step) => {
      const next = { ...step, move: mirrorSquaresIn(step.move) };
      if (step.reply) next.reply = mirrorSquaresIn(step.reply);
      if (step.note) next.note = mirrorSquaresIn(step.note);
      if (Array.isArray(step.also)) next.also = step.also.map(mirrorSquaresIn);
      return next;
    });
  }
  for (const field of ['prompt', 'explanation']) {
    if (typeof puzzle[field] === 'string') out[field] = mirrorSquaresIn(puzzle[field]);
  }
  return out;
}

const changes = [];

function write(file, before, after) {
  if (before === after) {
    changes.push(`unchanged  ${file}`);
    return;
  }
  if (!CHECK) fs.writeFileSync(path.join(ROOT, file), after);
  changes.push(`${CHECK ? 'would fix' : 'mirrored '}  ${file}`);
}

// ── data/puzzles/checkers.jsonl — the mined corpus, one puzzle per line ──────
{
  const file = 'data/puzzles/checkers.jsonl';
  const before = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lines = before.split(/\r?\n/);
  const after = lines
    .map((line) => (line.trim() ? JSON.stringify(mirrorPuzzle(JSON.parse(line))) : line))
    .join(eol);
  write(file, before, after);
}

// ── apps/web/public/puzzles/checkers/*.json — the fetched bands ─────────────
//
// A band file is a bare array of puzzles. `index.json` is band metadata — page
// size, counts and id lists, no squares — so it is skipped rather than rewritten
// through a puzzle-shaped transform it does not fit.
{
  const dir = 'apps/web/public/puzzles/checkers';
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    if (!name.endsWith('.json')) continue;
    const file = `${dir}/${name}`;
    const before = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const parsed = JSON.parse(before);
    if (!Array.isArray(parsed)) {
      changes.push(`skipped    ${file} (band metadata, holds no squares)`);
      continue;
    }
    const trailing = before.endsWith('\n') ? '\n' : '';
    write(file, before, JSON.stringify(parsed.map(mirrorPuzzle)) + trailing);
  }
}

// ── The hand-authored set and the bundled core, both TypeScript ─────────────
//
// `checkers.core.ts` holds its puzzles as one JSON string literal, so it is
// mirrored by parsing that literal rather than by rewriting the module.
{
  const file = 'packages/shared/src/constants/puzzles/generated/checkers.core.ts';
  const before = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const start = before.indexOf('JSON.parse(');
  const open = before.indexOf('"', start);
  const close = before.lastIndexOf('"');
  const literal = before.slice(open, close + 1);
  const puzzles = JSON.parse(JSON.parse(literal)).map(mirrorPuzzle);
  const after = before.slice(0, open) + JSON.stringify(JSON.stringify(puzzles)) + before.slice(close + 1);
  write(file, before, after);
}

// ── The hand-authored puzzles, the tutorial and the lessons ────────────────
//
// TypeScript, so these are mirrored as text. A `position:` string holds PDN and
// takes the number transform; everything else that names a square — `square:`
// fields, `move:`, `reply:`, and the prose that walks a reader through named
// squares — is algebraic and takes the letter one. The two passes cannot
// collide: a PDN string (`W:W26,27:B6,15,22,23`) contains no lower-case file
// letter followed by a rank digit, so the algebraic pass never matches inside
// one.
// The tests that hard-code squares come along for the ride: they describe the
// same boards, so they mirror by the same two rules. `pdn.test.ts` is the one
// exception and is edited by hand — it pins the numbering itself, and a
// mechanical mirror would leave it stating the rule backwards ("h8, f8, d8, b8
// are 4, 3, 2, 1") instead of in reading order.
for (const file of [
  'packages/shared/src/constants/puzzles/checkers.ts',
  'packages/shared/src/constants/tutorials/checkers.ts',
  'packages/shared/src/constants/lessons/checkers.ts',
  'packages/shared/src/game-logic/checkers/engine.test.ts',
  'packages/shared/src/game-logic/checkers/premove.test.ts',
  'packages/shared/src/game-logic/checkers/analysis.test.ts',
  'packages/shared/src/game-logic/checkers/fen.test.ts',
  // Deliberately NOT tutorials.test.ts, matching.test.ts or runtime.test.ts:
  // they cover every game, and Go names its points `a1`..`h8` too. A blanket
  // pass over them rewrote Go's centre point from e5 to d5 and broke five
  // passing tests. Their few checkers lines are mirrored by hand.
]) {
  const before = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // A checkers FEN is recognisable on sight — `W:W…:B…` — so it is matched
  // wherever it appears rather than only after a `position:` key, which is how
  // the tests write them.
  const after = mirrorSquaresIn(
    before.replace(/'([WB]:W[^']*:B[^']*)'/g, (_, fen) => `'${mirrorPosition(fen)}'`),
  );
  write(file, before, after);
}

console.log(changes.join('\n'));
console.log(`\n${changes.filter((c) => !c.startsWith('unchanged')).length} file(s) ${CHECK ? 'to mirror' : 'mirrored'}`);
