import { describe, expect, it } from 'vitest';
import { BOT_TIERS } from '../constants/botTiers';
import {
  PUZZLE_BANDS,
  bandById,
  bandFor,
  defaultBandFor,
  type PuzzleBand,
} from './bands';
import type { PuzzleGame } from './types';

const GAMES: PuzzleGame[] = ['chess', 'checkers', 'reversi', 'go'];

describe('band model', () => {
  it.each(GAMES)('%s has one band per bot tier, named after it', (game) => {
    const bands = PUZZLE_BANDS[game];
    const tiers = BOT_TIERS[game];
    expect(bands).toHaveLength(tiers.length);
    expect(bands.map((b) => b.label)).toEqual(tiers.map((t) => t.label));
    expect(bands.map((b) => b.tierElo)).toEqual(tiers.map((t) => t.elo));
  });

  it.each(GAMES)('%s bands tile the whole line with no hole and no overlap', (game) => {
    const bands = PUZZLE_BANDS[game];
    expect(bands[0].min).toBe(0);
    expect(bands[bands.length - 1].max).toBe(Infinity);
    for (let i = 1; i < bands.length; i++) {
      // Half-open [min, max): one band's max IS the next one's min.
      expect(bands[i].min).toBe(bands[i - 1].max);
    }
  });

  it.each(GAMES)('%s band ids are unique and url-safe', (game) => {
    const ids = PUZZLE_BANDS[game].map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(GAMES)('%s puts every tier ELO inside its own band', (game) => {
    // The band exists to mean "as hard as this bot". If a tier's own rating fell
    // in a neighbouring band, the label would be a lie.
    for (const band of PUZZLE_BANDS[game]) {
      expect(bandFor(game, band.tierElo).id).toBe(band.id);
    }
  });
});

describe('bandFor', () => {
  it('is total — every rating lands somewhere, including absurd ones', () => {
    for (const game of GAMES) {
      for (const rating of [-500, 0, 1, 999, 2799, 5000, 99999]) {
        expect(bandFor(game, rating)).toBeDefined();
      }
    }
  });

  it('puts a rating above the top tier in the top band, not out of range', () => {
    // A Lichess import or a retuned calibration can hand us 2900.
    const top = PUZZLE_BANDS.chess[PUZZLE_BANDS.chess.length - 1];
    expect(bandFor('chess', 9999).id).toBe(top.id);
  });

  it('puts a rating below the bottom tier in the bottom band', () => {
    expect(bandFor('chess', 0).id).toBe(PUZZLE_BANDS.chess[0].id);
  });

  it('places ratings on the shipped chess ladder where a player would expect', () => {
    // Tier midpoints are 750 / 1050 / 1350 / 1750 / 2400.
    expect(bandFor('chess', 700).label).toBe('Beginner');
    expect(bandFor('chess', 800).label).toBe('Novice');
    expect(bandFor('chess', 1200).label).toBe('Club');
    expect(bandFor('chess', 1500).label).toBe('Intermediate');
    expect(bandFor('chess', 2000).label).toBe('Advanced');
    expect(bandFor('chess', 2500).label).toBe('Master');
  });

  it('agrees with bandById for every band', () => {
    for (const game of GAMES) {
      for (const band of PUZZLE_BANDS[game]) {
        expect(bandById(game, band.id)).toEqual<PuzzleBand>(band);
      }
    }
  });

  it('returns null for an unknown band id rather than guessing', () => {
    expect(bandById('chess', 'nonsense')).toBeNull();
  });
});

describe('defaultBandFor', () => {
  it('follows the player’s own rating when they have one', () => {
    expect(defaultBandFor('chess', 1210).label).toBe('Club');
    expect(defaultBandFor('go', 1650).label).toBe('Expert');
  });

  it('gives a guest a middle band rather than either extreme', () => {
    for (const game of GAMES) {
      const band = defaultBandFor(game, null);
      const bands = PUZZLE_BANDS[game];
      expect(band.id).not.toBe(bands[0].id);
      expect(band.id).not.toBe(bands[bands.length - 1].id);
    }
  });
});
