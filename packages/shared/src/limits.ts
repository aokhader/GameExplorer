// Free-tier cost-control limits (see project-docs/cost-controls.md).
//
// Every durable table a user can grow is capped so the Supabase free tier
// (500MB DB) can't be exhausted — enforced app-side here and DB-side by
// project-docs/sql-queries/supabase-cost-caps.sql.
export const LIMITS = {
  /** Stored game history per user per game type (oldest pruned beyond this). */
  GAMES_PER_TYPE: 10,
  /** Accepted friendships per user. */
  MAX_FRIENDS: 25,
  /** Outgoing pending friend requests per user. */
  MAX_PENDING_REQUESTS: 10,
  /** Rows in user_blocks per blocker. */
  MAX_BLOCKS: 100,
  /** Open reports per reporter (spam guard). */
  MAX_OPEN_REPORTS: 20,
} as const;
