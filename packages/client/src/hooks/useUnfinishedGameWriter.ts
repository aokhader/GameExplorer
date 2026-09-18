import { useCallback, useEffect, useRef } from 'react';
import type { LocalStore } from '../storage';
import type { Color, LocalGameMode } from './useLocalGame';
import {
  serializeUnfinishedGame,
  unfinishedGameKey,
  type LocalAction,
  type LocalGameEnd,
  type UnfinishedGame,
  type UnfinishedGameType,
} from '../game/unfinishedGame';

export interface UnfinishedGameWriterOptions {
  store: LocalStore;
  game: UnfinishedGameType;
  mode: LocalGameMode;
  userId: string | null;
  /** Whether the result will count. A guest's never does. */
  rated: boolean;
  playerColor: Color;
  botElo: number;
  /** The setup the game was started with, in `localSetup`'s shape. */
  setup: object;
  hintsUsed?: number;
  started: boolean;
  /** Every action so far — `actionsFromHistory` of the live position. */
  actions: readonly LocalAction[];
  /** The game has ended, naturally or by resignation or agreement. */
  over: boolean;
}

/**
 * The resumable slot for a screen that runs its own game loop instead of
 * `useLocalGame` — web's chess, checkers and reversi screens and its training
 * pages. The loop's `persistence` option does the same job internally; this is
 * that job with the moments it cannot see handed back to the screen.
 *
 * It saves while the game is live. What happens at the end depends on the
 * result write, which only the screen can see, so the screen calls:
 * - `clear()` when there is nothing left to owe: a casual end, or a rated
 *   result that has been written;
 * - `markEnded(end)` just before writing a rated result, so a write that fails
 *   and a tab that closes still leave the result owed rather than lost.
 */
export function useUnfinishedGameWriter(options: UnfinishedGameWriterOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const startedAtRef = useRef<number | null>(null);

  const snapshot = useCallback((end?: LocalGameEnd): UnfinishedGame | null => {
    const o = optionsRef.current;
    if (o.actions.length === 0) return null;
    const now = Date.now();
    if (startedAtRef.current === null) startedAtRef.current = now;
    return {
      v: 1,
      game: o.game,
      mode: o.mode,
      userId: o.userId,
      rated: !!o.userId && o.rated && o.mode !== 'pass-and-play',
      playerColor: o.playerColor,
      botElo: o.botElo,
      setup: { ...o.setup },
      actions: [...o.actions],
      hintsUsed: o.hintsUsed ?? 0,
      startedAt: startedAtRef.current,
      savedAt: now,
      ...(end ? { end } : {}),
    };
  }, []);

  const write = useCallback(
    (end?: LocalGameEnd) => {
      const snap = snapshot(end);
      if (!snap) return;
      const o = optionsRef.current;
      void o.store.set(unfinishedGameKey(o.game, o.userId), serializeUnfinishedGame(snap)).catch(() => {});
    },
    [snapshot],
  );

  const { started, actions, over, hintsUsed } = options;
  useEffect(() => {
    // A fresh board belongs to the next game, whenever that starts.
    if (actions.length === 0) {
      startedAtRef.current = null;
      return;
    }
    if (started && !over) write();
  }, [started, actions, over, hintsUsed, write]);

  const clear = useCallback(() => {
    const o = optionsRef.current;
    void o.store.remove(unfinishedGameKey(o.game, o.userId)).catch(() => {});
  }, []);

  const markEnded = useCallback((end: LocalGameEnd) => write(end), [write]);

  /** Carry a resumed game's start time, so its slot keeps saying when it began. */
  const resumedFrom = useCallback((saved: UnfinishedGame) => {
    startedAtRef.current = saved.startedAt;
  }, []);

  return { clear, markEnded, resumedFrom };
}
