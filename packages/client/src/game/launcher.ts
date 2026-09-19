/**
 * What a returning player's Home offers, worked out from what this device has
 * stored (`project-docs/ux-fix-ideas.md` §4.3).
 *
 * Native built its launcher first, with this logic inside the screen's hook.
 * Web's launcher needs the same answers — which game to offer again and with
 * which setup, which game to suggest, what counts as "played" — and two copies
 * of that is how a suggestion comes to mean one thing on a phone and another in
 * a browser. So the rules live here and each platform supplies its storage.
 *
 * **The history this reads** is three small keys, the same on both platforms:
 * when each game last had a game started (`gx:playedAt`), whether any game has
 * reached its result on this device (`gx:finishedGame`), and the game last
 * opened (`gx:lastGame`). Opening a setup screen and leaving is not playing, so
 * it moves only the last of the three.
 */

import { GAME_LIST, LESSONS, type GameId } from '@gameexplorer/shared';
import type { LocalStore } from '../storage';
import type { SavedLiquidateGame, LiquidateSaveStore } from '../liquidate/saveStore';
import type { PlayerStats } from './playerStats';
import {
  lastModeStorageKey,
  parseLastMode,
  parseSetup,
  setupStorageKey,
  setupSummary,
  type LastSetupMode,
} from './localSetup';
import {
  UNFINISHED_GAME_TYPES,
  parseUnfinishedGame,
  unfinishedGameKey,
  type UnfinishedGame,
} from './unfinishedGame';

export const PLAYED_AT_KEY = 'gx:playedAt';
export const FINISHED_KEY = 'gx:finishedGame';
export const LAST_GAME_KEY = 'gx:lastGame';

/** A game not played for this long is worth suggesting again. */
export const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export const isGameId = (v: unknown): v is GameId =>
  v === 'chess' || v === 'checkers' || v === 'reversi' || v === 'go' || v === 'liquidate';

/** When each game last had a game *started* — opening its setup screen does not count. */
export type PlayedAt = Partial<Record<GameId, number>>;

export function parsePlayedAt(raw: string | null | undefined): PlayedAt {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PlayedAt = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isGameId(key) && typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const read = (store: LocalStore, key: string) => store.get(key).catch(() => null);

/** Record that a game of this kind was started or resumed. Never throws. */
export async function recordPlayed(store: LocalStore, game: GameId, now: number = Date.now()): Promise<void> {
  const playedAt = parsePlayedAt(await read(store, PLAYED_AT_KEY));
  await store.set(PLAYED_AT_KEY, JSON.stringify({ ...playedAt, [game]: now })).catch(() => {});
  await store.set(LAST_GAME_KEY, game).catch(() => {});
}

/** Record that a game on this device reached its result. Never throws. */
export async function recordFinished(store: LocalStore): Promise<void> {
  await store.set(FINISHED_KEY, '1').catch(() => {});
}

/**
 * The most recent game this device was in the middle of, whichever kind it is.
 *
 * Two stores feed it: the board games' `gx:inprogress` slots, one per game and
 * account, and Liquidate's own snapshots, one per mode. Liquidate is casual only
 * and keeps no account, so its saves belong to whoever holds the device.
 */
export type ContinueItem =
  | { kind: 'board'; savedAt: number; saved: UnfinishedGame }
  | { kind: 'liquidate'; savedAt: number; slot: 'bot' | 'local'; save: SavedLiquidateGame };

export async function readContinueItems(
  store: LocalStore,
  liquidateStore: LiquidateSaveStore,
  userId: string | null,
): Promise<ContinueItem[]> {
  const boards = await Promise.all(
    UNFINISHED_GAME_TYPES.map(async (game) =>
      parseUnfinishedGame(await read(store, unfinishedGameKey(game, userId)), { game, userId }),
    ),
  );
  const liquidate = await Promise.all(
    (['bot', 'local'] as const).map(async (slot) => ({
      slot,
      save: await liquidateStore.read(slot).catch(() => null),
    })),
  );

  const items: ContinueItem[] = [];
  for (const saved of boards) {
    if (saved) items.push({ kind: 'board', savedAt: saved.savedAt, saved });
  }
  for (const { slot, save } of liquidate) {
    if (save && !save.state.isGameOver) items.push({ kind: 'liquidate', savedAt: save.savedAt, slot, save });
  }
  return items.sort((a, b) => b.savedAt - a.savedAt);
}

/** The game a Continue item belongs to. */
export function continueItemGame(item: ContinueItem): GameId {
  return item.kind === 'board' ? item.saved.game : 'liquidate';
}

export interface PlayAgain {
  game: GameId;
  /** The mode the setup was last used in, or null where nothing was remembered. */
  mode: LastSetupMode | null;
  /** "vs Bot 1200 · White · Rated", or null where there is no remembered local setup to name. */
  summary: string | null;
  /** Start straight away with that setup, rather than opening the form. */
  quick: boolean;
}

/** Where a remembered mode can start from the launcher without a question. */
export function quickMode(
  mode: LastSetupMode | null,
  signedIn: boolean,
): mode is 'bot' | 'pass-and-play' | 'training' {
  if (mode === 'bot' || mode === 'pass-and-play') return true;
  // Rated practice is rated by definition; a guest's would stop at the form anyway.
  return mode === 'training' && signedIn;
}

export async function readPlayAgain(store: LocalStore, game: GameId, signedIn: boolean): Promise<PlayAgain> {
  const lastMode = parseLastMode(await read(store, lastModeStorageKey(game)));
  if (game === 'liquidate') {
    // Liquidate's form is a handful of real choices, and the launcher opens it
    // rather than guessing at them.
    const mode = lastMode === 'pass-and-play' ? 'pass-and-play' : 'bot';
    const setup = parseSetup('liquidate', mode, await read(store, setupStorageKey('liquidate', mode)));
    return { game, mode, summary: setupSummary('liquidate', mode, setup), quick: false };
  }
  if (!quickMode(lastMode, signedIn)) {
    return { game, mode: lastMode, summary: lastMode === 'online' ? 'Online' : null, quick: false };
  }
  const setup = parseSetup(game, lastMode, await read(store, setupStorageKey(game, lastMode)));
  // A guest never plays rated, whatever the remembered toggle says.
  const summary = setupSummary(game, lastMode, signedIn ? setup : { ...setup, rated: false });
  return { game, mode: lastMode, summary, quick: true };
}

export interface LauncherHistory {
  /** The five games, the most recently played first. */
  games: GameId[];
  /** When each game was last started on this device. */
  playedAt: PlayedAt;
  /** The game played most recently, or null on a first visit. */
  recent: GameId | null;
  finishedGame: boolean;
}

export async function readLauncherHistory(store: LocalStore): Promise<LauncherHistory> {
  const [playedAt, finished, rawLast] = await Promise.all([
    read(store, PLAYED_AT_KEY).then(parsePlayedAt),
    read(store, FINISHED_KEY),
    read(store, LAST_GAME_KEY),
  ]);
  const ids = GAME_LIST.map((g) => g.id);
  const played = ids.filter((id) => playedAt[id] !== undefined);
  played.sort((a, b) => (playedAt[b] ?? 0) - (playedAt[a] ?? 0));
  // A player from before start times were recorded still has the last game opened.
  const recent: GameId | null = played[0] ?? (isGameId(rawLast) ? rawLast : null);
  return {
    games: [...played, ...ids.filter((id) => !played.includes(id))],
    playedAt,
    recent,
    finishedGame: finished === '1',
  };
}

export interface TryNew {
  game: GameId;
  /** Never played — on this device, nor saved to the account — as opposed to not for a while. */
  fresh: boolean;
  /** The game's first lesson, or its rules where it has no lessons. */
  step: { kind: 'lesson'; id: string } | { kind: 'rules' };
  action: string;
}

/**
 * One game worth suggesting: never played if there is one, otherwise one not
 * played for a month.
 *
 * "Never played" asks the account as well as the device. Start times are only
 * recorded from the launcher's first version on, and a player's history also
 * lives on the server: telling someone with a checkers rating that they are new
 * to checkers would be the kind of claim the launcher exists to stop making.
 */
export function pickTryNew(
  history: Pick<LauncherHistory, 'playedAt' | 'recent'>,
  inProgress: readonly GameId[],
  stats: PlayerStats | null,
  now: number,
): TryNew | null {
  const { playedAt, recent } = history;
  const savedGames = (id: GameId) => (id === 'liquidate' ? 0 : (stats?.perGame[id]?.savedGames ?? 0));
  // A game waiting on the Continue card is being played, whatever else says.
  const busy = new Set<GameId>(inProgress);
  const neverPlayed = (id: GameId) => playedAt[id] === undefined && savedGames(id) === 0 && !busy.has(id);
  const stale = (id: GameId) => {
    if (busy.has(id)) return false;
    const at = playedAt[id];
    return at === undefined || now - at > STALE_MS;
  };
  const others = GAME_LIST.map((g) => g.id).filter((id) => id !== recent);
  const game = others.find(neverPlayed) ?? others.find(stale);
  if (!game) return null;
  const hasLessons = Object.prototype.hasOwnProperty.call(LESSONS, game);
  const first = hasLessons ? LESSONS[game as keyof typeof LESSONS].lessons[0] : undefined;
  return {
    game,
    fresh: neverPlayed(game),
    step: first ? { kind: 'lesson', id: first.id } : { kind: 'rules' },
    action: first ? 'Start the first lesson' : 'Learn how to play',
  };
}
