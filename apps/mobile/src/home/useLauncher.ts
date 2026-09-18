import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GAME_LIST, LESSONS, type GameId } from '@gameexplorer/shared';
import {
  lastModeStorageKey,
  parseLastMode,
  parseSetup,
  setupStorageKey,
  setupSummary,
  type LastSetupMode,
} from '@gameexplorer/client/game/localSetup';
import { usePlayerStats } from '@gameexplorer/client/hooks/usePlayerStats';
import type { PlayerStats } from '@gameexplorer/client/game/playerStats';
import { nativeLocalStore } from '@/lib/localStore';
import { getPlayedAt, hasFinishedGame, isGameKey, type PlayedAt } from '@/lib/lastPlayed';
import { readContinueItems, type ContinueItem } from '@/lib/continueGame';
import { mobilePuzzleProgressStore } from '@/lib/puzzleProgress';

/** A game not played for this long is worth suggesting again. */
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PlayAgain {
  game: GameId;
  /** "vs Bot 1200 · White · Rated", or null where there is no remembered local setup to name. */
  summary: string | null;
  /** Start straight away with that setup, rather than opening the form. */
  quick: boolean;
}

export interface TryNew {
  game: GameId;
  /** Never played — on this device, nor saved to the account — as opposed to not for a while. */
  fresh: boolean;
  route: string;
  action: string;
}

export interface LauncherLocal {
  continueItems: ContinueItem[];
  playAgain: PlayAgain | null;
  /** The five games, the most recently played first. */
  games: GameId[];
  /** When each game was last started on this device. */
  playedAt: PlayedAt;
  /** The game played most recently, or null on a first visit. */
  recent: GameId | null;
  /** When this was read — "a month ago" is measured from here, not during render. */
  readAt: number;
  puzzlesSolved: number;
  finishedGame: boolean;
}

/** Where a remembered mode can start from the launcher without a question. */
function quickMode(mode: LastSetupMode | null, signedIn: boolean): mode is 'bot' | 'pass-and-play' | 'training' {
  if (mode === 'bot' || mode === 'pass-and-play') return true;
  // Training is rated by definition; a guest's would stop at the form anyway.
  return mode === 'training' && signedIn;
}

async function readPlayAgain(game: GameId, signedIn: boolean): Promise<PlayAgain> {
  const lastMode = parseLastMode(await nativeLocalStore.get(lastModeStorageKey(game)).catch(() => null));
  if (game === 'liquidate') {
    // Liquidate's form is a handful of real choices, and the launcher opens it
    // rather than guessing at them.
    const mode = lastMode === 'pass-and-play' ? 'pass-and-play' : 'bot';
    const setup = parseSetup('liquidate', mode, await nativeLocalStore.get(setupStorageKey('liquidate', mode)).catch(() => null));
    return { game, summary: setupSummary('liquidate', mode, setup), quick: false };
  }
  if (!quickMode(lastMode, signedIn)) {
    return { game, summary: lastMode === 'online' ? 'Online' : null, quick: false };
  }
  const setup = parseSetup(game, lastMode, await nativeLocalStore.get(setupStorageKey(game, lastMode)).catch(() => null));
  return { game, summary: setupSummary(game, lastMode, setup), quick: true };
}

/**
 * One game worth suggesting: never played if there is one, otherwise one not
 * played for a month.
 *
 * "Never played" asks the account as well as the device. Start times are only
 * recorded from this version on, and a player's history also lives on the
 * server: telling someone with a checkers rating that they are new to checkers
 * would be the kind of claim the launcher exists to stop making.
 */
function pickTryNew(
  local: LauncherLocal,
  stats: PlayerStats | null,
): TryNew | null {
  const { playedAt, recent, readAt: now } = local;
  const savedGames = (id: GameId) =>
    id === 'liquidate' ? 0 : (stats?.perGame[id]?.savedGames ?? 0);
  // A game waiting on the Continue card is being played, whatever else says.
  const inProgress = new Set<GameId>(
    local.continueItems.map((item) => (item.kind === 'board' ? item.saved.game : 'liquidate')),
  );
  const neverPlayed = (id: GameId) =>
    playedAt[id] === undefined && savedGames(id) === 0 && !inProgress.has(id);
  const stale = (id: GameId) => {
    if (inProgress.has(id)) return false;
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
    route: first ? `/lesson/${game}/${first.id}` : `/learn/${game}`,
    action: first ? 'Start the first lesson' : 'Learn how to play',
  };
}

async function readLocal(userId: string | null): Promise<LauncherLocal> {
  const [continueItems, playedAt, finishedGame, progress, rawLast] = await Promise.all([
    readContinueItems(userId),
    getPlayedAt(),
    hasFinishedGame(),
    mobilePuzzleProgressStore.load(),
    AsyncStorage.getItem('gx:lastGame').catch(() => null),
  ]);

  const played = GAME_LIST.map((g) => g.id).filter((id) => playedAt[id] !== undefined);
  played.sort((a, b) => (playedAt[b] ?? 0) - (playedAt[a] ?? 0));
  // A player from before start times were recorded still has the last game opened.
  const recent: GameId | null = played[0] ?? (isGameKey(rawLast) ? rawLast : null);
  const games = [
    ...played,
    ...GAME_LIST.map((g) => g.id).filter((id) => !played.includes(id)),
  ];

  return {
    continueItems,
    playAgain: recent ? await readPlayAgain(recent, !!userId) : null,
    games,
    playedAt,
    recent,
    readAt: Date.now(),
    puzzlesSolved: progress.solved.length,
    finishedGame,
  };
}

/**
 * Everything the launcher shows, re-read each time Home comes back into focus —
 * Home stays mounted under a pushed game, so a mount-only read would still show
 * the game the player just finished as unfinished.
 */
export function useLauncher(userId: string | null, authReady: boolean) {
  const [local, setLocal] = useState<LauncherLocal | null>(null);
  const stats = usePlayerStats(authReady ? userId : null);
  const refreshStats = stats.refresh;

  const reload = useCallback(() => {
    if (!authReady) return () => {};
    let active = true;
    readLocal(userId)
      .then((next) => {
        if (active) setLocal(next);
      })
      .catch((err) => console.error('Failed to read the launcher state:', err));
    return () => {
      active = false;
    };
  }, [authReady, userId]);

  // The stats load on mount by themselves; only a return to Home re-reads them.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refreshStats();
      focusedBefore.current = true;
      return reload();
    }, [reload, refreshStats]),
  );

  // Waits for the stats when signed in, so the suggestion never has to change its
  // mind once the account's history arrives.
  const statsSettled = !userId || !!stats.stats || !stats.loading;
  const tryNew = useMemo(
    () =>
      local?.recent && statsSettled
        ? pickTryNew(local, stats.stats)
        : null,
    [local, stats.stats, statsSettled],
  );

  return { local, stats, reload, tryNew };
}
