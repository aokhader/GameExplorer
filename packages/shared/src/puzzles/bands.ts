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
 * Bands a particular check is not held to, with the reason, and nothing else.
 *
 * This was a list of three bands that could not be filled at all. All three are
 * off it, for two entirely different reasons that are worth keeping apart:
 * "the content does not exist" and "the ruler cannot reach" look identical from
 * here and call for opposite responses.
 *
 * **`checkers/beginner` and `reversi/beginner` were the ruler.** Difficulty was
 * measured by finding the bot tier that solves a puzzle half the time, and
 * `ELO_BANDS[0]` is a depth-1 search with heavy noise and a ~50% blunder rate.
 * Depth 1 is precisely a "find the best immediate move" machine, which is the
 * shape of the easiest puzzles, and the blunder component *succeeds by luck*
 * when the branching factor is small — which is why below-floor checkers
 * puzzles average 2.4 legal moves against 6.4 for the rest. Neither is a fact
 * about the puzzles. Measured, not assumed: the 48 below-floor chess puzzles
 * have Lichess ratings from 517 to 1478, and the ladder gives them all one
 * number. Routed through the chess-anchored map on top of that, the lowest
 * rating the pipeline could emit was about 790, so nothing could reach a band
 * ending at 650 however easy it was. A weaker tier is **not** the fix, tempting
 * as it sounds: below depth-1-with-blunders lies uniform random play, which
 * solves at one-over-the-branching-factor regardless of difficulty and so
 * discriminates nothing. Both games are rated structurally now
 * (`boardRating.ts`), on their own bot-ELO scale, and both fill every band.
 *
 * **`go/beginner` was the uniqueness bar**, and that bar was measuring the
 * wrong thing. Easy Go tactics are captures and small kills, and the format
 * always handled them — `solveTsumego` proves a corner capture in a handful of
 * nodes. What blocked them was the gate's demand that the answer be the ONLY
 * move that works. Over the composer's whole enumeration, *every* candidate
 * rating below 650 has more than one winning move: several answers is not
 * incidental to easy life-and-death, it is what makes it easy. `PuzzleStep.also`
 * carries the complete proved set instead, and the gate asserts set equality
 * against the solver rather than a singleton — a **stronger** obligation than
 * uniqueness, because the data must now be complete as well as correct. The
 * band holds 52 problems.
 *
 * What is genuinely still out of reach is the *spread* measurement there, and
 * only there. Go's Beginner band runs to 650 and the pipeline cannot emit below
 * 475: the smallest thing the composer builds is a three-point eye space in
 * which nothing loses. (Two points is not smaller, it is empty — a two-point
 * space cannot hold two eyes, so the group is already dead, passing wins, and
 * there is nothing to find.) Inside those 175 points the structural model has
 * exactly one cell. Region size is pinned at three, because four points rate
 * 636 before anything else is counted; losing moves are pinned at zero, because
 * one is worth 169 and lands past the top of the band. The only term left free
 * is the search, at 58 points per decade of nodes, and a three-point region
 * settles in 6 to 32 of them. That is 42 points, or 0.24 of the fillable width,
 * and the 52 problems occupy eleven distinct ratings across it.
 *
 * So the shortfall is the model's resolution rather than clustering, which is
 * the one thing the spread check cannot tell apart. `MIN_BAND_SPREAD` stays at
 * 0.3 — every other Go band now scores between 0.85 and 0.99, so lowering it to
 * accommodate this one would give up the check exactly where it works. The
 * count quota still applies here, and so does the bundled-core quota.
 *
 * `coverage.test.ts` asserts each entry is still *needed* for the check it
 * names, so an exemption that has quietly become unnecessary fails the build
 * and asks to be deleted — which is how the other two came off this list.
 */
export type BandCheck = 'count' | 'spread';

export const BAND_EXEMPTIONS: readonly {
  game: PuzzleGame;
  band: string;
  /** Exactly the checks this band is excused from. Never more than it needs. */
  checks: readonly BandCheck[];
  why: string;
}[] = [
  {
    game: 'go',
    band: 'beginner',
    checks: ['spread'],
    why:
      'the band is one cell of the structural model wide — region 3 with no losing move — ' +
      'so its whole reachable range is 42 points of search cost',
  },
];

export function isExempt(game: PuzzleGame, bandId: string, check: BandCheck): boolean {
  return BAND_EXEMPTIONS.some(
    (e) => e.game === game && e.band === bandId && e.checks.includes(check),
  );
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
