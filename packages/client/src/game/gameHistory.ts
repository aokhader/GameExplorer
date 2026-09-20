/** The opponent values a saved row uses for "not a person". */
const BOT_OPPONENTS = new Set(['bot', 'stockfish']);

/**
 * What to call the opponent in a list of finished games.
 *
 * Chess wrote `opponent: 'stockfish'` where the other three wrote `'bot'`, so a
 * player's history read "Vs Stockfish" for the same thing every other game
 * called a bot. That is an engine's name, not an opponent's: it is the wrong
 * level of detail for a history row, it is stale on native (Arasan), and it
 * says nothing about the one thing that distinguishes one bot game from
 * another — how strong it was. Rows already written keep their value in the
 * database, so the legacy name is read here rather than migrated.
 *
 * The strength comes out of `difficulty`, which the save writes as a label like
 * `Elo-600`; anything without a number falls back to the bare word.
 */
export function opponentLabel(
  opponent: string | null | undefined,
  difficulty?: string | null,
): string {
  const name = (opponent ?? '').trim();
  if (!BOT_OPPONENTS.has(name.toLowerCase())) return name || 'Opponent';
  const elo = difficulty?.match(/\d{3,4}/)?.[0];
  return elo ? `Bot (${elo})` : 'Bot';
}
