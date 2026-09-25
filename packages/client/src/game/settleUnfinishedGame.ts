/**
 * Closing an unfinished game from outside its board — the Continue card's
 * *Discard*, and *Save result* for a game whose rated write failed at the end.
 *
 * The rule (`project-docs/ux-fix-ideas.md` §2.4, decided by the owner):
 *
 * | Game                                  | Discard                                   |
 * |---------------------------------------|-------------------------------------------|
 * | Casual bot game, pass-and-play, guest | Deletes the saved game. Nothing is written |
 * | Rated game                            | **Resigns it**: the loss and the Practice level change are written exactly as Resign writes them |
 *
 * "Exactly as Resign writes them" is literal: the result comes from
 * `localGameResult` and the writes from `writeRatedLocalResult`, the two
 * functions the loop's own save effect calls.
 */

import { getPracticeRating } from '@gameexplorer/db';
import type { LocalStore } from '../storage';
import {
  claimResultWrite,
  releaseResultWrite,
  writeRatedLocalResult,
  type RatedResult,
} from './localResult';
import { localRulesFor } from './localRules';
import {
  localGameResult,
  parseUnfinishedGame,
  replayActions,
  unfinishedGameKey,
  type UnfinishedGame,
} from './unfinishedGame';

export type SettleOutcome =
  /** The slot is gone and nothing was written: casual, guest or pass-and-play. */
  | { kind: 'deleted' }
  /** A rated result was written and the slot is gone. */
  | { kind: 'recorded'; rating: RatedResult }
  /** Someone else is writing this result right now; try again in a moment. */
  | { kind: 'busy' }
  /** The slot had already been cleared — by the game screen finishing the write, say. */
  | { kind: 'gone' };

/**
 * Discard (`resign: true`) or record (`resign: false`) a saved game.
 *
 * Rejects when a rated write fails, leaving the slot in place so the game is
 * still owed. Always re-reads the slot first: the card was drawn from an earlier
 * read, and in between the game may have been resumed, finished or replaced.
 */
export async function settleUnfinishedGame(
  store: LocalStore,
  saved: Pick<UnfinishedGame, 'game' | 'userId'>,
  { resign }: { resign: boolean },
): Promise<SettleOutcome> {
  const key = unfinishedGameKey(saved.game, saved.userId);
  if (!claimResultWrite(key)) return { kind: 'busy' };
  try {
    const current = parseUnfinishedGame(await store.get(key).catch(() => null), {
      game: saved.game,
      userId: saved.userId,
    });
    if (!current) return { kind: 'gone' };

    const userId = current.userId;
    if (!current.rated || !userId || current.mode === 'pass-and-play') {
      await store.remove(key).catch(() => {});
      return { kind: 'deleted' };
    }

    // A game that already ended keeps the ending it had; only a live one resigns.
    const end = current.end ?? (resign ? 'resign' : null);
    if (!end) throw new Error('This game has not finished, so there is no result to record');

    const rules = localRulesFor(current);
    const timeline = replayActions(rules, current.actions);
    if (!timeline) {
      // A snapshot these rules cannot replay describes no position anyone can
      // score. Keeping it would leave a card that can never be closed.
      console.error('Unfinished game could not be replayed; discarding it', current.game);
      await store.remove(key).catch(() => {});
      return { kind: 'deleted' };
    }
    const state = timeline[timeline.length - 1];
    const { result, outcome } = localGameResult({
      playerColor: current.playerColor,
      winner: rules.winner(state),
      end,
    });

    const rating = await writeRatedLocalResult({
      adapter: rules,
      state,
      playerColor: current.playerColor,
      result,
      outcome,
      botElo: current.botElo,
      userId,
      current: await getPracticeRating(userId, rules.gameType),
      hintsUsed: current.hintsUsed,
    });
    await store.remove(key).catch(() => {});
    return { kind: 'recorded', rating };
  } finally {
    releaseResultWrite(key);
  }
}
