/**
 * Puzzle difficulty bands — the thing that makes "this puzzle set covers the
 * whole range" a claim you can check rather than a hope.
 *
 * **The product claim.** A band is named after a bot tier and spans the ratings
 * around it, so choosing "Club" in the puzzle picker offers the tactics a Club
 * bot finds — the same strength choosing "Club" in the bot picker plays. That
 * equivalence is the whole point of the mode: it is how a player finds out what
 * a rated game at their own rating actually looks like.
 *
 * Band edges are the **midpoints between adjacent tiers**, derived from
 * `BOT_TIERS` rather than typed out, so a retuned ladder moves the bands with
 * it instead of leaving them describing a strength the app no longer offers.
 *
 * Lives in `puzzles/` rather than `constants/puzzles/` because it exports
 * functions; the tier numbers it reads are data and live in `constants/`.
 */

import { BOT_ELO_BOUNDS, BOT_TIERS, type RatedGameId } from '../constants/botTiers';
import type { PuzzleGame } from './types';

export interface PuzzleBand {
  /** Stable slug — it goes in a URL and in the saved progress record. */
  id: string;
  /** The word already on the bot-strength tile for this tier. */
  label: string;
  /** The bot tier this band is "what a game at this rating feels like" for. */
  tierElo: number;
  /** Half-open `[min, max)`. */
  min: number;
  max: number;
}

/**
 * The band a rating falls in, with the ends open.
 *
 * The first band starts at 0 and the last runs to `Infinity` — not to a round
 * number — because a rating arriving from outside (a Lichess import, a retuned
 * calibration) must always land somewhere. A band model with a hole in it fails
 * by silently dropping puzzles out of every query, which is the least visible
 * way this could break.
 */
function buildBands(game: RatedGameId): PuzzleBand[] {
  const tiers = BOT_TIERS[game];
  return tiers.map((tier, i) => ({
    id: tier.label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    label: tier.label,
    tierElo: tier.elo,
    min: i === 0 ? 0 : Math.round((tiers[i - 1].elo + tier.elo) / 2),
    max: i === tiers.length - 1 ? Infinity : Math.round((tier.elo + tiers[i + 1].elo) / 2),
  }));
}

export const PUZZLE_BANDS: Record<PuzzleGame, readonly PuzzleBand[]> = {
  chess: buildBands('chess'),
  checkers: buildBands('checkers'),
  reversi: buildBands('reversi'),
  go: buildBands('go'),
};

/** The band a rating belongs to. Total by construction — never null. */
export function bandFor(game: PuzzleGame, rating: number): PuzzleBand {
  const bands = PUZZLE_BANDS[game];
  return bands.find((b) => rating >= b.min && rating < b.max) ?? bands[bands.length - 1];
}

export function bandById(game: PuzzleGame, id: string): PuzzleBand | null {
  return PUZZLE_BANDS[game].find((b) => b.id === id) ?? null;
}

/**
 * The band closest to a player's own rating in this game — the default the
 * puzzle picker opens on, so the mode answers "what does *my* rating look
 * like" without being configured first.
 *
 * A guest has no rating; the caller passes null and gets the middle band, which
 * is a better first impression than either extreme.
 */
export function defaultBandFor(game: PuzzleGame, rating: number | null): PuzzleBand {
  const bands = PUZZLE_BANDS[game];
  if (rating === null) return bands[Math.floor(bands.length / 2) - 1];
  return bandFor(game, rating);
}

/**
 * Puzzles a band needs before it is shippable. Below this the build fails —
 * see `coverage.test.ts`.
 *
 * Not uniform, because the games are not: chess draws on an imported corpus of
 * millions and has no excuse, while a Go band is composed life-and-death and
 * the hardest one is genuinely hard to fill (bigger eye spaces run the
 * exhaustive solver into its node limit). Setting Go's quota where chess's is
 * would not produce more Go puzzles; it would produce a permanently red build,
 * which teaches everyone to ignore it.
 */
export const MIN_PUZZLES_PER_BAND: Record<PuzzleGame, number> = {
  chess: 60,
  checkers: 20,
  reversi: 20,
  go: 8,
};

/**
 * Bands that cannot be filled, with the reason, and nothing else.
 *
 * `go/beginner` is empty because of the **uniqueness requirement**, not because
 * easy Go problems do not exist. An earlier version of this comment claimed the
 * latter; that was wrong, and worth spelling out so nobody re-derives it.
 *
 * Beginner Go tactics are captures — snapback, throw-in, net, short capture
 * races — and the format handles them fine: `solveTsumego` proves a corner
 * capture in **2 nodes**, and the structural model rates a two-point region at
 * about 500, squarely inside this band. `PUZZLE_THEMES` has carried `snapback`,
 * `net`, `throw-in` and `capture-race` since the mode shipped.
 *
 * What blocks them is the gate's demand that the answer be **the only** move
 * that works. Composing enclosed small groups and asking the solver about them
 * gives 970 positions the attacker can certainly kill — and every one is
 * rejected for having more than one winning order. That is the nature of an
 * easy position: several moves work. The uniqueness bar is what makes hard
 * problems provable and easy ones inexpressible.
 *
 * **The unlock is `PuzzleStep.also`**, which the schema already declares
 * ("Equally-good alternatives at this ply. Declared for v2; unused in v1") and
 * the runtime does not yet read — `applyPlayerMove` compares against
 * `step.move` alone. Accepting a set rather than a string would make "capture
 * these stones, either order" a puzzle this mode can hold, and it is the right
 * next step for this band. More mining will not do it.
 *
 * `checkers/beginner` and `reversi/beginner` **were** exempt here and are not
 * any more. The reason they were empty was never the content: it was the
 * instrument. Difficulty was measured by finding the bot tier that solves a
 * puzzle half the time, and `ELO_BANDS[0]` is a depth-1 search with heavy noise
 * and a ~50% blunder rate — both a one-move-puzzle solver and *lucky* when the
 * branching factor is small, which is why below-floor checkers puzzles average
 * 2.4 legal moves against 6.4 for the rest. Routed through the chess-anchored
 * map on top of that, the lowest rating the pipeline could emit was ~790, so no
 * puzzle could reach a band ending at 650 however easy it was.
 *
 * Both are now rated structurally (`boardRating.ts`) on their own bot-ELO
 * scale, which is the frame the bands were already defined in, and both fill
 * every band. Kept in this comment because "the ruler could not reach" is a
 * failure that looks exactly like "the content does not exist", and the two
 * call for opposite responses.
 *
 * Difficulty there is the bot tier that solves a puzzle half the time, and the
 * weakest tier is `ELO_BANDS[0]` — a **depth-1 search** with noise and a ~50%
 * blunder rate. Depth 1 is precisely a "find the best immediate move" machine,
 * and the miner's easiest product is a one-move `best-move` puzzle. The bottom
 * tier is weak at *playing* and near-expert at exactly the shape being rated,
 * so easy puzzles pile against the bottom of its range: calibrated through the
 * chess anchor, the lowest rating the method can emit is about 790.
 *
 * Measured, not assumed — the 48 below-floor chess puzzles have Lichess ratings
 * from 517 to 1478, and the ladder gives them all one number.
 *
 * A weaker tier is **not** the obvious fix, tempting as it sounds: below
 * depth-1-with-blunders lies uniform random play, which solves at one-over-the-
 * branching-factor regardless of difficulty and so discriminates nothing. The
 * room between them is very small. The fix that would work is the one Go
 * already uses — rate easy puzzles structurally (how many legal moves are
 * non-losing, how short the line) instead of by bot-solve.
 *
 * This is written down rather than solved by lowering `MIN_PUZZLES_PER_BAND`,
 * for two reasons. Lowering the quota would hide the gap in a number nobody
 * reads, and it would lower it for the five bands that *are* filled. And a
 * permanently red build is worse than either: `MIN_PUZZLES_PER_BAND`'s own
 * comment says so, because a test everyone has learned to ignore protects
 * nothing.
 *
 * `coverage.test.ts` asserts each entry here is still *needed* — so if a way is
 * ever found to compose a genuinely beginner-level Go problem, the build says
 * to delete the exemption rather than silently keeping it.
 */
export const UNFILLABLE_BANDS: readonly { game: PuzzleGame; band: string; why: string }[] = [
  {
    game: 'go',
    band: 'beginner',
    why: 'easy Go tactics have several winning moves, and the gate demands exactly one — needs PuzzleStep.also',
  },
];

export function isUnfillable(game: PuzzleGame, bandId: string): boolean {
  return UNFILLABLE_BANDS.some((u) => u.game === game && u.band === bandId);
}

/**
 * Puzzles per band that must ship **inside the app bundle**, so every band
 * still works with no network. The rest of the corpus is fetched.
 */
export const MIN_CORE_PUZZLES_PER_BAND = 5;

/**
 * How much of a band's width its puzzles' ratings must span, as a fraction.
 *
 * Sixty chess puzzles all sitting at 1050 satisfy a count check and do not make
 * the Club band real. Clustering at a band edge is how reservoir sampling
 * actually fails, so the spread is checked separately from the count.
 *
 * Per game, for the same reason `MIN_PUZZLES_PER_BAND` is: a spread requirement
 * is really a demand for rating *resolution*, and the three rating methods do
 * not have the same resolution. Chess, checkers and reversi are rated on a
 * continuous solve-rate crossing, so 60% is a fair ask. Go is rated
 * structurally from three small integers, and its dominant term — one more way
 * to go wrong — is worth about 170 points. Inside a 300-point band that allows
 * roughly two distinct levels, so 60% is asking the model for a precision it
 * does not have and never claimed: the shipped Casual problems occupy seven
 * distinct ratings spanning 44 points. Lowering the number for every game to
 * accommodate one would give up the check where it works.
 */
export const MIN_BAND_SPREAD: Record<PuzzleGame, number> = {
  chess: 0.6,
  checkers: 0.6,
  reversi: 0.6,
  go: 0.3,
};

/**
 * The rating range a band can actually be filled across.
 *
 * The first band nominally starts at 0 and the last runs to infinity, because
 * `bandFor` must be total — every rating has to land somewhere. But no rating
 * below the game's own ELO floor will ever exist (`BOT_ELO_BOUNDS`, and the
 * importer rejects them), so measuring a band's spread against its nominal
 * width asks the bottom band to cover ground nothing can stand on.
 *
 * This is a correction to the measurement, not a relaxation of it: the shipped
 * chess corpus spans 446–749 in the Beginner band, which is 40% of the nominal
 * 750 and **87%** of the 350 points that are reachable. The first number says
 * the band is half empty; the second says it is as full as it can be. The
 * second is the true one.
 *
 * The open top end is clamped to the highest rating present for the same
 * reason — "to infinity" is not a width.
 *
 * `ratingFloor` overrides the ELO floor for a game whose ratings come from
 * somewhere with a *higher* floor than the ladder's nominal minimum. Checkers
 * and reversi are rated by transferring the chess calibration, which cannot
 * emit anything below about 790 — so measuring their Casual band against 650
 * asks it to cover 140 points that no puzzle in that game can ever occupy, and
 * reports a band as clustered when it is as spread as the method allows. Same
 * correction as the ELO floor, one level further up the pipeline.
 */
export function bandSpan(
  game: PuzzleGame,
  band: PuzzleBand,
  highestPresent: number,
  ratingFloor?: number,
): { min: number; max: number } {
  const floor = ratingFloor ?? BOT_ELO_BOUNDS[game as RatedGameId].min;
  return {
    min: Math.max(band.min, floor),
    max: band.max === Infinity ? Math.max(highestPresent, band.min + 1) : band.max,
  };
}
