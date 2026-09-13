/**
 * Guards on the chess bot ladder.
 *
 * These are not tests of arithmetic. Each one pins a property whose violation
 * reproduces a defect that actually shipped: a "1500" bot that searched two
 * plies and lost a piece on one move in six, because the user-facing rating was
 * handed to Arasan as if `UCI_Elo` were a human scale.
 *
 * The numbers themselves are measured — see `scripts/bots/` and the header of
 * `../../constants/chess/botLadder.ts`. What is asserted here is the shape the
 * measurement has to keep.
 */

import { describe, expect, it } from 'vitest';

import { BOT_ELO_BOUNDS, BOT_TIERS } from '../../constants/botTiers';
import { CHESS_BOT_LADDER } from '../../constants/chess/botLadder';
import {
  ARASAN_BOUNDED_ELO,
  ARASAN_LADDER_FLOOR_ELO,
  ARASAN_UCI_ELO_MAX,
  arasanStrength,
  chessBotConfig,
  chessTierConfigs,
  TS_ENGINE_CEILING,
} from './strength';

describe('arasanStrength', () => {
  it('mirrors options.h: 100*(elo-1000)/2450, truncated', () => {
    expect(arasanStrength(1000)).toBe(0);
    expect(arasanStrength(3450)).toBe(100);
    // The three values that explain the original bug.
    expect(arasanStrength(1200)).toBe(8);
    expect(arasanStrength(1500)).toBe(20);
    expect(arasanStrength(2800)).toBe(73);
  });

  it('clamps outside Arasan own bounds rather than extrapolating', () => {
    expect(arasanStrength(400)).toBe(0);
    expect(arasanStrength(9000)).toBe(100);
  });
});

describe('the blunder gate', () => {
  /**
   * Arasan skips its own move-quality bound while `strength <= 50`. Strength 51
   * is the first value where the bound always applies, and every Arasan rung
   * has to sit at or above it. Lowering `ARASAN_BOUNDED_ELO` re-admits
   * unbounded blunders — measured at 9.7% of moves losing a queen outright.
   */
  it('ARASAN_BOUNDED_ELO is the lowest UCI_Elo reaching strength 51', () => {
    expect(arasanStrength(ARASAN_BOUNDED_ELO)).toBeGreaterThanOrEqual(51);
    expect(arasanStrength(ARASAN_BOUNDED_ELO - 1)).toBeLessThanOrEqual(50);
  });

  it('every ladder rung sits at or above the measured floor', () => {
    for (const rung of CHESS_BOT_LADDER.rungs) {
      expect(rung.uciElo).toBeGreaterThanOrEqual(ARASAN_LADDER_FLOOR_ELO);
      expect(rung.uciElo).toBeLessThanOrEqual(ARASAN_UCI_ELO_MAX);
    }
  });

  /**
   * The floor is where measured queen-losses collapse (9.7% at strength 20,
   * 6.7% at 28, 1.3% at 40). It sits below the structural boundary on purpose:
   * pinning every rung above that made even a one-ply search measure ~1741, so
   * the lower rungs could not be expressed at all.
   */
  it('the measured floor is below the structural boundary, and well above the bad region', () => {
    expect(ARASAN_LADDER_FLOOR_ELO).toBeLessThan(ARASAN_BOUNDED_ELO);
    expect(arasanStrength(ARASAN_LADDER_FLOOR_ELO)).toBeGreaterThanOrEqual(40);
  });

  it('every resolved config across the whole custom range stays at or above the floor', () => {
    for (let elo = BOT_ELO_BOUNDS.chess.min; elo <= BOT_ELO_BOUNDS.chess.max; elo += 25) {
      const config = chessBotConfig(elo);
      if (config.engine === 'arasan') {
        expect(config.arasanUciElo!).toBeGreaterThanOrEqual(ARASAN_LADDER_FLOOR_ELO);
      }
    }
  });
});

describe('the ladder is monotonic', () => {
  /**
   * Monotonicity holds on what was MEASURED, not on either dial. The top rung
   * searches shallower than the one below it (6 plies against 7) and is far
   * stronger anyway, because its strength is 73 against 40. Asserting on depth
   * alone would fail on a correct ladder.
   */
  it('rungs never step backwards in label or in measured strength', () => {
    const { rungs } = CHESS_BOT_LADDER;
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].elo).toBeGreaterThan(rungs[i - 1].elo);
      expect(rungs[i].measuredElo).toBeGreaterThan(rungs[i - 1].measuredElo);
    }
  });

  /** Each rung has to land near the number on the tile, or the label is a lie. */
  it('every rung measures within 150 of its label', () => {
    for (const rung of CHESS_BOT_LADDER.rungs) {
      expect(Math.abs(rung.measuredElo - rung.elo)).toBeLessThanOrEqual(150);
    }
  });

  /**
   * A player who dials a higher number must never get a weaker opponent. This
   * is the property the custom Elo picker depends on and the one interpolation
   * is most likely to break.
   */
  it('resolves a usable Arasan config at every rating above the seam', () => {
    for (let elo = TS_ENGINE_CEILING; elo <= BOT_ELO_BOUNDS.chess.max; elo += 25) {
      const config = chessBotConfig(elo);
      expect(config.engine).toBe('arasan');
      expect(config.depth).toBeGreaterThan(0);
      expect(config.arasanUciElo).toBeGreaterThanOrEqual(ARASAN_LADDER_FLOOR_ELO);
    }
  });
});

describe('engine selection', () => {
  it('hands the bottom of the range to the in-house engine', () => {
    expect(chessBotConfig(BOT_ELO_BOUNDS.chess.min).engine).toBe('ts');
    expect(chessBotConfig(TS_ENGINE_CEILING - 1).engine).toBe('ts');
    expect(chessBotConfig(TS_ENGINE_CEILING).engine).toBe('arasan');
  });

  /**
   * The seam is exclusive — everything strictly below it goes to the in-house
   * engine, which clamps internally to 1399. So the highest rating it can be
   * handed is `TS_ENGINE_CEILING - 1`, and that must be within its range or a
   * rating in between would silently get an engine that cannot represent it.
   */
  it('the highest rating routed to the in-house engine is within its range', () => {
    expect(TS_ENGINE_CEILING - 1).toBeLessThanOrEqual(1399);
    expect(TS_ENGINE_CEILING).toBeGreaterThan(BOT_ELO_BOUNDS.chess.min);
  });

  it('resolves a config for every tier the picker offers', () => {
    const configs = chessTierConfigs();
    expect(configs).toHaveLength(BOT_TIERS.chess.length);
    for (const config of configs) {
      if (config.engine === 'arasan') {
        expect(config.depth).toBeGreaterThan(0);
        expect(config.arasanUciElo).toBeGreaterThan(0);
      }
    }
  });

  it('clamps a rating outside the advertised bounds instead of extrapolating', () => {
    expect(chessBotConfig(-500).targetElo).toBe(BOT_ELO_BOUNDS.chess.min);
    expect(chessBotConfig(99_999).targetElo).toBe(BOT_ELO_BOUNDS.chess.max);
  });
});

describe('the wall clock is a safety net, not a dial', () => {
  /**
   * Strength must not depend on how fast the device is. The old ladder budgeted
   * with `movetime`, which made a slow handset face a weaker bot than a fast one
   * at the same advertised rating.
   */
  it('every Arasan config carries the same ceiling regardless of rating', () => {
    const ceilings = new Set(
      chessTierConfigs()
        .filter((c) => c.engine === 'arasan')
        .map((c) => c.ceilingMs),
    );
    expect(ceilings.size).toBe(1);
    expect([...ceilings][0]).toBe(CHESS_BOT_LADDER.ceilingMs);
  });
});
