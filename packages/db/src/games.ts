// Game Queries
import { supabase } from './client';
import type { GameListItem, NewGame, SavedGame } from './types';
import { LIMITS } from '@gameexplorer/shared';
import type { ChessGameState, Color, CheckersGameState, CheckersColor, ReversiGameState, ReversiColor, GoGameState, GoColor } from '@gameexplorer/shared';

export interface SaveGameOptions {
  mode?: 'casual' | 'rated';
  rating_before?: number;
  rating_after?: number;
}

/**
 * Signed-out guests are never persisted, and the writers below bail out before
 * touching the network when `userId` is missing.
 *
 * The `games` insert policy only accepts rows where `auth.uid() = user_id`
 * AND `opponent IN ('stockfish','bot')`, so an anonymous insert is always
 * rejected with 42501. Opening RLS up for it would be worse than useless: a
 * `user_id IS NULL` row is invisible to every client, the per-user cap trigger
 * (supabase-cost-caps.sql) skips it, and the anon key is public — an
 * unauthenticated insert path is a free-tier storage hole. Guests are told
 * up front to sign in if they want their games kept.
 *
 * Both of those claims were FALSE until 2026-09-22, and the file said otherwise
 * the whole time. `supabase-rls-lockdown.sql` tried to drop a policy named
 * "Users can insert their own games"; the live one is "Users can insert own
 * games", `if exists` swallowed the miss, and the two permissive policies were
 * OR'd, so the opponent restriction never applied. Separately, a policy called
 * "Allow reading anonymous games" made `user_id IS NULL` rows readable by
 * `anon`. Both are fixed by supabase-security-wave1b.sql — which is also why
 * this paragraph exists: verify a policy against `pg_policies` before writing a
 * comment that relies on it.
 */
function isSignedIn(userId?: string): userId is string {
  return Boolean(userId);
}

/**
 * Deletes the oldest games of one type for a user when they exceed
 * LIMITS.GAMES_PER_TYPE. Called automatically after every save —
 * fire-and-forget, never throws.
 */
async function pruneOldGames(userId: string, gameType: NewGame['game_type']): Promise<void> {
  try {
    // Fetch the user's game IDs for this type, ordered oldest first
    const { data, error } = await supabase
      .from('games')
      .select('id')
      .eq('user_id', userId)
      .eq('game_type', gameType)
      .order('created_at', { ascending: true });

    if (error || !data || data.length <= LIMITS.GAMES_PER_TYPE) return;

    const toDelete = data.slice(0, data.length - LIMITS.GAMES_PER_TYPE).map((g: { id: string }) => g.id);
    await supabase.from('games').delete().in('id', toDelete);
  } catch {
    // Non-critical — never let pruning break the save flow
  }
}

/** No-ops (returns null, no request) for signed-out guests — see `isSignedIn`. */
export async function saveGame(
  gameState: ChessGameState,
  playerColor: Color,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  if (!isSignedIn(userId)) return null;

  const newGame: NewGame = {
    game_type: 'chess',
    player_color: playerColor,
    // 'bot', as the other three games write: the engine behind it is an
    // implementation detail, and a stale one on native (Arasan).
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    moves: gameState.moveHistory.map(m => ({
      from: m.from,
      to: m.to,
      piece: m.piece,
      capturedPiece: m.capturedPiece,
      isCastling: m.isCastling,
      castlingSide: m.castlingSide,
      promotion: m.promotion,
      isCheck: m.isCheck,
      isCheckmate: m.isCheckmate,
    })),
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save game:', error);
    return null;
  }

  pruneOldGames(userId, 'chess');
  return data as SavedGame;
}

// Every SavedGame column except `moves`, whose JSONB can dwarf the rest of the
// row put together (an 80-game list used to download every move of every game
// just to render titles).
const GAME_LIST_COLUMNS =
  'id, created_at, game_type, player_color, opponent, result, difficulty, user_id, mode, rating_before, rating_after, end_reason, move_count';

export async function getGames(userId?: string): Promise<GameListItem[]> {
  let query = supabase.from('games').select(GAME_LIST_COLUMNS).order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (!error && data) return data as unknown as GameListItem[];

  // Fallback for databases where supabase-latency-phase-c.sql hasn't been run
  // yet (no move_count column): old full-row fetch, counted client-side.
  let legacy = supabase.from('games').select('*').order('created_at', { ascending: false });
  if (userId) legacy = legacy.eq('user_id', userId);
  const { data: legacyData, error: legacyError } = await legacy;

  if (legacyError) {
    console.error('Failed to fetch games:', legacyError);
    return [];
  }

  return (legacyData as SavedGame[]).map(({ moves, ...rest }) => ({
    ...rest,
    move_count: moves?.length ?? 0,
  }));
}

/** No-ops (returns null, no request) for signed-out guests — see `isSignedIn`. */
export async function saveCheckersGame(
  gameState: CheckersGameState,
  playerColor: CheckersColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  if (!isSignedIn(userId)) return null;

  const newGame: NewGame = {
    game_type: 'checkers',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: gameState.moveHistory.map(m => ({
      from: m.from,
      to: m.to,
      path: m.path,
      captures: m.captures,
      isKingPromotion: m.isKingPromotion,
    })) as any,
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save checkers game:', error);
    return null;
  }

  pruneOldGames(userId, 'checkers');
  return data as SavedGame;
}

/** No-ops (returns null, no request) for signed-out guests — see `isSignedIn`. */
export async function saveReversiGame(
  gameState: ReversiGameState,
  playerColor: ReversiColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  if (!isSignedIn(userId)) return null;

  const newGame: NewGame = {
    game_type: 'reversi',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: gameState.moveHistory.map(m => ({
      position: m.position,
      flipped:  m.flipped,
      color:    m.color,
    })) as any,
  };

  const { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  if (error) {
    console.error('Failed to save reversi game:', error);
    return null;
  }

  pruneOldGames(userId, 'reversi');
  return data as SavedGame;
}

/**
 * No-ops (returns null, no request) for signed-out guests — see `isSignedIn`.
 *
 * ⚠️ Needs `project-docs/sql-queries/supabase-add-go.sql`: the `games` table's
 * `game_type` CHECK constraint lists the three older games, so a Go row is
 * rejected until that migration runs. The failure is the graceful one — logged,
 * non-fatal, surfaced to the player as a retryable save error — but no Go game
 * is kept until it is applied.
 */
export async function saveGoGame(
  gameState: GoGameState,
  playerColor: GoColor,
  result: NewGame['result'],
  difficulty?: string,
  userId?: string,
  options?: SaveGameOptions,
): Promise<SavedGame | null> {
  if (!isSignedIn(userId)) return null;

  const newGame: NewGame = {
    game_type: 'go',
    player_color: playerColor,
    opponent: 'bot',
    result,
    difficulty,
    user_id: userId,
    mode: options?.mode ?? 'casual',
    rating_before: options?.rating_before,
    rating_after: options?.rating_after,
    /*
     * The ruleset, which the move list cannot carry: `q16` is not a point on a
     * 9x9 board, so a 13x13 or 19x19 game replayed under the defaults truncates
     * at the first move played outside the corner — and a shorter timeline looks
     * exactly like a shorter game.
     *
     * Written unconditionally. If `supabase-add-go-rules.sql` has not been run
     * these three columns do not exist and PostgREST rejects the insert, so
     * they are stripped and retried once below rather than losing the game.
     */
    board_size: gameState.size,
    komi: gameState.komi,
    scoring: gameState.scoring,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    moves: gameState.moveHistory.map(m => ({
      position: m.position,
      color:    m.color,
      captures: m.captures,
    })) as any,
  };

  let { data, error } = await supabase
    .from('games')
    .insert(newGame)
    .select()
    .single();

  /*
   * The ruleset columns are new, and `supabase-add-go-rules.sql` is run by hand.
   * On a database where it has not been run, PostgREST rejects the insert with
   * PGRST204 ("column not found in the schema cache") — which would mean adding
   * this feature *broke saving Go games entirely*, a strictly worse outcome than
   * not storing the ruleset.
   *
   * So a schema-cache failure retries once without them. The game is saved and
   * reviews as a 9x9 / 7.5 / area game, exactly as it would have before; running
   * the migration is what makes a 13x13 game come back as one.
   */
  if (error?.code === 'PGRST204') {
    const { board_size, komi, scoring, ...withoutRules } = newGame;
    void board_size; void komi; void scoring;
    console.warn(
      'games.board_size/komi/scoring missing — saving without the Go ruleset. ' +
      'Run project-docs/sql-queries/supabase-add-go-rules.sql to store it.',
    );
    ({ data, error } = await supabase
      .from('games')
      .insert(withoutRules)
      .select()
      .single());
  }

  if (error) {
    console.error('Failed to save go game:', error);
    return null;
  }

  pruneOldGames(userId, 'go');
  return data as SavedGame;
}

export async function getGameById(id: string): Promise<SavedGame | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to fetch game:', error);
    return null;
  }

  return data as SavedGame;
}