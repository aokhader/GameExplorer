import { describe, expect, it } from 'vitest';

import {
  botRatingFromCurve,
  fitCalibration,
  fitLeastSquares,
  goDesignRow,
  goModelFrom,
  goStructuralRating,
  humanRating,
  isotonic,
  PUZZLE_RATING_BOUNDS,
  type CalibrationKnot,
  type SolveCurvePoint,
} from './calibration';

const CHESS_TIERS = [600, 900, 1200, 1500, 2000, 2800];

function curve(...rates: number[]): SolveCurvePoint[] {
  return rates.map((rate, i) => ({ elo: CHESS_TIERS[i], rate }));
}

describe('isotonic', () => {
  it('leaves an already-increasing sequence alone', () => {
    expect(isotonic([0, 0.25, 0.5, 1])).toEqual([0, 0.25, 0.5, 1]);
  });

  it('pools a dip into the average of the block it violates', () => {
    // 0.8 then 0.4 must become 0.6 twice — the least-squares fix.
    expect(isotonic([0.2, 0.8, 0.4, 1])).toEqual([0.2, 0.6000000000000001, 0.6000000000000001, 1]);
  });

  it('collapses a strictly decreasing sequence to its mean', () => {
    expect(isotonic([1, 0.5, 0])).toEqual([0.5, 0.5, 0.5]);
  });

  it('never invents a crossing in flat data', () => {
    // The Go outcome: nothing solves anything. Smoothing must not manufacture
    // a rise out of noise that is not there.
    expect(isotonic([0, 0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('handles the empty case', () => {
    expect(isotonic([])).toEqual([]);
  });
});

describe('botRatingFromCurve', () => {
  it('interpolates the crossing between the two straddling tiers', () => {
    // Crosses halfway between 1200 (0.25) and 1500 (0.75) → 1350.
    const r = botRatingFromCurve(curve(0, 0, 0.25, 0.75, 1, 1));
    expect(r.rating).toBe(1350);
    expect(r.belowFloor).toBe(false);
    expect(r.aboveCeiling).toBe(false);
  });

  it('lands exactly on a tier when that tier is exactly even', () => {
    expect(botRatingFromCurve(curve(0, 0, 0.5, 1, 1, 1)).rating).toBe(1200);
  });

  it('flags a puzzle the weakest tier already solves, and still resolves it', () => {
    // 0.9 is four fifths of the way from "even" to "always", so it sits four
    // fifths of a tier below the floor: 600 - 0.8 * 300 = 360.
    const r = botRatingFromCurve(curve(0.9, 1, 1, 1, 1, 1));
    expect(r.belowFloor).toBe(true);
    expect(r.rating).toBe(360);
  });

  it('orders two below-floor puzzles by how easily the weakest tier solves them', () => {
    // The property the extrapolation exists for. Pinning both to the floor gave
    // 48 chess puzzles rated 517 to 1478 by Lichess one identical rating, and
    // left every band below the floor permanently empty.
    const easier = botRatingFromCurve(curve(1, 1, 1, 1, 1, 1));
    const harder = botRatingFromCurve(curve(0.6, 1, 1, 1, 1, 1));
    expect(easier.rating).toBeLessThan(harder.rating);
    expect(easier.rating).toBe(300);
    expect(harder.belowFloor).toBe(true);
  });

  it('flags a puzzle no tier ever solves, and extrapolates above the ladder', () => {
    // This is the Go result, and the reason the flag exists: a game whose every
    // puzzle comes back this way cannot be rated by this ladder at all.
    const r = botRatingFromCurve(curve(0, 0, 0, 0, 0, 0));
    expect(r.aboveCeiling).toBe(true);
    expect(r.rating).toBe(3600); // 2800 + the 800-point top gap
  });

  it('never rates a below-floor puzzle above an in-range one', () => {
    const below = botRatingFromCurve(curve(0.55, 1, 1, 1, 1, 1));
    const inRange = botRatingFromCurve(curve(0, 0.4, 0.6, 1, 1, 1));
    expect(below.rating).toBeLessThan(inRange.rating);
  });

  it('smooths a noisy curve before crossing it, not after', () => {
    // Raw data dips at 1500 and would cross 0.5 twice. After pooling, 1200 and
    // 1500 both read 0.5, so the FIRST crossing is what gets reported.
    const r = botRatingFromCurve(curve(0, 0.1, 0.6, 0.4, 0.9, 1));
    expect(r.smoothed.map((p) => p.rate)).toEqual([0, 0.1, 0.5, 0.5, 0.9, 1]);
    expect(r.rating).toBe(1200);
  });

  it('accepts tiers in any order', () => {
    const shuffled = [
      { elo: 2800, rate: 1 },
      { elo: 600, rate: 0 },
      { elo: 1200, rate: 0.5 },
    ];
    expect(botRatingFromCurve(shuffled).rating).toBe(1200);
  });

  it('throws on an empty curve rather than inventing a rating', () => {
    expect(() => botRatingFromCurve([])).toThrow(/empty curve/);
  });
});

describe('fitCalibration', () => {
  it('averages the human ratings bucketed to each tier', () => {
    const knots = fitCalibration(CHESS_TIERS, [
      { bot: 610, human: 800 },
      { bot: 590, human: 900 },
      { bot: 1210, human: 1500 },
    ]);
    expect(knots).toEqual([
      { bot: 600, human: 850, samples: 2 },
      { bot: 1200, human: 1500, samples: 1 },
    ]);
  });

  it('drops knots with no samples rather than inventing them', () => {
    const knots = fitCalibration(CHESS_TIERS, [{ bot: 1500, human: 1700 }]);
    expect(knots).toEqual([{ bot: 1500, human: 1700, samples: 1 }]);
  });

  it('forces the fitted map to be monotone', () => {
    // The 1200 bucket averages HIGHER than the 1500 one — a map built straight
    // from these means would rate a harder puzzle lower.
    const knots = fitCalibration(CHESS_TIERS, [
      { bot: 600, human: 700 },
      { bot: 1200, human: 1800 },
      { bot: 1500, human: 1400 },
    ]);
    expect(knots.map((k) => k.human)).toEqual([700, 1600, 1600]);
    const humans = knots.map((k) => k.human);
    expect([...humans].sort((a, b) => a - b)).toEqual(humans);
  });

  it('assigns each sample to its nearest tier, not the one below', () => {
    // 1450 is nearer 1500 than 1200.
    const knots = fitCalibration(CHESS_TIERS, [{ bot: 1450, human: 1600 }]);
    expect(knots[0].bot).toBe(1500);
  });

  it('returns nothing for no samples', () => {
    expect(fitCalibration(CHESS_TIERS, [])).toEqual([]);
  });
});

describe('humanRating', () => {
  const knots: CalibrationKnot[] = [
    { bot: 600, human: 800, samples: 10 },
    { bot: 1200, human: 1400, samples: 10 },
    { bot: 2000, human: 2000, samples: 10 },
  ];

  it('interpolates linearly between knots', () => {
    expect(humanRating('chess', 900, knots)).toBe(1100);
  });

  it('reproduces a knot exactly', () => {
    expect(humanRating('chess', 1200, knots)).toBe(1400);
  });

  it('extends the end slope rather than flattening, so ordering survives', () => {
    // Clamping to the top knot would map every harder puzzle to 2000 and
    // collapse the whole Master band onto one rating.
    const above = humanRating('chess', 2400, knots);
    expect(above).toBeGreaterThan(2000);
    expect(humanRating('chess', 2800, knots)).toBeGreaterThan(above);
  });

  it('clamps an extrapolation to the puzzle rating bounds, not the bot ones', () => {
    // Checkers offers bots up to 2000, but a PUZZLE may be harder than any bot
    // on offer — that is what the open-ended top band is for. The scale runs one
    // tier past the ladder; clamping at 2000 gave the whole Master band one
    // repeated rating and therefore no spread at all.
    expect(humanRating('checkers', 5000, knots)).toBe(2300);
    expect(humanRating('checkers', -500, knots)).toBe(400);
    expect(PUZZLE_RATING_BOUNDS.checkers).toEqual({ min: 400, max: 2300 });
    expect(PUZZLE_RATING_BOUNDS.chess).toEqual({ min: 400, max: 3600 });
  });

  it('is monotone across the whole range', () => {
    let prev = -Infinity;
    for (let bot = 400; bot <= 2800; bot += 25) {
      const v = humanRating('chess', bot, knots);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('falls back to the bot rating when there is no fit at all', () => {
    expect(humanRating('chess', 1234, [])).toBe(1234);
  });

  it('returns the single knot’s value when only one was fitted', () => {
    expect(humanRating('chess', 2500, [{ bot: 600, human: 900, samples: 3 }])).toBe(900);
  });
});

describe('goStructuralRating', () => {
  const model = {
    intercept: 400,
    regionSize: 40,
    logNodes: 50,
    losingMoves: 20,
  };

  it('rises with every feature', () => {
    const base = { regionSize: 4, logNodes: 5, losingMoves: 3 };
    const rating = goStructuralRating(base, model);
    for (const key of ['regionSize', 'logNodes', 'losingMoves'] as const) {
      expect(goStructuralRating({ ...base, [key]: base[key] + 1 }, model)).toBeGreaterThan(rating);
    }
  });

  it('stays inside Go’s bot bounds however extreme the shape', () => {
    expect(
      goStructuralRating({ regionSize: 99, logNodes: 99, losingMoves: 99 }, model),
    ).toBe(2300);
    expect(
      goStructuralRating(
        { regionSize: 0, logNodes: 0, losingMoves: 0 },
        { ...model, intercept: -5000 },
      ),
    ).toBe(400);
  });
});

describe('fitLeastSquares', () => {
  it('recovers an exact linear relationship', () => {
    // y = 3 + 2x, fitted with no ridge so the answer is exact.
    const design = [[1, 0], [1, 1], [1, 2], [1, 3]];
    const coef = fitLeastSquares(design, [3, 5, 7, 9], 0);
    expect(coef[0]).toBeCloseTo(3, 6);
    expect(coef[1]).toBeCloseTo(2, 6);
  });

  it('shrinks coefficients toward zero as lambda grows', () => {
    const design = [[1, 0], [1, 1], [1, 2], [1, 3]];
    const loose = fitLeastSquares(design, [3, 5, 7, 9], 0);
    const tight = fitLeastSquares(design, [3, 5, 7, 9], 100);
    expect(Math.abs(tight[1])).toBeLessThan(Math.abs(loose[1]));
  });

  it('stays finite when two columns are perfectly collinear', () => {
    // The exact failure the ridge exists for: an unregularised solve here has
    // no unique answer, and the Go model's region size and node count are very
    // nearly this correlated.
    const design = [[1, 1, 2], [1, 2, 4], [1, 3, 6], [1, 4, 8]];
    const coef = fitLeastSquares(design, [10, 20, 30, 40]);
    expect(coef.every(Number.isFinite)).toBe(true);
  });

  it('rejects mismatched inputs rather than fitting nonsense', () => {
    expect(() => fitLeastSquares([[1, 2]], [1, 2])).toThrow(/same non-zero length/);
    expect(() => fitLeastSquares([], [])).toThrow(/non-zero length/);
  });

  it('round-trips a model through goDesignRow and goModelFrom', () => {
    // Coefficients chosen to land well inside Go's 400-2000 bounds, so this
    // tests the dot product rather than the clamp (which has its own test).
    const coef = [800, 100, 50, 60];
    const features = { regionSize: 5, logNodes: 2, losingMoves: 4 };
    const row = goDesignRow(features);
    const dot = row.reduce((a, v, i) => a + v * coef[i], 0);
    expect(dot).toBe(1640);
    expect(goStructuralRating(features, goModelFrom(coef))).toBe(1640);
  });
});
