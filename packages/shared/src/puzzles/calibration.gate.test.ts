/**
 * The calibration gate — does the shipped rating map still mean anything?
 *
 * `calibration.test.ts` proves the maths. This proves the *artifact*: that the
 * numbers `scripts/puzzles/calibrate.mjs` actually wrote are monotone, carry
 * their provenance, and still reproduce the ratings a human assigned by hand.
 *
 * Cheap on purpose. It reads the committed artifact and re-runs only the
 * tsumego solver over fourteen small problems; it never starts an engine
 * process or re-measures a solve curve. Expensive proof belongs in the scripts,
 * and this is the bridge that keeps "proved offline" honest.
 */

import { describe, expect, it } from 'vitest';

import {
  BOARD_RATING_SPREAD,
  BOARD_STRUCTURAL_FIT,
  BOARD_STRUCTURAL_MODELS,
  BOT_TO_HUMAN_KNOTS,
  CALIBRATION_ENGINE,
  CALIBRATION_FITTED_AT,
  CALIBRATION_SAMPLES,
  GO_STRUCTURAL_MODEL,
} from '../constants/puzzles/generated/calibration';
import { PUZZLE_BANDS } from './bands';
import { GO_PUZZLES } from '../constants/puzzles/go';
import { BOT_TIERS } from '../constants/botTiers';
import { goStructuralRating, humanRating } from './calibration';
import { goFeaturesFor } from './goRating';

/**
 * How far a fitted rating may sit from the one a human wrote down.
 *
 * 250 is a quarter of the way across a band, so a puzzle this far out is still
 * in the band the author put it in, or immediately next door. It is a check
 * that the model has not come loose — not a claim of precision, which a fit to
 * fourteen points could not support.
 */
const RATING_TOLERANCE = 250;

describe('the fitted bot→human map', () => {
  it('carries its provenance', () => {
    // A calibration you cannot date or attribute is a calibration you cannot
    // defend, and the engine identity is what makes a stale artifact visible
    // after a retune.
    expect(CALIBRATION_ENGINE).toMatch(/stockfish/i);
    expect(CALIBRATION_FITTED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(CALIBRATION_SAMPLES).toBeGreaterThan(50);
  });

  it('puts knots only at real tiers, or one virtual tier past either end', () => {
    // Knots sit at the six tier ELOs because those are the only bot ratings
    // that are directly observed. The two extra positions — one tier's width
    // below the weakest and above the strongest — are where puzzles the ladder
    // could not bracket are bucketed, and they exist so those puzzles do not
    // fold into the end knots and drag them toward ratings never measured.
    const tiers = BOT_TIERS.chess.map((t) => t.elo);
    const n = tiers.length;
    const allowed = [
      tiers[0] - (tiers[1] - tiers[0]),
      ...tiers,
      tiers[n - 1] + (tiers[n - 1] - tiers[n - 2]),
    ];
    expect(BOT_TO_HUMAN_KNOTS.length).toBeGreaterThan(1);
    for (const knot of BOT_TO_HUMAN_KNOTS) {
      expect(allowed, `knot at bot ${knot.bot} is not a tier or an end position`).toContain(
        knot.bot,
      );
      expect(knot.samples).toBeGreaterThan(0);
    }
  });

  it('is monotone — a harder puzzle never rates lower', () => {
    // The one property that cannot be traded away. A rating map that runs
    // backwards anywhere puts a harder puzzle in an easier band, which is worse
    // than having no map at all.
    const sorted = [...BOT_TO_HUMAN_KNOTS].sort((a, b) => a.bot - b.bot);
    for (let i = 1; i < sorted.length; i++) {
      expect(
        sorted[i].human,
        `bot ${sorted[i].bot} maps below bot ${sorted[i - 1].bot}`,
      ).toBeGreaterThanOrEqual(sorted[i - 1].human);
    }
  });

  it('stays monotone when applied, across every game', () => {
    const failures: string[] = [];
    for (const game of ['chess', 'checkers', 'reversi', 'go'] as const) {
      let previous = -Infinity;
      for (let bot = 400; bot <= 2800; bot += 25) {
        const value = humanRating(game, bot, BOT_TO_HUMAN_KNOTS);
        if (value < previous) failures.push(`${game}: bot ${bot} → ${value} after ${previous}`);
        previous = value;
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('the Go structural model', () => {
  it('gives every feature the sign difficulty actually has', () => {
    // A bigger eye space, a bigger search and more ways to go wrong are all
    // harder. A negative coefficient here would mean the model had fitted noise
    // — which is exactly what happened to the forced-line-length feature that
    // used to be in it, and why it is not any more.
    expect(GO_STRUCTURAL_MODEL.regionSize).toBeGreaterThan(0);
    expect(GO_STRUCTURAL_MODEL.logNodes).toBeGreaterThan(0);
    expect(GO_STRUCTURAL_MODEL.losingMoves).toBeGreaterThan(0);
  });

  it(`reproduces every hand-written Go rating within ${RATING_TOLERANCE}`, () => {
    // The check the whole structural approach rests on. Go cannot be
    // bot-calibrated — its MCTS bot solved 1 of these 14 at any tier — so this
    // is the only evidence that the numbers it assigns mean anything, and it
    // must be re-proved whenever the model or the solver changes.
    const failures: string[] = [];
    for (const puzzle of GO_PUZZLES) {
      const predicted = goStructuralRating(goFeaturesFor(puzzle), GO_STRUCTURAL_MODEL);
      const error = predicted - puzzle.rating;
      if (Math.abs(error) > RATING_TOLERANCE) {
        failures.push(
          `${puzzle.id}: hand-rated ${puzzle.rating}, model says ${predicted} (off by ${error})`,
        );
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });

  it('ranks the hand-rated problems in roughly the right order', () => {
    // Absolute error can be small while the ordering is wrong, and ordering is
    // what a band actually uses. Spearman's rho over fourteen points is blunt,
    // but it catches a model that has learned the average and nothing else.
    const rows = GO_PUZZLES.map((p) => ({
      hand: p.rating,
      model: goStructuralRating(goFeaturesFor(p), GO_STRUCTURAL_MODEL),
    }));
    const rank = (values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return values.map((v) => sorted.indexOf(v));
    };
    const a = rank(rows.map((r) => r.hand));
    const b = rank(rows.map((r) => r.model));
    const n = rows.length;
    const d2 = a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    expect(rho, `Spearman rho ${rho.toFixed(2)} — the model has lost the ordering`).toBeGreaterThan(
      0.7,
    );
  });
});

describe('the checkers and reversi structural models', () => {
  const GAMES = ['checkers', 'reversi'] as const;

  it.each(GAMES)('%s gives every feature the sign difficulty actually has', (game) => {
    // Every feature is defined so larger means harder: a deeper search to see
    // the key move, more bits of decision across the line, a longer line, a
    // busier board. A negative coefficient means the fit found noise — which is
    // exactly how the Go model's forced-line-length feature was caught, and how
    // an early version of this one was caught rating a busier board as easier.
    const model = BOARD_STRUCTURAL_MODELS[game];
    for (const key of ['searchDepth', 'decisionLoad', 'lineLength', 'complexity'] as const) {
      expect(model[key], `${game}.${key} is ${model[key]}`).toBeGreaterThan(0);
    }
  });

  it.each(GAMES)('%s still tracks the ladder it was fitted against', (game) => {
    // The guard against a refit that quietly stops meaning anything. Absolute
    // error is allowed to be large — these are ~200-point-error models over a
    // 2000-point scale — but the ORDERING is what a band consumes, and if that
    // decorrelates the ratings are decoration.
    const fit = BOARD_STRUCTURAL_FIT[game];
    expect(fit.n, `${game} was fitted on only ${fit.n} puzzles`).toBeGreaterThan(100);
    expect(fit.rho, `${game} Spearman ${fit.rho} against the bot ladder`).toBeGreaterThan(0.5);
  });

  it.each(GAMES)('%s spreads ratings monotonically, in both coordinates', (game) => {
    // The quantile map restores the range least squares shrinks away. It is only
    // a rescaling if it is strictly increasing: any inversion here would reorder
    // puzzles, which is the one thing a rating map may never do.
    const knots = BOARD_RATING_SPREAD[game];
    expect(knots.length).toBeGreaterThan(5);
    for (let i = 1; i < knots.length; i++) {
      expect(knots[i].from, `${game} knot ${i} prediction`).toBeGreaterThan(knots[i - 1].from);
      expect(knots[i].to, `${game} knot ${i} rating`).toBeGreaterThanOrEqual(knots[i - 1].to);
    }
  });

  it.each(GAMES)('%s can actually reach every band', (game) => {
    // The regression that would be least visible: a refit that compresses the
    // scale until the end bands are unreachable, which is precisely what the
    // quantile map exists to prevent and precisely what left these two games'
    // Beginner bands empty before it.
    const bands = PUZZLE_BANDS[game];
    const knots = BOARD_RATING_SPREAD[game];
    const lowest = knots[0].to;
    const highest = knots[knots.length - 1].to;
    expect(lowest, `${game} cannot rate anything into ${bands[0].label}`).toBeLessThan(bands[0].max);
    expect(
      highest,
      `${game} cannot rate anything into ${bands[bands.length - 1].label}`,
    ).toBeGreaterThanOrEqual(bands[bands.length - 1].min);
  });
});
