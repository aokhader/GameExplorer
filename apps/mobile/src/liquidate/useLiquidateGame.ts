import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LiquidateEngine,
  getBotAction,
  type LiquidateAction,
  type LiquidateBotLevel,
  type LiquidateGameState,
  type LiquidatePlayer,
  type NewGameOptions,
} from '@gameexplorer/shared';
import { useLiquidateWalk, type PlacedToken } from './useLiquidateWalk';

/**
 * Owns a Liquidate game: current state, dispatch, the bot turn loop, the
 * board's own walk clock, and save/resume.
 *
 * Native port of web's `useLiquidateGame`. Like web's, it keeps only the
 * *current* state rather than a timeline — a property game runs for hundreds of
 * turns, and stepping back through hidden dice and shuffled decks would be
 * meaningless anyway, so the action log is the history and storage carries a
 * single resumable snapshot.
 *
 * Deliberately NOT a `LocalGameAdapter`: that contract assumes a binary turn and
 * one bot opponent, and this is a 2–6 seat game where the acting player is often
 * not the current one.
 */

/** `gx:` to match the app's other keys; web uses its own `ge:` prefix. */
const STORAGE_PREFIX = 'gx:liquidate:';

/**
 * How much of the log a resumed game carries.
 *
 * The log is append-only and the engine never reads it back — it is written by
 * `log()` and consumed only by the UI — so the tail is all a resume needs. A
 * full 44-tile game to the last solvent baron runs to thousands of lines, and
 * AsyncStorage's SQLite backing has a practical per-item ceiling.
 */
const LOG_KEEP = 200;

/**
 * Pacing for bot actions. Management steps are quick so a bot turn isn't a
 * slideshow.
 *
 * `buy` and `decline` are the outliers: they are the moment the bot's property
 * card is on screen, and at management speed it flashed past before a player
 * could read what the bot had landed on. They are timed to be *read* — and
 * because the loop waits for the piece to finish walking, that pause starts when
 * the bot arrives rather than when it rolled.
 */
const BOT_DELAY_MS: Partial<Record<LiquidateAction['type'], number>> = {
  roll: 420,
  buy: 1250,
  decline: 1250,
  bid: 320,
  'pass-bid': 240,
  'end-turn': 200,
};
const BOT_DELAY_DEFAULT = 130;

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: 'bot' | 'local';
  botLevel?: LiquidateBotLevel;
}

export interface SavedLiquidateGame {
  state: LiquidateGameState;
  savedAt: number;
}

function parseSave(raw: string | null): SavedLiquidateGame | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SavedLiquidateGame;
    // A snapshot from an older board or schema would desync the engine. Every
    // field the engine relies on is checked, so a save written before a state
    // change is discarded rather than resumed into undefined behaviour.
    const s = parsed?.state;
    if (!s?.players?.length || !s.config || !s.decks || !s.rng) return null;
    if (typeof s.tradesProposedThisTurn !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useLiquidateGame({ storageKey, botLevel = 'steady' }: UseLiquidateGameOptions) {
  const [state, setState] = useState<LiquidateGameState | null>(null);
  const [savedGame, setSavedGame] = useState<SavedLiquidateGame | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const slot = STORAGE_PREFIX + storageKey;

  /**
   * Load any resumable snapshot once.
   *
   * `hydrated` has no web counterpart and is not optional here: `localStorage`
   * is synchronous, so web's Resume card is present on the first paint, while
   * AsyncStorage is not. Without the flag the setup screen paints "no saved
   * game" and then pops a card in a frame later.
   */
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(slot)
      .then((raw) => {
        if (!cancelled) setSavedGame(parseSave(raw));
      })
      .catch(() => {
        if (!cancelled) setSavedGame(null);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slot]);

  // Persist after every change; drop the slot once the game is decided.
  useEffect(() => {
    if (!state) return;
    if (state.isGameOver) {
      AsyncStorage.removeItem(slot).catch(() => {});
      return;
    }
    const trimmed =
      state.log.length > LOG_KEEP ? { ...state, log: state.log.slice(-LOG_KEEP) } : state;
    // Fire-and-forget with a swallowed rejection: a full or unavailable store
    // must not break play. Matches `setLastPlayed`.
    AsyncStorage.setItem(
      slot,
      JSON.stringify({ state: trimmed, savedAt: Date.now() } satisfies SavedLiquidateGame),
    ).catch(() => {});
  }, [state, slot]);

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
    if (!savedGame) return;
    setLastError(null);
    setState(savedGame.state);
  }, [savedGame]);

  const discardSave = useCallback(() => {
    AsyncStorage.removeItem(slot).catch(() => {});
    setSavedGame(null);
  }, [slot]);

  const quit = useCallback(() => {
    discardSave();
    setState(null);
  }, [discardSave]);

  /**
   * Where the pieces are on screen. Declared ABOVE the bot loop on purpose: the
   * loop reads `moving` in an effect on the same render that receives a move, so
   * the value has to be derived by then rather than arrive a render later.
   */
  const { placed, moving } = useLiquidateWalk(
    state?.players,
    state?.dice ?? null,
    state ? LiquidateEngine.board(state).length : 0,
  );

  /**
   * Bot turn loop.
   *
   * Keyed on the *acting* player, not the current seat, because auctions rotate
   * bidders and a trade waits on its recipient. A monotonically increasing token
   * (rather than a boolean flag) guards re-entrancy: a state change that lands
   * mid-timeout invalidates the pending action instead of letting two bot moves
   * race — an aborted run finishes AFTER the run that replaced it started.
   *
   * Held while a piece is walking, so a bot cannot buy a property while its own
   * token is still four tiles away. `moving` is a dependency as well as a guard,
   * so the turn resumes the moment the piece lands.
   *
   * Three invariants keep the pending timer alive across a sub-view switch,
   * which is what makes the shell's in-component navigation safe:
   *   1. the view never enters this dep array, and this hook takes no view arg;
   *   2. every callback above is `useCallback`-stable, so a child re-render
   *      cannot re-register the effect;
   *   3. the screen holding this hook never unmounts while a view is open.
   *
   * `getBotAction` is pure and does not advance `state.rng.cursor`, so computing
   * it here — and recomputing it after a timer that fired late because the OS
   * suspended the JS thread — has no side effects. A late timer is *correct*
   * rather than merely safe: `state` has not changed, so the token is still
   * current, and the queued action still applies to the state it came from.
   */
  const botTokenRef = useRef(0);
  useEffect(() => {
    if (!state || state.isGameOver || moving) return;
    const actorId = LiquidateEngine.actingPlayerId(state);
    if (!actorId) return;
    const actor = state.players.find((p) => p.id === actorId);
    if (!actor?.isBot) return;

    const action = getBotAction(state, botLevel);
    if (!action) return;

    const token = ++botTokenRef.current;
    const timer = setTimeout(
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

    return () => clearTimeout(timer);
  }, [state, botLevel, moving]);

  const actingId = state ? LiquidateEngine.actingPlayerId(state) : null;
  const actingPlayer: LiquidatePlayer | null =
    state?.players.find((p) => p.id === actingId) ?? null;

  return {
    state,
    actingPlayer,
    /** Where each piece is drawn — lags `state` while a move plays out. */
    placed,
    /** True while a piece is still walking; the UI waits for it before it reveals. */
    boardMoving: moving,
    lastError,
    dispatch,
    newGame,
    resume,
    savedGame,
    /** False until the saved slot has been read; gates the Resume card. */
    hydrated,
    discardSave,
    quit,
  };
}

export type { PlacedToken };
