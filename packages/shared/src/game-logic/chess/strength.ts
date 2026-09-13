/**
 * How a user-facing chess bot rating becomes an engine configuration.
 *
 * **The bug this module exists to prevent.** Mobile used to hand the tier's Elo
 * straight to Arasan as `UCI_Elo`. That is an engine scale, not a human one:
 * Arasan spreads `strength` 0–100 linearly across `UCI_Elo` 1000–3450, so our
 * "1500" asked for 20% of full engine strength. Measured, that bot searched two
 * plies and lost at least a piece on 16.5% of its moves. A player rated 1000
 * beat it and said, correctly, that it blundered like something far weaker.
 *
 * Everything below follows from three facts about the vendored engine, each
 * established by reading `cpp/arasan/search.cpp` and then confirmed by
 * measurement with `scripts/bots/blunders.mjs`.
 *
 * ### 1. Arasan has an unbounded-blunder mode, and it is gated on strength 50
 *
 * `SearchController::suboptimal` sometimes substitutes a worse root move. How
 * bad that move may be is normally capped by a `tolerance`, but the cap is
 * skipped whenever `r < 2*y`, and `y` is non-zero only while
 * `strength <= 50`. Above that the cap always applies, so a catastrophic move
 * becomes *structurally* unreachable rather than merely unlikely.
 *
 * The measured step across that boundary is stark:
 *
 * | `UCI_Elo` | strength | mean cp loss | loses >= a piece | loses >= a queen |
 * |---|---|---|---|---|
 * | 1200 | 8 | 356 | 36.5% | 15.4% |
 * | 1500 | 20 | 208 | 16.5% | 9.7% |
 * | 2200 | 48 | 88 | 4.7% | 2.7% |
 * | 2300 | 53 | 45 | 2.1% | 0.3% |
 *
 * Pinning every rung above that boundary was the first attempt, and it
 * over-corrected: with catastrophic moves impossible even a one-ply search
 * measures ~1741, so the lower rungs became inexpressible. The ladder instead
 * uses a *measured* floor, `ARASAN_LADDER_FLOOR_ELO`, where the queen-drop rate
 * has already collapsed.
 *
 * ### 2. `UCI_Elo` alone cannot set the rating either
 *
 * Its curve is too steep: measured over 40 games against Stockfish, `UCI_Elo`
 * 1500 plays ~1160 and `UCI_Elo` 2000 plays ~2070. And `STRENGTH_DEPTH_LIMITS`
 * is a staircase pinned at 9 plies for every strength from 45 to 64, so above
 * that band the option stops moving strength at all.
 *
 * So the two are fitted together: strength high enough that queen-drops are
 * rare, then `depth` trimmed to land on the target rating. Neither number is
 * derived from the other, and both are measured per rung.
 *
 * The strength cap still applies on top of a `go depth` request, so a tier can
 * only ask to search *shallower* than the cap, never deeper.
 *
 * ### 3. You cannot ask for a depth and a time limit in one command
 *
 * Arasan's `go` parser assigns one search type and the last limit on the line
 * wins: `go depth 4 movetime 4000` is a timed search that ignores the depth
 * entirely (measured: it ran to depth 9 and used the full budget). A wall-clock
 * ceiling on a depth-budgeted search has to be imposed by the caller sending
 * `stop`. `ceilingMs` below is that ceiling, and it is a safety net for a slow
 * device — never a strength lever, because tying strength to wall-clock time
 * means a slow phone gets a weaker bot than a fast one.
 */

import { BOT_ELO_BOUNDS, BOT_TIERS } from '../../constants/botTiers';
import { CHESS_BOT_LADDER } from '../../constants/chess/botLadder';

/** Arasan's own bounds, from `cpp/arasan/options.h` MIN_RATING / MAX_RATING. */
export const ARASAN_UCI_ELO_MIN = 1000;
export const ARASAN_UCI_ELO_MAX = 3450;

/**
 * The lowest `UCI_Elo` at which Arasan's blunder tolerance can no longer be
 * bypassed at all — `strength` 51, inverting `options.h`'s
 * `strength = 100*(elo-1000)/2450`.
 *
 * This is a structural fact about the engine, not the ladder's floor. Pinning
 * every rung here was the first attempt and it over-corrected: with catastrophic
 * moves impossible, even a one-ply search measured ~1741, so no rung below that
 * could be expressed at all.
 */
export const ARASAN_BOUNDED_ELO = 2250;

/**
 * The floor the ladder actually uses, chosen by measurement rather than by the
 * structural boundary above.
 *
 * Queen-losses per move, by strength:
 *
 * | `UCI_Elo` | strength | loses >= a queen |
 * |---|---|---|
 * | 1500 | 20 | 9.7% |
 * | 1700 | 28 | 6.7% |
 * | **2000** | **40** | **1.3%** |
 * | 2300 | 53 | 0.3% |
 *
 * The rate collapses between strength 28 and 40 — well below the structural
 * gate — so 2000 buys nearly all of the safety while leaving room to reach the
 * lower rungs. Below it the bypass rate climbs steeply and the bot starts
 * hanging queens, which is the specific complaint this module answers.
 */
export const ARASAN_LADDER_FLOOR_ELO = 2000;

/** Arasan's internal strength for a `UCI_Elo`, mirroring `options.h`. */
export function arasanStrength(uciElo: number): number {
  const clamped = Math.max(ARASAN_UCI_ELO_MIN, Math.min(ARASAN_UCI_ELO_MAX, uciElo));
  return Math.max(
    0,
    Math.min(
      100,
      Math.trunc(
        (100 * (clamped - ARASAN_UCI_ELO_MIN)) / (ARASAN_UCI_ELO_MAX - ARASAN_UCI_ELO_MIN),
      ),
    ),
  );
}

/**
 * What a bot of a given rating should run.
 *
 * `ts` is the in-house minimax in `weakEngine.ts`; `arasan` is the native
 * engine on mobile and Stockfish on web, both driven through the same numbers.
 */
export type ChessBotEngine = 'ts' | 'arasan';

export interface ChessBotConfig {
  engine: ChessBotEngine;
  /** Target Elo as shown to the player. */
  targetElo: number;
  /**
   * `UCI_Elo` to send **to Arasan**. Named for the engine on purpose: these
   * numbers are a remap measured against Arasan's own strength curve and mean
   * nothing to another engine. Stockfish, which web runs, has a different curve
   * — and is in fact the reference this ladder was anchored against — so it
   * keeps its own mapping rather than borrowing this one.
   */
  arasanUciElo?: number;
  /** Plies to search. Only meaningful when `engine` is `arasan`. */
  depth?: number;
  /**
   * Wall-clock ceiling in milliseconds, enforced by the caller sending `stop`.
   * A safety net for a slow device, not a strength lever.
   */
  ceilingMs?: number;
}

/**
 * The rating at or above which Arasan plays instead of the in-house engine.
 *
 * Measurement put this where `ENGINE_MIN_ELO` already had it, arriving from the
 * other direction. Arasan's floor with an acceptable error shape is ~1409 — that
 * is a *one-ply* search at the lowest strength whose queen-drop rate is tolerable,
 * and it cannot go lower without re-admitting the blunders. The in-house engine's
 * ceiling measured ~1415. The two meet at almost exactly 1400.
 *
 * A caveat that is real but did not move the seam: on mobile the in-house engine
 * runs on the JavaScript thread (web runs it in a worker), and its depth-4 band
 * costs ~530ms per move on a desktop and several times that on a handset. Ratings
 * from about 1280 to the seam are therefore expensive. Fixing that means moving it
 * off the thread, not moving the seam — putting the seam lower would hand those
 * ratings to an engine that measurably cannot play them.
 */
export const TS_ENGINE_CEILING = CHESS_BOT_LADDER.tsCeilingElo;

/**
 * Interpolate the measured ladder to any rating the custom picker allows.
 *
 * The ladder is measured at the six tiers; a player who dials 1650 gets the
 * configuration between the two tiers either side of it, rounding depth to a
 * whole ply. Monotonicity is guaranteed by the ladder being non-decreasing and
 * asserted by a test, so a higher number is never a weaker opponent.
 */
export function chessBotConfig(targetElo: number): ChessBotConfig {
  const elo = Math.max(
    BOT_ELO_BOUNDS.chess.min,
    Math.min(BOT_ELO_BOUNDS.chess.max, Math.round(targetElo)),
  );

  if (elo < TS_ENGINE_CEILING) {
    return { engine: 'ts', targetElo: elo };
  }

  const rungs = CHESS_BOT_LADDER.rungs;
  // Below the first rung the loop below finds no bracket and would extrapolate
  // backwards off the bottom of the ladder. The seam and the first rung are not
  // the same number, so this range is reachable.
  if (elo <= rungs[0].elo) {
    return {
      engine: 'arasan',
      targetElo: elo,
      arasanUciElo: rungs[0].uciElo,
      depth: rungs[0].depth,
      ceilingMs: CHESS_BOT_LADDER.ceilingMs,
    };
  }

  let lo = rungs[0];
  let hi = rungs[rungs.length - 1];
  for (let i = 0; i < rungs.length - 1; i++) {
    if (elo >= rungs[i].elo && elo <= rungs[i + 1].elo) {
      lo = rungs[i];
      hi = rungs[i + 1];
      break;
    }
  }

  const span = hi.elo - lo.elo;
  const t = span === 0 ? 0 : (elo - lo.elo) / span;
  const depth = Math.round(lo.depth + t * (hi.depth - lo.depth));
  const uciElo = Math.round(lo.uciElo + t * (hi.uciElo - lo.uciElo));

  return {
    engine: 'arasan',
    targetElo: elo,
    // Never below the measured floor, whatever the interpolation produced.
    arasanUciElo: Math.max(ARASAN_LADDER_FLOOR_ELO, Math.min(ARASAN_UCI_ELO_MAX, uciElo)),
    depth,
    ceilingMs: CHESS_BOT_LADDER.ceilingMs,
  };
}

/** The six ladder tiers, resolved. Handy for tests and for the calibration scripts. */
export function chessTierConfigs(): ChessBotConfig[] {
  return BOT_TIERS.chess.map((t) => chessBotConfig(t.elo));
}

/**
 * How long a training hint searches, in milliseconds, on both platforms.
 *
 * A hint is not a bot and never goes through the ladder. The training screens
 * promise the best move in the position and the player pays rating for it, so
 * the engine searches at full strength. The hints this replaced searched at the
 * player's rating plus 200, which below the seam meant the in-house engine and
 * its random moves.
 *
 * Budgeting by time is right here and wrong for bots. Nothing is matched to a
 * rating, so a slow device searching a little shallower costs accuracy the
 * player cannot see, rather than a rating the player was promised.
 */
export const CHESS_HINT_SEARCH_MS = 1000;
