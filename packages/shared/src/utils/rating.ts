export type GameOutcome = 'win' | 'loss' | 'draw';

/** Expected score for a player given both ratings (standard ELO formula). */
export function getExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * K-factor used to scale rating changes.
 * 32 during provisional period (< 30 games), 20 once established.
 */
export function getKFactor(gamesPlayed: number): number {
  return gamesPlayed < 30 ? 32 : 20;
}

/**
 * Compute a player's new ELO rating after a game.
 * Minimum rating is clamped to 100.
 */
export function calculateNewRating(
  playerRating: number,
  opponentRating: number,
  outcome: GameOutcome,
  gamesPlayed: number,
): number {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const expected = getExpectedScore(playerRating, opponentRating);
  const k = getKFactor(gamesPlayed);
  return Math.max(100, Math.round(playerRating + k * (score - expected)));
}
