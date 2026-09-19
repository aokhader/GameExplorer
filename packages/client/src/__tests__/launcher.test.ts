/**
 * The launcher's rules, shared by web and native Home: what counts as played,
 * what is offered again and with which setup, and which game is suggested.
 */
import { describe, expect, it } from 'vitest';
import {
  LAST_GAME_KEY,
  PLAYED_AT_KEY,
  STALE_MS,
  continueItemGame,
  parsePlayedAt,
  pickTryNew,
  readContinueItems,
  readLauncherHistory,
  readPlayAgain,
  recordFinished,
  recordPlayed,
} from '../game/launcher';
import { lastModeStorageKey, setupStorageKey } from '../game/localSetup';
import { serializeUnfinishedGame, unfinishedGameKey, type UnfinishedGame } from '../game/unfinishedGame';
import type { LiquidateSaveStore } from '../liquidate/saveStore';
import type { PlayerStats } from '../game/playerStats';
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

const noLiquidate: LiquidateSaveStore = { read: async () => null, write: () => {}, clear: () => {} };

const DAY = 24 * 60 * 60 * 1000;

describe('launcher — history', () => {
  it('drops unknown games and non-numbers from the start times', () => {
    expect(parsePlayedAt('{"chess":5,"poker":3,"go":"x"}')).toEqual({ chess: 5 });
    expect(parsePlayedAt('not json')).toEqual({});
    expect(parsePlayedAt('[1,2]')).toEqual({});
  });

  it('records a start, and lists that game first', async () => {
    const store = memoryStore();
    await recordPlayed(store, 'reversi', 100);
    await recordPlayed(store, 'go', 200);
    const history = await readLauncherHistory(store);
    expect(history.recent).toBe('go');
    expect(history.games.slice(0, 2)).toEqual(['go', 'reversi']);
    expect(history.games).toHaveLength(5);
    expect(store.data.get(LAST_GAME_KEY)).toBe('go');
  });

  it('falls back to the last game opened for a player from before start times', async () => {
    const store = memoryStore();
    await store.set(LAST_GAME_KEY, 'checkers');
    expect((await readLauncherHistory(store)).recent).toBe('checkers');
  });

  it('remembers that a game was finished', async () => {
    const store = memoryStore();
    expect((await readLauncherHistory(store)).finishedGame).toBe(false);
    await recordFinished(store);
    expect((await readLauncherHistory(store)).finishedGame).toBe(true);
  });

  it('survives a store that throws', async () => {
    const broken: LocalStore = {
      get: () => Promise.reject(new Error('blocked')),
      set: () => Promise.reject(new Error('full')),
      remove: () => Promise.reject(new Error('blocked')),
    };
    await expect(recordPlayed(broken, 'chess')).resolves.toBeUndefined();
    expect((await readLauncherHistory(broken)).recent).toBeNull();
  });
});

describe('launcher — play again', () => {
  it('starts a remembered bot game straight away, and names its setup', async () => {
    const store = memoryStore();
    await store.set(lastModeStorageKey('chess'), 'bot');
    await store.set(setupStorageKey('chess', 'bot'), JSON.stringify({ elo: 1500, color: 'black', rated: true }));
    expect(await readPlayAgain(store, 'chess', true)).toEqual({
      game: 'chess',
      mode: 'bot',
      summary: 'vs Bot 1500 · Black · Rated',
      quick: true,
    });
  });

  it('never tells a guest their game is rated', async () => {
    const store = memoryStore();
    await store.set(lastModeStorageKey('chess'), 'bot');
    await store.set(setupStorageKey('chess', 'bot'), JSON.stringify({ elo: 1500, color: 'black', rated: true }));
    expect((await readPlayAgain(store, 'chess', false)).summary).toBe('vs Bot 1500 · Black');
  });

  it('opens the form for a guest whose last mode was rated practice', async () => {
    const store = memoryStore();
    await store.set(lastModeStorageKey('go'), 'training');
    expect(await readPlayAgain(store, 'go', false)).toMatchObject({ quick: false, summary: null });
  });

  it('opens Liquidate’s form rather than guessing at it', async () => {
    const store = memoryStore();
    expect(await readPlayAgain(store, 'liquidate', false)).toMatchObject({ quick: false, mode: 'bot' });
  });
});

describe('launcher — continue', () => {
  it('lists the newest unfinished game first, board or Liquidate', async () => {
    const store = memoryStore();
    const saved: UnfinishedGame = {
      v: 1,
      game: 'chess',
      mode: 'bot',
      userId: null,
      rated: false,
      playerColor: 'white',
      botElo: 1200,
      setup: {},
      actions: [{ from: 'e2', to: 'e4' }],
      hintsUsed: 0,
      startedAt: 1,
      savedAt: 10,
    };
    await store.set(unfinishedGameKey('chess', null), serializeUnfinishedGame(saved));
    const liquidate: LiquidateSaveStore = {
      ...noLiquidate,
      read: async (slot) =>
        slot === 'local'
          ? ({ savedAt: 20, state: { isGameOver: false } } as never)
          : null,
    };
    const items = await readContinueItems(store, liquidate, null);
    expect(items.map(continueItemGame)).toEqual(['liquidate', 'chess']);
    // Another account's slot is not this player's.
    expect(await readContinueItems(store, noLiquidate, 'someone')).toEqual([]);
  });
});

describe('launcher — try something new', () => {
  const stats = (savedGames: Partial<Record<'chess' | 'checkers' | 'reversi' | 'go', number>>) =>
    ({
      perGame: Object.fromEntries(
        (['chess', 'checkers', 'reversi', 'go'] as const).map((g) => [g, { savedGames: savedGames[g] ?? 0 }]),
      ),
    }) as unknown as PlayerStats;

  it('suggests a game never played, with its first lesson', () => {
    const pick = pickTryNew({ playedAt: { chess: 1 }, recent: 'chess' }, [], null, 2);
    expect(pick).toMatchObject({ game: 'checkers', fresh: true, step: { kind: 'lesson' } });
  });

  it('does not call a game new when the account has played it', () => {
    const pick = pickTryNew({ playedAt: { chess: 1 }, recent: 'chess' }, [], stats({ checkers: 3 }), 2);
    expect(pick?.game).toBe('reversi');
  });

  it('skips a game waiting on the Continue card', () => {
    const pick = pickTryNew({ playedAt: { chess: 1 }, recent: 'chess' }, ['checkers'], null, 2);
    expect(pick?.game).toBe('reversi');
  });

  it('offers Liquidate’s rules, which has no lessons', () => {
    const now = 100 * DAY;
    const playedAt = { chess: now, checkers: now, reversi: now, go: now };
    expect(pickTryNew({ playedAt, recent: 'chess' }, [], null, now)).toMatchObject({
      game: 'liquidate',
      step: { kind: 'rules' },
      action: 'Learn how to play',
    });
  });

  it('suggests a game not played for a month, and nothing when all are recent', () => {
    const now = 100 * DAY;
    const recentAll = { chess: now, checkers: now, reversi: now, go: now, liquidate: now };
    expect(pickTryNew({ playedAt: recentAll, recent: 'chess' }, [], null, now)).toBeNull();
    const stale = { ...recentAll, go: now - STALE_MS - 1 };
    expect(pickTryNew({ playedAt: stale, recent: 'chess' }, [], null, now)).toMatchObject({ game: 'go', fresh: false });
  });

  it('ignores a store key it does not own', async () => {
    const store = memoryStore();
    await store.set(PLAYED_AT_KEY, '{"chess": 1}');
    expect((await readLauncherHistory(store)).playedAt).toEqual({ chess: 1 });
  });
});
