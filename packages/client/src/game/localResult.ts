/**
 * Writing a finished local game's result — the Practice level change and the
 * saved row.
 *
 * Lifted out of `useLocalGame`'s save effect so that a rated game resigned from
 * a Continue card, with no board on screen, is scored by the same arithmetic and
 * the same two writes as one resigned on the board. Two copies of this would be
 * two places for a hint penalty or a rating floor to drift.
 */

import { calculateNewRating, type GameOutcome } from '@gameexplorer/shared';
import { recordPracticeResult, type SaveGameOptions, type UserRating } from '@gameexplorer/db';
import { HINT_PENALTY } from '../hooks/trainingRules';
import type { Color, LocalGameAdapter } from '../hooks/useLocalGame';

export interface RatedResult {
  updated: UserRating;
  before: number;
  after: number;
  delta: number;
  hintsUsed: number;
}

interface ResultArgs<S> {
  adapter: Pick<LocalGameAdapter<S>, 'gameType' | 'save'>;
  state: S;
  playerColor: Color;
  result: Color | 'draw';
  /** The bot's strength, which is also the `elo-N` difficulty the row records. */
  botElo: number;
  userId: string;
}

/**
 * A rated result: the Practice level moves and the game row carries the before
 * and after. Rejects if either write fails, so the caller can offer a retry.
 *
 * `current` must be the player's Practice level (`getPracticeRating`), never
 * their online Rating — a local game has no witness, so it may only move the
 * number nothing else trusts (security audit v2, GX-04).
 *
 * Hints are only ever taken in training, and each one costs `HINT_PENALTY`
 * points off whatever the game was worth — the same price as web's training
 * pages. The floor keeps a hint-heavy loss from digging below 100.
 */
export async function writeRatedLocalResult<S>(
  args: ResultArgs<S> & { outcome: GameOutcome; current: UserRating; hintsUsed: number },
): Promise<RatedResult> {
  const { adapter, state, playerColor, result, botElo, userId, outcome, current, hintsUsed } = args;
  const earned = calculateNewRating(current.rating, botElo, outcome, current.games_played);
  const after = Math.max(100, earned - hintsUsed * HINT_PENALTY);
  const options: SaveGameOptions = { mode: 'rated', rating_before: current.rating, rating_after: after };
  const [updated] = await Promise.all([
    recordPracticeResult(after, outcome, adapter.gameType),
    adapter.save({ state, playerColor, result, difficulty: `elo-${botElo}`, userId, options }),
  ]);
  return { updated, before: current.rating, after, delta: after - current.rating, hintsUsed };
}

/**
 * A casual result: the row only, no rating. Best-effort by contract — a casual
 * game is the offline path, and must never surface a save error.
 */
export function writeCasualLocalResult<S>(args: ResultArgs<S>): void {
  const { adapter, state, playerColor, result, botElo, userId } = args;
  adapter
    .save({ state, playerColor, result, difficulty: `elo-${botElo}`, userId })
    .catch((err) => console.error('Failed to save casual game:', err));
}

/**
 * Keys whose result is being written right now.
 *
 * A game whose rated write failed at the end can be retried from its result card
 * *and* from a Continue card, and on native the launcher stays mounted under the
 * game screen. Two writes of one result would move the rating twice. Every
 * writer claims the snapshot's key first; the second one to arrive stands down.
 * Module state, because both writers run in one JavaScript runtime.
 */
const settling = new Set<string>();

export function claimResultWrite(key: string): boolean {
  if (settling.has(key)) return false;
  settling.add(key);
  return true;
}

export function releaseResultWrite(key: string): void {
  settling.delete(key);
}
