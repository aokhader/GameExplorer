export type GameOutcome = 'win' | 'loss' | 'draw';

/**
 * The range every stored rating lives in — online Rating and Practice level
 * alike. The database holds the same line as a CHECK on both tables
 * (`supabase-security-wave2.sql`), so a value outside it is refused on write.
 * Nothing legitimate reaches the ceiling: the strongest bot is 2800, and wins
 * against it stop moving the number some 600 points above that.
 */
export const RATING_BOUNDS = { min: 100, max: 4000 } as const;

/** The rating a player starts from, and the one a missing row stands for. */
export const DEFAULT_RATING = 1200;

/**
 * Force a stored rating into `RATING_BOUNDS`, whole. Used where a rating is
 * *read* from the database to price someone else's game, so one bad row can
 * never reach the arithmetic.
 */
export function clampRating(rating: unknown): number {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return DEFAULT_RATING;
  return Math.min(RATING_BOUNDS.max, Math.max(RATING_BOUNDS.min, Math.round(rating)));
}

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
 * Compute a player's new ELO rating after a game, kept inside `RATING_BOUNDS`.
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
  return clampRating(playerRating + k * (score - expected));
}
