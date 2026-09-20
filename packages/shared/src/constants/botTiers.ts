/**
 * The six bot strength tiers each rated game offers, and the custom range
 * around them.
 *
 * **Why this is in `shared` and not beside `goSetup.ts` in `client`.** The
 * puzzle band model (`puzzles/bands.ts`) is built directly on these numbers —
 * a band exists so that picking "Club" in the puzzle picker means the same
 * strength as picking "Club" in the bot picker — and `shared` cannot import
 * `client`, which depends on it. Putting the numbers here is what lets both
 * read one copy instead of agreeing by hand.
 *
 * Six copies of these ladders existed before this module: three mobile setup
 * screens and three web game screens, with Go alone already hoisted into
 * `packages/client/src/game/goSetup.ts`. They had **already drifted** — web
 * labelled chess's fourth tier `'Inter.'` where mobile said `'Intermediate'` —
 * which is the drift this closes, and exactly the failure `goSetup.ts`'s own
 * header describes.
 *
 * **What deliberately stays per-platform:** the per-tier description and icon,
 * and web's separate fine-grained `eloLabel`/`eloDescription` ladders for the
 * custom picker. Those are presentation — a phone tile and a desktop row want
 * different lengths — and unifying them would be a visual change wearing a
 * refactor's clothes. Only the numbers and the canonical label live here,
 * because only those two can be *wrong* rather than merely different.
 *
 * Data only, per this directory's contract.
 */

/** Games with an ELO ladder. Liquidate is absent: its bots are categorical
 *  personalities (`cautious`/`steady`/`shrewd`/`ruthless`), not a rating. */
export type RatedGameId = 'chess' | 'checkers' | 'reversi' | 'go';

export interface BotTier {
  elo: number;
  /** The canonical label. A surface may abbreviate it, but not rename it. */
  label: string;
}

/**
 * Chess runs 600–2800 because it is backed by a real engine (Arasan on mobile,
 * Stockfish on web). The other three top out at 2000, which is where their
 * in-house minimax and MCTS searches stop gaining strength — see each game's
 * `ELO_BANDS`.
 */
export const BOT_TIERS: Record<RatedGameId, readonly BotTier[]> = {
  chess: [
    { elo: 600, label: 'Beginner' },
    { elo: 900, label: 'Novice' },
    { elo: 1200, label: 'Club' },
    { elo: 1500, label: 'Intermediate' },
    { elo: 2000, label: 'Advanced' },
    { elo: 2800, label: 'Master' },
  ],
  checkers: [
    { elo: 500, label: 'Beginner' },
    { elo: 800, label: 'Casual' },
    { elo: 1100, label: 'Club' },
    { elo: 1400, label: 'Strong' },
    { elo: 1700, label: 'Expert' },
    { elo: 2000, label: 'Master' },
  ],
  reversi: [
    { elo: 500, label: 'Beginner' },
    { elo: 800, label: 'Casual' },
    { elo: 1100, label: 'Club' },
    { elo: 1400, label: 'Strong' },
    { elo: 1700, label: 'Expert' },
    { elo: 2000, label: 'Master' },
  ],
  go: [
    { elo: 500, label: 'Beginner' },
    { elo: 800, label: 'Casual' },
    { elo: 1100, label: 'Club' },
    { elo: 1400, label: 'Strong' },
    { elo: 1700, label: 'Expert' },
    { elo: 2000, label: 'Master' },
  ],
};

/**
 * Bounds for a custom-strength bot, where a game offers one.
 *
 * Chess's floor is where the random-move weakening bottoms out (Arasan's
 * `UCI_Elo` floor is 1000, and the two tiers below it are weakened by
 * substituting random moves); the others' are the span their `ELO_BANDS`
 * tables actually interpolate over.
 */
export const BOT_ELO_BOUNDS: Record<RatedGameId, { min: number; max: number }> = {
  chess: { min: 400, max: 2800 },
  checkers: { min: 400, max: 2000 },
  reversi: { min: 400, max: 2000 },
  go: { min: 400, max: 2000 },
};

/**
 * The descriptive ladder web shows for a *custom* strength, where no tier name
 * applies. Four identical copies of this lived in web game and training
 * screens; they are one list now, for the same reason the tiers above are.
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
