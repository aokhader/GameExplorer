'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiquidateEngine,
  getBotAction,
  type LiquidateAction,
  type LiquidateBotLevel,
  type LiquidateGameState,
  type NewGameOptions,
} from '@gameexplorer/shared';

/**
 * Owns a Liquidate game: current state, dispatch, the bot turn loop, and
 * save/resume.
 *
 * Unlike the other games' bot pages this keeps only the *current* state rather
 * than a timeline. A property game runs for hundreds of turns, and stepping back
 * through hidden dice and shuffled decks would be meaningless anyway — so the
 * action log is the history, and `localStorage` carries a single resumable
 * snapshot instead.
 */

const STORAGE_PREFIX = 'ge:liquidate:';

/** Pacing for bot actions. Management steps are quick so a bot turn isn't a slideshow. */
const BOT_DELAY_MS: Partial<Record<LiquidateAction['type'], number>> = {
  roll: 420,
  buy: 260,
  decline: 260,
  bid: 320,
  'pass-bid': 240,
  'end-turn': 200,
};
const BOT_DELAY_DEFAULT = 130;

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: string;
  botLevel?: LiquidateBotLevel;
}

export interface SavedGame {
  state: LiquidateGameState;
  savedAt: number;
}

function readSave(key: string): SavedGame | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedGame;
    // A snapshot from an older board or schema would desync the engine.
    if (!parsed?.state?.players?.length || !parsed.state.config) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useLiquidateGame({ storageKey, botLevel = 'steady' }: UseLiquidateGameOptions) {
  const [state, setState] = useState<LiquidateGameState | null>(null);
  const [savedGame, setSavedGame] = useState<SavedGame | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Load any resumable snapshot once, on the client.
  useEffect(() => {
    setSavedGame(readSave(storageKey));
  }, [storageKey]);

  // Persist after every change; drop the slot once the game is decided.
  useEffect(() => {
    if (typeof window === 'undefined' || !state) return;
    try {
      if (state.isGameOver) {
        window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
      } else {
        window.localStorage.setItem(
          STORAGE_PREFIX + storageKey,
          JSON.stringify({ state, savedAt: Date.now() } satisfies SavedGame),
        );
      }
    } catch {
      // A full or unavailable quota must not break play.
    }
  }, [state, storageKey]);

  const dispatch = useCallback((action: LiquidateAction) => {
    setState((current) => {
      if (!current) return current;
      const result = LiquidateEngine.applyAction(current, action);
      if (!result.valid || !result.resultingState) {
        setLastError(result.reason ?? 'That move is not allowed');
        return current;
      }
      setLastError(null);
      return result.resultingState;
    });
  }, []);

  const newGame = useCallback((options: NewGameOptions) => {
    setLastError(null);
    setState(LiquidateEngine.newGame(options));
  }, []);

  const resume = useCallback(() => {
    const save = readSave(storageKey);
    if (save) {
      setLastError(null);
      setState(save.state);
    }
  }, [storageKey]);

  const discardSave = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_PREFIX + storageKey);
    }
    setSavedGame(null);
  }, [storageKey]);

  const quit = useCallback(() => {
    discardSave();
    setState(null);
  }, [discardSave]);

  /**
   * Bot turn loop.
   *
   * Keyed on the *acting* player, not the current seat, because auctions rotate
   * bidders and a trade waits on its recipient. A monotonically increasing token
   * (rather than a boolean flag) guards re-entrancy: a state change that lands
   * mid-timeout invalidates the pending action instead of letting two bot moves
   * race — the same id-claim pattern the mobile bot loop uses.
   */
  const botTokenRef = useRef(0);
  useEffect(() => {
    if (!state || state.isGameOver) return;
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (!actorId) return;
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor?.isBot) return;

    const action = getBotAction(state, botLevel);
    if (!action) return;

    const token = ++botTokenRef.current;
    const timer = window.setTimeout(
      () => {
        if (botTokenRef.current !== token) return;
        setState((current) => {
          if (!current) return current;
          const result = LiquidateEngine.applyAction(current, action);
          return result.valid && result.resultingState ? result.resultingState : current;
        });
      },
      BOT_DELAY_MS[action.type] ?? BOT_DELAY_DEFAULT,
    );

    return () => window.clearTimeout(timer);
  }, [state, botLevel]);

  const actingId = state ? LiquidateEngine.actingPlayerId(state) : null;
  const actingPlayer = state?.players.find((p) => p.id === actingId) ?? null;

  return {
    state,
    actingPlayer,
    lastError,
    dispatch,
    newGame,
    resume,
    savedGame,
    discardSave,
    quit,
  };
}
