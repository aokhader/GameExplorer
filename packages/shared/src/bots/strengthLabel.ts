/**
 * What a bot of a given strength is called, anywhere it is named.
 *
 * **Why this is not beside the numbers it reads.** `constants/` is data only —
 * the subtree a database row deserializes into, that Metro parses raw on every
 * cold boot — and `constants/purity.test.ts` enforces it against the exported
 * values. So `constants/botTiers.ts` keeps the tiers and the bounds, and the
 * naming lives here: the same split `puzzles/` and `lessons/` already make
 * against their own `constants/` content, data on one side of the line and the
 * behaviour that reads it on the other.
 */

import { BOT_TIERS, type RatedGameId } from '../constants/botTiers';

/**
 * The descriptive ladder web shows for a *custom* strength, where no tier name
 * applies. Four identical copies of this lived in web game and training
 * screens; they are one list now, for the same reason the tiers are.
 *
 * It stays private to this module. It exists to answer `botStrengthLabel`, and
 * a surface that reads the table directly is a surface that has to remember
 * the preset rule below — which is exactly the bug that rule closes.
 */
interface LadderStep { below: number; label: string; }

/** Chess's ladder runs to 2800, so it can afford the finer titles. */
const CHESS_LADDER: readonly LadderStep[] = [
  { below: 600, label: 'Beginner' },
  { below: 800, label: 'Novice' },
  { below: 1000, label: 'Casual' },
  { below: 1200, label: 'Club Player' },
  { below: 1400, label: 'Intermediate' },
  { below: 1600, label: 'Competitive' },
  { below: 1800, label: 'Advanced' },
  { below: 2000, label: 'Expert' },
  { below: 2200, label: 'Candidate Master' },
  { below: 2400, label: 'FIDE Master' },
  { below: 2600, label: 'International Master' },
];

/** The other three stop at 2000, and their steps are correspondingly coarser. */
const BOARD_LADDER: readonly LadderStep[] = [
  { below: 700, label: 'Beginner' },
  { below: 900, label: 'Novice' },
  { below: 1100, label: 'Casual' },
  { below: 1300, label: 'Intermediate' },
  { below: 1500, label: 'Skilled' },
  { below: 1700, label: 'Advanced' },
  { below: 1900, label: 'Expert' },
];

/**
 * What to call a bot of this strength, anywhere it is named.
 *
 * A preset tier keeps the name the player picked it by: choosing "Club · 1200"
 * and then being told you are playing "Intermediate" reads as a different bot.
 * Every preset used to rename itself between the setup screen and the board,
 * because the ladder above was written for the custom slider — where its finer
 * steps are the point — and its bands start *above* each tier's number, so
 * 600 landed in Novice, 1200 in Intermediate and 2800 in Grandmaster.
 */
export function botStrengthLabel(game: RatedGameId, elo: number): string {
  const tier = BOT_TIERS[game].find((t) => t.elo === elo);
  if (tier) return tier.label;
  const ladder = game === 'chess' ? CHESS_LADDER : BOARD_LADDER;
  const top = game === 'chess' ? 'Grandmaster' : 'Master';
  return ladder.find((b) => elo < b.below)?.label ?? top;
}
