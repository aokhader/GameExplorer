// Every adapter in the registry against the shared conformance suite.
import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../adapters';
import { conformanceChecks, type ConformanceFixture } from '../adapters/conformance';
import { ONLINE_GAME_TYPES } from '../schemas';
import type { GameType } from '../sharedTypes';
import { CHECKERS_FIXTURE, CHESS_FIXTURE, REVERSI_FIXTURE } from './fixtures/games';

const FIXTURES: Record<GameType, ConformanceFixture> = {
  chess:    CHESS_FIXTURE,
  checkers: CHECKERS_FIXTURE,
  reversi:  REVERSI_FIXTURE,
};

describe('the registry', () => {
  it('has an online adapter for every online game type, under its own name', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...ONLINE_GAME_TYPES].sort());
    for (const type of ONLINE_GAME_TYPES) {
      expect(ADAPTERS[type].gameType).toBe(type);
      expect(ADAPTERS[type].online).toBe(true);
    }
  });
});

describe.each(ONLINE_GAME_TYPES)('%s adapter conformance', (type) => {
  it.each(conformanceChecks(ADAPTERS[type], FIXTURES[type]))('$name', (check) => {
    check.run();
  });
});
