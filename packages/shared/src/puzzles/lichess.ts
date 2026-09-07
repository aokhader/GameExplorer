/**
 * Reading the Lichess open puzzle database into our own `Puzzle` shape.
 *
 * The pure half of `scripts/puzzles/import-lichess.mjs` lives here so it can be
 * unit-tested: the row→puzzle transform, the theme mapping, and the filters. The
 * script keeps the parts that touch the disk and the engine.
 *
 * **Provenance.** The database is published by Lichess under CC0 1.0 — a public
 * domain dedication, so attribution is a courtesy rather than a requirement.
 * Every imported puzzle carries a `source` naming the original, which both
 * `PuzzleScreen`s already render under the explanation. See
 * `data/puzzles/LICENSE-lichess.md` and the entry on `/licenses`.
 *
 * **The positions are games played by Lichess users**; what this project adds
 * is the band model, the calibration, and the generated prose.
 */

import type { Puzzle, PuzzleDifficulty, PuzzleGoal, PuzzleStep } from './types';

/** One row of the CSV, already split. */
export interface LichessRow {
  puzzleId: string;
  /** Position BEFORE the opponent's setup move — see `lichessRowToPuzzle`. */
  fen: string;
  /** Space-separated UCI moves. The first is the setup move. */
  moves: string[];
  rating: number;
  ratingDeviation: number;
  popularity: number;
  nbPlays: number;
  themes: string[];
}

export const LICHESS_CSV_COLUMNS = [
  'PuzzleId',
  'FEN',
  'Moves',
  'Rating',
  'RatingDeviation',
  'Popularity',
  'NbPlays',
  'Themes',
  'GameUrl',
  'OpeningTags',
] as const;

/**
 * Parse one CSV line.
 *
 * The dump has no quoted fields or embedded commas in the columns used here, so
 * a split is honest — but the column count is checked, because a format change
 * that silently shifted every field would otherwise import garbage.
 */
export function parseLichessRow(line: string): LichessRow | null {
  const cells = line.split(',');
  if (cells.length < LICHESS_CSV_COLUMNS.length - 1) return null;

  const [puzzleId, fen, moves, rating, ratingDeviation, popularity, nbPlays, themes] = cells;
  const row: LichessRow = {
    puzzleId,
    fen,
    moves: moves.trim().split(/\s+/).filter(Boolean),
    rating: Number(rating),
    ratingDeviation: Number(ratingDeviation),
    popularity: Number(popularity),
    nbPlays: Number(nbPlays),
    themes: (themes ?? '').trim().split(/\s+/).filter(Boolean),
  };

  if (!row.puzzleId || !row.fen || row.moves.length < 2) return null;
  if (!Number.isFinite(row.rating) || !Number.isFinite(row.nbPlays)) return null;
  return row;
}

/**
 * Lichess theme → one of ours, where we have an equivalent.
 *
 * Deliberately partial. A Lichess theme with no counterpart is dropped rather
 * than invented, and a puzzle left with no themes at all is dropped by
 * {@link lichessRowPasses} — a puzzle we cannot describe is one we cannot
 * present.
 */
export const LICHESS_THEME_MAP: Record<string, string> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  backRankMate: 'back-rank',
  discoveredAttack: 'discovered-attack',
  deflection: 'deflection',
  sacrifice: 'sacrifice',
  promotion: 'promotion',
  advancedPawn: 'promotion',
  mateIn1: 'mate-in-1',
  mateIn2: 'mate-in-2',
  mateIn3: 'mate-in-3',
  hangingPiece: 'hanging-piece',
  trappedPiece: 'trapped-piece',
  doubleCheck: 'double-check',
  attraction: 'attraction',
  clearance: 'clearance',
  interference: 'interference',
  xRayAttack: 'x-ray',
  zugzwang: 'zugzwang',
  quietMove: 'quiet-move',
  defensiveMove: 'defensive-move',
  endgame: 'endgame',
  rookEndgame: 'endgame',
  pawnEndgame: 'endgame',
  queenEndgame: 'endgame',
  bishopEndgame: 'endgame',
  knightEndgame: 'endgame',
  queenRookEndgame: 'endgame',
};

export function mapLichessThemes(themes: readonly string[]): string[] {
  const mapped = new Set<string>();
  for (const theme of themes) {
    const ours = LICHESS_THEME_MAP[theme];
    if (ours) mapped.add(ours);
  }
  return [...mapped];
}

/**
 * Filters applied before any engine work, because engine work is the expensive
 * part and most rows will not survive these.
 *
 * - **Volume and popularity** — the Glicko rating is the reason to import from
 *   here at all, and it only means something with plays behind it. Unpopular
 *   puzzles are also, reliably, ugly ones.
 * - **Line length** — a six-move combination on a phone is a memory test.
 * - **Themes** — see {@link mapLichessThemes}.
 */
export const LICHESS_FILTERS = {
  minPlays: 300,
  minPopularity: 80,
  maxRatingDeviation: 80,
  /** Player moves, i.e. half the line after the setup move is removed. */
  maxPlayerMoves: 5,
  minRating: 400,
  maxRating: 2800,
} as const;

export function lichessRowPasses(row: LichessRow): boolean {
  if (row.nbPlays < LICHESS_FILTERS.minPlays) return false;
  if (row.popularity < LICHESS_FILTERS.minPopularity) return false;
  if (row.ratingDeviation > LICHESS_FILTERS.maxRatingDeviation) return false;
  if (row.rating < LICHESS_FILTERS.minRating || row.rating > LICHESS_FILTERS.maxRating) {
    return false;
  }
  // The setup move is not part of the puzzle, so the player moves are every
  // other move from index 1.
  const playerMoves = Math.ceil((row.moves.length - 1) / 2);
  if (playerMoves < 1 || playerMoves > LICHESS_FILTERS.maxPlayerMoves) return false;
  return mapLichessThemes(row.themes).length > 0;
}

/**
 * Turn the moves after the setup move into our step pairs.
 *
 * Lichess lists the line as `[setup, player, opponent, player, …]`. Dropping the
 * setup move leaves an alternating list whose player moves are the even indices,
 * which is exactly `PuzzleStep { move, reply }`. The last step has no reply —
 * that is what "solved" means.
 */
export function lichessSteps(movesAfterSetup: readonly string[]): PuzzleStep[] {
  const steps: PuzzleStep[] = [];
  for (let i = 0; i < movesAfterSetup.length; i += 2) {
    const move = movesAfterSetup[i];
    const reply = movesAfterSetup[i + 1];
    steps.push(reply === undefined ? { move } : { move, reply });
  }
  return steps;
}

/**
 * Which goal to claim.
 *
 * Conservative on purpose, because the content gate checks the claim against
 * the engine and a wrong goal fails the build rather than misleading a player:
 *
 * - `mate` only when Lichess says so **and** the line ends on our move, which is
 *   what "delivers mate" looks like in step form.
 * - **Never `win-material` from the themes alone.** The gate proves that goal by
 *   walking the line and comparing material, and most Lichess lines stop the
 *   moment the win is decided — before the material is actually collected. The
 *   importer promotes a puzzle to `win-material` only if its own walk confirms
 *   the swing.
 * - Everything else is `best-move`.
 */
export function lichessGoal(themes: readonly string[], steps: readonly PuzzleStep[]): PuzzleGoal {
  const mateThemes = ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'mate'];
  const claimsMate = themes.some((t) => mateThemes.includes(t));
  const endsOnOurMove = steps.length > 0 && steps[steps.length - 1].reply === undefined;
  return claimsMate && endsOnOurMove ? 'mate' : 'best-move';
}

/**
 * Authoring tier from the Lichess rating.
 *
 * Distinct from the band: `difficulty` is the coarse authoring tier that orders
 * `byProgression`, while the band is the measured strength a player picks. The
 * thresholds are chosen so the shipped hand-authored puzzles keep the tier they
 * were written with.
 */
export function lichessDifficulty(rating: number): PuzzleDifficulty {
  if (rating < 1050) return 'easy';
  if (rating < 1750) return 'medium';
  return 'hard';
}

/**
 * One sentence telling the player what to do.
 *
 * Lichess ships no prompt and no explanation, so both are templated. This is
 * honestly weaker than the hand-written prose on the 20 authored chess puzzles,
 * and it is the accepted trade at scale — the authored set still sorts first,
 * so it is what a new player meets.
 */
export function lichessPrompt(
  color: 'white' | 'black',
  goal: PuzzleGoal,
  steps: readonly PuzzleStep[],
  themes: readonly string[],
): string {
  const side = color === 'white' ? 'White' : 'Black';
  if (goal === 'mate') {
    const n = steps.length;
    const inN = n === 1 ? 'one' : n === 2 ? 'two' : n === 3 ? 'three' : `${n}`;
    return `${side} to play and mate in ${inN}.`;
  }
  const named = themes.find((t) => t !== 'endgame');
  if (named) {
    const readable = named.replace(/-/g, ' ');
    return `${side} to play. There is a ${readable} here — find it.`;
  }
  return `${side} to play. Find the best move.`;
}

export function lichessExplanation(themes: readonly string[], goal: PuzzleGoal): string {
  const list = themes.map((t) => t.replace(/-/g, ' '));
  const motif =
    list.length === 0
      ? ''
      : list.length === 1
        ? ` The motif is ${list[0]}.`
        : ` The motifs are ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}.`;
  return goal === 'mate'
    ? `The line is forced — every reply runs into the same mate.${motif}`
    : `This is the only move that keeps the advantage.${motif}`;
}

/** `source` line for an imported puzzle. Attribution is courtesy under CC0. */
export function lichessSource(puzzleId: string): string {
  return `Lichess puzzle ${puzzleId} — lichess.org/training/${puzzleId} (CC0 1.0)`;
}

/**
 * Everything about a row that does not need an engine.
 *
 * The caller supplies `position` and `playerColor`, because deriving them means
 * applying the setup move — which needs the chess engine and therefore belongs
 * in the script, not in this module.
 */
export function lichessMetadata(
  row: LichessRow,
  position: string,
  playerColor: 'white' | 'black',
  id: string,
): Omit<Puzzle, 'goalValue'> {
  const steps = lichessSteps(row.moves.slice(1));
  const goal = lichessGoal(row.themes, steps);
  const themes = mapLichessThemes(row.themes);
  return {
    id,
    game: 'chess',
    position,
    playerColor,
    goal,
    prompt: lichessPrompt(playerColor, goal, steps, themes),
    difficulty: lichessDifficulty(row.rating),
    rating: row.rating,
    themes,
    steps,
    explanation: lichessExplanation(themes, goal),
    source: lichessSource(row.puzzleId),
  };
}
