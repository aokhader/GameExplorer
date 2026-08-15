/**
 * Human-readable labels for how a game ended.
 *
 * Set on multiplayer games (see the API's `end_reason`); bot and legacy rows
 * carry none and simply omit it. Shared so the two platforms' history lists say
 * the same thing — web humanised these while mobile showed nothing at all.
 */
export const END_REASON_LABELS: Record<string, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  flag: 'on time',
  resign: 'resignation',
  draw_agreement: 'agreement',
  fifty_move: 'fifty-move rule',
  repetition: 'repetition',
  disconnect: 'disconnection',
  board_full: 'board full',
  no_moves: 'no moves',
};

/** The label for an end reason, or null when there is nothing worth showing. */
export function endReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return END_REASON_LABELS[reason] ?? null;
}
