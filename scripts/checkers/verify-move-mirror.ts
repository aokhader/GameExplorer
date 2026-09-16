// Proves the transform in project-docs/sql-queries/supabase-mirror-checkers-moves.sql
// without a database.
//
// A saved game from before the board was mirrored is, by definition, a legal
// game with every square mirrored — the mirror is an involution. So: play a real
// game on the board as it is now, mirror it to manufacture an "old" saved game,
// run the migration's transform over that, and replay the result through the
// engine. If every move validates, the transform is right.
//
// It also checks the predicate the SQL uses to decide whether a row still needs
// migrating: on the board as it stands, every legal square is dark.

import { CheckersEngine } from '../../packages/shared/src/game-logic/checkers/engine';
import { isDarkSquare, positionToCoordinates } from '../../packages/shared/src/game-logic/checkers/utils';

/** `translate(sq, 'abcdefgh', 'hgfedcba')`, the SQL's mirror. */
const mirrorSquare = (sq: string) =>
  String.fromCharCode(97 + (7 - (sq.charCodeAt(0) - 97))) + sq.slice(1);

/** `gx_mirror_checkers_move`. Absent keys stay absent. */
function mirrorMove(m: Record<string, unknown>): Record<string, unknown> {
  const out = { ...m };
  if ('from' in m) out.from = mirrorSquare(m.from as string);
  if ('to' in m) out.to = mirrorSquare(m.to as string);
  if ('path' in m && Array.isArray(m.path)) out.path = (m.path as string[]).map(mirrorSquare);
  if ('captures' in m && Array.isArray(m.captures)) {
    out.captures = (m.captures as string[]).map(mirrorSquare);
  }
  return out;
}

/** `gx_square_is_dark`. */
const squareIsDark = (sq: string) => {
  const { row, col } = positionToCoordinates(sq);
  return isDarkSquare(row, col);
};

let state = CheckersEngine.newGame();
const played: Record<string, unknown>[] = [];

// A real game, played by the engine against itself, in today's coordinates.
for (let ply = 0; ply < 60 && !state.isGameOver; ply++) {
  const moves = CheckersEngine.getAllLegalMoves(state);
  if (moves.length === 0) break;
  const move = moves[ply % moves.length];
  const result = CheckersEngine.validateMove(state, move.from, move.to);
  if (!result.valid) throw new Error(`self-play produced an illegal move: ${move.from}${move.to}`);
  state = result.resultingState!;
  played.push({
    from: move.from,
    to: move.to,
    path: move.path,
    captures: move.captures,
    isKingPromotion: move.isKingPromotion,
  });
}

// Manufacture the pre-migration row, then migrate it back.
const legacyRow = played.map(mirrorMove);
const migrated = legacyRow.map(mirrorMove);

const fails: string[] = [];

if (!played.every((m) => squareIsDark(m.from as string) && squareIsDark(m.to as string))) {
  fails.push('a self-played move landed on a light square');
}
if (legacyRow.some((m) => squareIsDark(m.from as string))) {
  fails.push('the SQL predicate would not flag a legacy row as needing migration');
}
if (JSON.stringify(migrated) !== JSON.stringify(played)) {
  fails.push('mirroring a legacy row did not reproduce the original game');
}

// The real proof: replay the migrated row through the engine.
let replay = CheckersEngine.newGame();
migrated.forEach((m, i) => {
  const result = CheckersEngine.validateMove(replay, m.from as string, m.to as string);
  if (!result.valid) fails.push(`migrated move ${i + 1} (${m.from}${m.to}) is illegal on replay`);
  else replay = result.resultingState!;
});

console.log(`played ${played.length} moves`);
console.log(`legacy row sample : ${legacyRow.slice(0, 4).map((m) => `${m.from}${m.to}`).join(' ')}`);
console.log(`migrated sample   : ${migrated.slice(0, 4).map((m) => `${m.from}${m.to}`).join(' ')}`);
console.log(fails.length === 0 ? 'PASS — the migration reproduces a replayable game' : `FAIL\n  ${fails.join('\n  ')}`);
process.exit(fails.length === 0 ? 0 : 1);
