// After the board was mirrored, check that every mined checkers puzzle still
// scripts the move the analyser picks.
//
// A mirror cannot change what a move is worth — the position and its values
// mirror exactly — so a disagreement can only mean the puzzle had SEVERAL
// equally-best moves and the analyser, which walks files left to right, now
// meets a different one first. Those puzzles were already able to tell a player
// their equally-good move was wrong; this says how many there are.
//
// `--fix` rewrites the key move of the single-step ones to the analyser's pick,
// which is what the mining script recorded in the first place. Multi-step lines
// are only reported: replacing their first move would orphan the rest of the
// line, so they need a human.

import fs from 'node:fs';
import path from 'node:path';
import { checkersFenToState } from '../../packages/shared/src/game-logic/checkers/fen';
import { analyzeCheckersPosition } from '../../packages/shared/src/game-logic/checkers/weakEngine';
import { CheckersEngine } from '../../packages/shared/src/game-logic/checkers/engine';

// `import.meta.dirname` is undefined here: tsx loads this as CJS. Run from the
// repo root.
const ROOT = process.cwd();
const FIX = process.argv.includes('--fix');
const DEPTH = 6;

const file = 'data/puzzles/checkers.jsonl';
const raw = fs.readFileSync(path.join(ROOT, file), 'utf8');
const eol = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r?\n/);

let checked = 0;
let agreed = 0;
const mismatches: { id: string; stored: string; picked: string; steps: number; tied: boolean }[] = [];

const out = lines.map((line) => {
  if (!line.trim()) return line;
  const puzzle = JSON.parse(line);
  checked++;

  const state = checkersFenToState(puzzle.position);
  const best = analyzeCheckersPosition(state, DEPTH).bestMove;
  const stored = puzzle.steps[0].move as string;
  const from = stored.slice(0, 2);
  const to = stored.slice(2, 4);

  if (best && best.from === from && best.to === to) {
    agreed++;
    return line;
  }
  if (!best) return line;

  // Is the stored move merely tied with the analyser's pick, or actually worse?
  const scoreAfter = (f: string, t: string) => {
    const next = CheckersEngine.validateMove(state, f, t).resultingState;
    return next ? analyzeCheckersPosition(next, DEPTH - 1).score : Number.NEGATIVE_INFINITY;
  };
  const tied = scoreAfter(from, to) === scoreAfter(best.from, best.to);

  mismatches.push({
    id: puzzle.id,
    stored,
    picked: `${best.from}${best.to}`,
    steps: puzzle.steps.length,
    tied,
  });

  if (FIX && puzzle.steps.length === 1 && tied) {
    puzzle.steps[0].move = `${best.from}${best.to}`;
    return JSON.stringify(puzzle);
  }
  return line;
});

if (FIX) fs.writeFileSync(path.join(ROOT, file), out.join(eol));

console.log(`checked ${checked}, agreed ${agreed}, mismatched ${mismatches.length}`);
for (const m of mismatches) {
  console.log(
    `  ${m.id}  stored ${m.stored}  analyser ${m.picked}  ${m.steps} step(s)  ${m.tied ? 'TIED' : 'WORSE'}`,
  );
}
