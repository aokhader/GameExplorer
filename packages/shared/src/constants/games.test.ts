import { describe, expect, it } from 'vitest';
import { GAME_CATALOG, GAME_LIST, TOUR_GAMES, gameNameList, isMultiSeat, type GameId } from './games';
import { DIFFICULTY_ELO } from './onboarding';

/**
 * The catalog is data that four surfaces per platform now render directly — web's
 * home and nav and welcome tour, mobile's home and welcome tour. That is the
 * point of it (a mode landing on one platform and not the other becomes a data
 * diff rather than an archaeology exercise), but it also means a typo here is a
 * typo on eight screens. These pin the invariants the surfaces rely on.
 */
describe('game catalog', () => {
  it('lists every catalogued game exactly once, keyed by its own id', () => {
    const ids = GAME_LIST.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(Object.keys(GAME_CATALOG)));
    for (const [key, entry] of Object.entries(GAME_CATALOG)) {
      expect(entry.id).toBe(key);
    }
  });

  it('gives every game all three copy registers, and keeps them distinct', () => {
    for (const g of GAME_LIST) {
      expect(g.blurb.length).toBeGreaterThan(0);
      expect(g.hook.length).toBeGreaterThan(0);
      expect(g.tagline.length).toBeGreaterThan(0);
      // The registers exist because the surfaces have different room. Two of
      // them holding the same string means one surface has quietly adopted the
      // other's voice, which is the drift this file was written to stop.
      expect(new Set([g.blurb, g.hook, g.tagline]).size).toBe(3);
      // A tagline is a row label, not a sentence.
      expect(g.tagline.length).toBeLessThan(24);
      expect(g.tagline).not.toMatch(/[.!?]$/);
    }
  });

  it('routes each game at its own slug', () => {
    for (const g of GAME_LIST) expect(g.slug).toBe(g.id);
  });

  /**
   * Parity phases 2 and 4 gave the three abstracts pass-and-play and online play
   * on both platforms. The catalog is only useful if it says so.
   */
  it('records the modes parity actually delivered', () => {
    for (const id of ['chess', 'checkers', 'reversi'] as const) {
      expect(GAME_CATALOG[id].modes).toEqual(
        expect.arrayContaining(['bot', 'training', 'online', 'local', 'learn', 'puzzles']),
      );
    }
    // Liquidate has no online mode by design: GameType excludes it, a session
    // seats exactly two, and `game_ended` carries two RatingInfo.
    expect(GAME_CATALOG.liquidate.modes).not.toContain('online');
    expect(GAME_CATALOG.liquidate.modes).not.toContain('training');
  });

  it('marks only the two-seat games rated, which is what the schema can store', () => {
    for (const g of GAME_LIST) {
      expect(g.rated).toBe(g.maxPlayers === 2);
    }
    expect(isMultiSeat('liquidate')).toBe(true);
    expect(isMultiSeat('chess')).toBe(false);
  });
});

describe('TOUR_GAMES', () => {
  /**
   * Both welcome tours index `DIFFICULTY_ELO` with these ids on their last step.
   * If an entry ever appeared here without a ladder, the tour would crash on the
   * one screen a brand-new visitor sees first.
   */
  it('only offers games whose difficulty ladder exists', () => {
    expect(TOUR_GAMES.length).toBeGreaterThan(0);
    for (const g of TOUR_GAMES) {
      expect(DIFFICULTY_ELO[g.id]).toBeDefined();
      expect(g.rated).toBe(true);
    }
  });

  it('leaves out the casual multi-seat game', () => {
    expect(TOUR_GAMES.map((g) => g.id as GameId)).not.toContain('liquidate');
  });

  it('keeps the catalog order', () => {
    const catalogOrder = GAME_LIST.map((g) => g.id).filter((id) =>
      TOUR_GAMES.some((t) => t.id === id),
    );
    expect(TOUR_GAMES.map((g) => g.id as GameId)).toEqual(catalogOrder);
  });
});


/**
 * The tours' opening sentence is built from this, after a hand-typed
 * "Chess, checkers & reversi" survived two new games on both platforms.
 */
describe('gameNameList', () => {
  it('names every game in the catalog', () => {
    const list = gameNameList();
    for (const g of GAME_LIST) expect(list).toContain(g.name);
  });

  it('reads as an English list in catalog order', () => {
    expect(gameNameList()).toBe('Chess, Checkers, Reversi, Go and Liquidate');
  });

  it('handles the degenerate lengths a growing catalog passes through', () => {
    const pick = (n: number) => GAME_LIST.slice(0, n);
    expect(gameNameList([])).toBe('');
    expect(gameNameList(pick(1))).toBe('Chess');
    expect(gameNameList(pick(2))).toBe('Chess and Checkers');
    expect(gameNameList(pick(3))).toBe('Chess, Checkers and Reversi');
  });
});