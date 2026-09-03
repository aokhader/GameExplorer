import { renderHook } from '@testing-library/react-native';
import { DIFFICULTY_ELO } from '@finesse/shared';
import { useSetupDeepLink } from '@/game/useSetupDeepLink';

let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

/**
 * The welcome tour used to collect a difficulty and then route with only the
 * game name, so every first game started the default bot no matter which card
 * the player picked. This is the piece that carries the choice through.
 */
const CHESS_TIERS = [600, 900, 1200, 1500, 2000, 2800];

function probe(tiers: readonly number[]) {
  return renderHook(() => useSetupDeepLink(tiers)).result.current;
}

afterEach(() => {
  mockParams = {};
});

describe('useSetupDeepLink', () => {
  it('returns nothing when the screen was opened directly', () => {
    expect(probe(CHESS_TIERS)).toEqual({
      elo: null,
      autoStart: false,
      online: false,
      inviteId: null,
    });
  });

  it('snaps a requested strength to the nearest tier', () => {
    mockParams = { elo: '1250' };
    expect(probe(CHESS_TIERS).elo).toBe(1200);
  });

  it('auto-starts only on start=1', () => {
    mockParams = { elo: '600', start: '1' };
    expect(probe(CHESS_TIERS).autoStart).toBe(true);
    mockParams = { elo: '600' };
    expect(probe(CHESS_TIERS).autoStart).toBe(false);
  });

  it('ignores junk rather than starting a 0-elo bot', () => {
    for (const elo of ['', 'abc', '0', '-500']) {
      mockParams = { elo };
      expect(probe(CHESS_TIERS).elo).toBeNull();
    }
  });

  /**
   * An invite link carries no `online` flag of its own — `+native-intent` adds
   * one, but a link typed by hand or an older build's link would not. There is
   * nothing else an invite id could mean, so it implies the mode.
   */
  it('treats an invite id as a request for online play', () => {
    mockParams = { invite: 'abc123' };
    expect(probe(CHESS_TIERS)).toMatchObject({ online: true, inviteId: 'abc123' });

    mockParams = { online: '1' };
    expect(probe(CHESS_TIERS)).toMatchObject({ online: true, inviteId: null });
  });

  it('ignores a blank invite rather than trying to redeem it', () => {
    for (const invite of ['', '   ']) {
      mockParams = { invite };
      expect(probe(CHESS_TIERS)).toMatchObject({ online: false, inviteId: null });
    }
  });

  /**
   * The tour's ladder and the screens' tiers are maintained separately, so this
   * asserts they actually meet: every vibe must land on a real tier exactly,
   * not merely near one.
   */
  it('every tour difficulty maps onto a real chess tier', () => {
    for (const vibe of ['relaxed', 'balanced', 'sharp'] as const) {
      const wanted = DIFFICULTY_ELO.chess[vibe];
      mockParams = { elo: String(wanted) };
      expect(probe(CHESS_TIERS).elo).toBe(wanted);
    }
  });

  it('every tour difficulty maps onto a real checkers/reversi tier', () => {
    const tiers = [500, 800, 1100, 1400, 1700, 2000];
    for (const game of ['checkers', 'reversi'] as const) {
      for (const vibe of ['relaxed', 'balanced', 'sharp'] as const) {
        const wanted = DIFFICULTY_ELO[game][vibe];
        mockParams = { elo: String(wanted) };
        expect(probe(tiers).elo).toBe(wanted);
      }
    }
  });
});
