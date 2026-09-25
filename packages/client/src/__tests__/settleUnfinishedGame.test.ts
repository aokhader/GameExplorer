/**
 * Discarding an unfinished game from a Continue card.
 *
 * The owner's rule is the thing under test: a casual game is simply deleted, and
 * a rated one is **resigned** — the loss and the Practice level change written exactly as
 * the board's own Resign writes them — so walking away from a losing rated game
 * no longer dodges its result.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  // The online Rating's reader is mocked only so a test can prove it is never
  // touched: a local game has no witness, so it may only move the Practice
  // level (security audit v2, GX-04).
  getUserRating: vi.fn(),
  getPracticeRating: vi.fn(),
  recordPracticeResult: vi.fn(),
  saveGame: vi.fn(),
  saveCheckersGame: vi.fn(),
  saveReversiGame: vi.fn(),
  saveGoGame: vi.fn(),
}));
vi.mock('@gameexplorer/db', () => db);

import { calculateNewRating } from '@gameexplorer/shared';
import { claimResultWrite, releaseResultWrite } from '../game/localResult';
import { settleUnfinishedGame } from '../game/settleUnfinishedGame';
import {
  serializeUnfinishedGame,
  unfinishedGameKey,
  type UnfinishedGame,
} from '../game/unfinishedGame';
import type { LocalStore } from '../storage';

function memoryStore(): LocalStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

const rating = (value: number, games = 10) => ({
  user_id: 'u1',
  game_type: 'chess',
  rating: value,
  games_played: games,
  wins: 0,
  losses: 0,
  draws: 0,
  peak_rating: value,
  updated_at: '',
});

function saved(overrides: Partial<UnfinishedGame> = {}): UnfinishedGame {
  return {
    v: 1,
    game: 'chess',
    mode: 'bot',
    userId: 'u1',
    rated: true,
    playerColor: 'white',
    botElo: 1500,
    setup: {},
    actions: [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
    ],
    hintsUsed: 0,
    startedAt: 1,
    savedAt: 2,
    ...overrides,
  };
}

async function put(store: ReturnType<typeof memoryStore>, game: UnfinishedGame) {
  await store.set(unfinishedGameKey(game.game, game.userId), serializeUnfinishedGame(game));
}

beforeEach(() => {
  vi.clearAllMocks();
  db.getPracticeRating.mockResolvedValue(rating(1400));
  db.recordPracticeResult.mockImplementation(async (after) => rating(after));
  db.saveGame.mockResolvedValue(null);
});

describe('settleUnfinishedGame', () => {
  it('deletes a casual game and writes nothing', async () => {
    const store = memoryStore();
    await put(store, saved({ rated: false }));

    const outcome = await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true });

    expect(outcome).toEqual({ kind: 'deleted' });
    expect(store.data.size).toBe(0);
    expect(db.recordPracticeResult).not.toHaveBeenCalled();
    expect(db.saveGame).not.toHaveBeenCalled();
  });

  it("deletes a guest's game and writes nothing", async () => {
    const store = memoryStore();
    await put(store, saved({ userId: null, rated: false }));

    expect(await settleUnfinishedGame(store, { game: 'chess', userId: null }, { resign: true })).toEqual({
      kind: 'deleted',
    });
    expect(db.saveGame).not.toHaveBeenCalled();
  });

  it('resigns a rated game: a loss, scored against the bot it was playing', async () => {
    const store = memoryStore();
    await put(store, saved());

    const outcome = await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true });

    const after = calculateNewRating(1400, 1500, 'loss', 10);
    expect(outcome).toMatchObject({ kind: 'recorded', rating: { before: 1400, after, delta: after - 1400 } });
    expect(db.recordPracticeResult).toHaveBeenCalledWith(after, 'loss', 'chess');
    // Priced from the Practice level, and the online Rating is never read.
    expect(db.getPracticeRating).toHaveBeenCalledWith('u1', 'chess');
    expect(db.getUserRating).not.toHaveBeenCalled();
    expect(db.saveGame).toHaveBeenCalledWith(
      expect.objectContaining({ moveHistory: expect.any(Array) }),
      'white',
      'black',
      'elo-1500',
      'u1',
      { mode: 'rated', rating_before: 1400, rating_after: after },
    );
    expect(store.data.size).toBe(0);
  });

  it('charges the hints a training game already took', async () => {
    const store = memoryStore();
    await put(store, saved({ mode: 'training', hintsUsed: 3 }));

    const outcome = await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true });

    const after = calculateNewRating(1400, 1500, 'loss', 10) - 3 * 2;
    expect(outcome).toMatchObject({ kind: 'recorded', rating: { after, hintsUsed: 3 } });
  });

  it('records the ending a finished game had, rather than resigning it', async () => {
    const store = memoryStore();
    await put(store, saved({ end: 'draw' }));

    await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true });

    expect(db.recordPracticeResult).toHaveBeenCalledWith(expect.any(Number), 'draw', 'chess');
  });

  it('will not record a result for a game still in progress', async () => {
    const store = memoryStore();
    await put(store, saved());

    await expect(
      settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: false }),
    ).rejects.toThrow(/not finished/);
    expect(store.data.size).toBe(1);
  });

  it('keeps the game owed when the write fails, and can be tried again', async () => {
    const store = memoryStore();
    await put(store, saved());
    db.recordPracticeResult.mockRejectedValueOnce(new Error('offline'));

    await expect(
      settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true }),
    ).rejects.toThrow('offline');
    expect(store.data.size).toBe(1);

    await expect(
      settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true }),
    ).resolves.toMatchObject({ kind: 'recorded' });
    expect(store.data.size).toBe(0);
  });

  it('stands down while another writer holds the same result', async () => {
    const store = memoryStore();
    await put(store, saved());
    const key = unfinishedGameKey('chess', 'u1');
    expect(claimResultWrite(key)).toBe(true);

    try {
      expect(await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true })).toEqual({
        kind: 'busy',
      });
      expect(db.recordPracticeResult).not.toHaveBeenCalled();
    } finally {
      releaseResultWrite(key);
    }
  });

  it('does nothing when the slot has already gone', async () => {
    const store = memoryStore();
    expect(await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true })).toEqual({
      kind: 'gone',
    });
  });

  it('drops a rated game its rules can no longer replay, instead of leaving it stuck', async () => {
    const store = memoryStore();
    await put(store, saved({ actions: [{ from: 'e2', to: 'e5' }] }));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await settleUnfinishedGame(store, { game: 'chess', userId: 'u1' }, { resign: true })).toEqual({
      kind: 'deleted',
    });
    expect(db.recordPracticeResult).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});
