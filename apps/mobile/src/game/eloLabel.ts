/**
 * Human names for a rating, per game — the ladders web's training pages use.
 * They differ because the games' rating pools aren't comparable: chess spans a
 * far wider range (and carries the familiar FIDE-ish titles), while checkers and
 * reversi top out around 2000 on our engines.
 */

const CHESS_LADDER: [max: number, label: string][] = [
  [600, 'Beginner'],
  [800, 'Novice'],
  [1000, 'Casual'],
  [1200, 'Club Player'],
  [1400, 'Intermediate'],
  [1600, 'Competitive'],
  [1800, 'Advanced'],
  [2000, 'Expert'],
  [2200, 'Candidate Master'],
  [2400, 'FIDE Master'],
  [2600, 'International Master'],
];
const CHESS_TOP = 'Grandmaster';

const BOARD_LADDER: [max: number, label: string][] = [
  [700, 'Beginner'],
  [900, 'Novice'],
  [1100, 'Casual'],
  [1300, 'Intermediate'],
  [1500, 'Skilled'],
  [1700, 'Advanced'],
  [1900, 'Expert'],
];
const BOARD_TOP = 'Master';

export type EloLabelGame = 'chess' | 'checkers' | 'reversi' | 'go';

/** e.g. `eloLabel('chess', 1450)` → "Competitive". */
export function eloLabel(game: EloLabelGame, elo: number): string {
  const [ladder, top] =
    game === 'chess' ? ([CHESS_LADDER, CHESS_TOP] as const) : ([BOARD_LADDER, BOARD_TOP] as const);
  for (const [max, label] of ladder) {
    if (elo < max) return label;
  }
  return top;
}
