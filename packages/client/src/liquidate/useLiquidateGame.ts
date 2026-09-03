import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiquidateEngine,
  getBotAction,
  type LiquidateAction,
  type LiquidateBotLevel,
  type LiquidateGameState,
  type LiquidatePlayer,
  type NewGameOptions,
} from '@finesse/shared';
import { useLiquidateWalk, type PlacedToken } from './useLiquidateWalk';

/**
 * Owns a Liquidate game: current state, dispatch, the bot turn loop, the board's
 * own walk clock, and save/resume.
 *
 * Keeps only the *current* state rather than a timeline. A property game runs
 * for hundreds of turns, and stepping back through hidden dice and shuffled
 * decks would be meaningless anyway — so the action log is the history and
 * storage carries a single resumable snapshot.
 *
 * Deliberately NOT a `LocalGameAdapter`: that contract assumes a binary turn and
 * one bot opponent, and this is a 2–6 seat game where the acting player is often
 * not the current one.
 *
 * Everything except *where the snapshot lives* is identical on both platforms,
 * which is why the save store is injected. That one difference is real —
 * `localStorage` is synchronous and `AsyncStorage` is not — and it was enough to
 * keep two near-identical copies of the bot loop alive until now.
 */

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

export interface SavedLiquidateGame {
  state: LiquidateGameState;
  savedAt: number;
}

/**
 * Where a resumable snapshot lives.
 *
 * `read` is async because one platform's storage is; the others are
 * fire-and-forget because a full or unavailable store must never break play.
 * Implementations own their own key prefix and any size limits — native trims
 * the log because AsyncStorage's SQLite backing has a practical per-item
 * ceiling, which is a fact about that store and belongs with it.
 */
export interface LiquidateSaveStore {
  read(slot: 'bot' | 'local'): Promise<SavedLiquidateGame | null>;
  write(slot: 'bot' | 'local', save: SavedLiquidateGame): void;
  clear(slot: 'bot' | 'local'): void;
}

/**
 * Validate a parsed snapshot before resuming into it.
 *
 * A snapshot from an older board or schema would desync the engine, so every
 * field the engine relies on is checked and anything short of complete is
 * discarded rather than resumed into undefined behaviour. Exported because each
 * platform's store parses its own raw string.
 */
export function isResumableSave(parsed: unknown): parsed is SavedLiquidateGame {
  const s = (parsed as SavedLiquidateGame | null)?.state;
  if (!s?.players?.length || !s.config || !s.decks || !s.rng) return false;
  return typeof s.tradesProposedThisTurn === 'number';
}

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: 'bot' | 'local';
  botLevel?: LiquidateBotLevel;
  store: LiquidateSaveStore;
  /** Effective reduced motion, for the walk clock. */
  reducedMotion: boolean;
}

export function useLiquidateGame({
  storageKey,
  botLevel = 'steady',
  store,
  reducedMotion,
}: UseLiquidateGameOptions) {
  const [state, setState] = useState<LiquidateGameState | null>(null);
  const [savedGame, setSavedGame] = useState<SavedLiquidateGame | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Held in a ref so a caller passing an inline store object — the natural way
  // to write the call site — cannot re-run the load effect on every render.
  const storeRef = useRef(store);
  storeRef.current = store;

  /**
   * Load any resumable snapshot once.
   *
   * `hydrated` exists for the async store: with a synchronous one the Resume
   * card is present on the first paint, but AsyncStorage resolves a frame later,
   * so without the flag the setup screen paints "no saved game" and then pops a
   * card in behind it.
   */
  useEffect(() => {
    let cancelled = false;
    storeRef.current
      .read(storageKey)
      .then((save) => {
        if (!cancelled) setSavedGame(save);
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
  }, [storageKey]);

  // Persist after every change; drop the slot once the game is decided.
  useEffect(() => {
    if (!state) return;
    if (state.isGameOver) {
      storeRef.current.clear(storageKey);
      return;
    }
    storeRef.current.write(storageKey, { state, savedAt: Date.now() });
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
    if (!savedGame) return;
    setLastError(null);
    setState(savedGame.state);
  }, [savedGame]);

  const discardSave = useCallback(() => {
    storeRef.current.clear(storageKey);
    setSavedGame(null);
  }, [storageKey]);

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
    reducedMotion,
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
   * token is still four tiles away. Without that, a bot rolled and then bought
   * the property 260ms later while its token was still mid-board — the board
   * narrated a move that had already been decided somewhere else. `moving` is a
   * dependency as well as a guard, so the turn resumes the moment the piece
   * lands and the delay above is time spent *on the property*.
   *
   * Three invariants keep the pending timer alive across a sub-view switch,
   * which is what makes the native shell's in-component navigation safe:
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
