import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateNewRating,
  type GameOutcome,
} from '@gameexplorer/shared';
import {
  getUserRating,
  upsertUserRating,
  type GameType,
  type SaveGameOptions,
  type UserRating,
} from '@gameexplorer/db';

export type LocalGameMode = 'bot' | 'pass-and-play';
export type Color = 'white' | 'black';

/**
 * Everything `useLocalGame` needs to drive a single game without knowing its
 * rules — supplied per game. Keeping the loop engine-agnostic is what lets
 * pass-and-play reuse it as a config flag: `mode: 'pass-and-play'` simply skips
 * the bot reply and the save/rating write, and both colors go through
 * `handleMove`.
 */
export interface LocalGameAdapter<S> {
  gameType: GameType;
  newGame(): S;
  currentTurn(state: S): Color;
  isGameOver(state: S): boolean;
  winner(state: S): Color | null;
  /** `promotion` is optional and only meaningful for chess (pawn promotion). */
  validateMove(
    state: S,
    from: string,
    to: string,
    promotion?: string,
  ): { valid: boolean; resultingState?: S };
  /** Sync (in-house TS engine fallback) or async (native Arasan engine). */
  getBotMove(
    state: S,
    elo: number,
  ):
    | { from: string; to: string; promotion?: string }
    | Promise<{ from: string; to: string; promotion?: string }>;
  /** Padding delay (ms) so a bot reply doesn't feel instant. */
  thinkTimeForElo(elo: number): number;
  /**
   * Reversi only — the current player has no legal move and must pass. When both
   * are provided the loop auto-passes (append `executePass(state)`) after a short
   * delay instead of expecting a move. Undefined for chess/checkers (never pass).
   */
  mustPass?(state: S): boolean;
  executePass?(state: S): S;
  save(args: {
    state: S;
    playerColor: Color;
    result: Color | 'draw';
    difficulty: string;
    userId?: string;
    options?: SaveGameOptions;
  }): Promise<unknown>;
}

export interface UseLocalGameOptions<S> {
  adapter: LocalGameAdapter<S>;
  mode: LocalGameMode;
  /** The human's side. Ignored in pass-and-play (both sides are human). */
  playerColor: Color;
  /** Bot strength. Ignored in pass-and-play (no bot, no save). */
  targetElo: number;
  /** Apply an Elo change on end (bot mode + signed in + online). */
  rated: boolean;
  userId: string | null;
  /** Setup complete — the loop is live (bot may move first if player is black). */
  started: boolean;
  /**
   * The bot's engine is ready to answer (defaults to true). Screens whose
   * bots need an async engine warm-up (native Arasan) pass this so the bot
   * turn waits for the handshake instead of firing into a dead engine — the
   * effect refires when it flips true. Mirrors web's engine-ready gate on the
   * bot page.
   */
  botReady?: boolean;
}

export interface RatingResult {
  before: number;
  after: number;
  delta: number;
}

/**
 * The local game loop — the native port of web's `bot/page.tsx` timeline model,
 * generalized behind a `LocalGameAdapter`. It owns the move `timeline`, the
 * history scrubber (`viewIndex`), the bot reply effect, manual end (resign /
 * agree-draw), and the save + rating write on game end. Boards call `handleMove`;
 * everything else is derived here.
 */
export function useLocalGame<S>({
  adapter,
  mode,
  playerColor,
  targetElo,
  rated,
  userId,
  started,
  botReady = true,
}: UseLocalGameOptions<S>) {
  const [timeline, setTimeline] = useState<S[]>(() => [adapter.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // Rated save/rating write failed (e.g. connectivity dropped mid-game). Per the
  // offline semantics: play on, save at the end, surface an error + retry.
  const [saveError, setSaveError] = useState(false);
  const saveAttemptRef = useRef<(() => void) | null>(null);

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;

  // Refs so the async bot task / save effect read fresh values without re-firing.
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const targetEloRef = useRef(targetElo);
  targetEloRef.current = targetElo;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const userRatingRef = useRef(userRating);
  userRatingRef.current = userRating;
  const manualEndRef = useRef(manualEnd);
  manualEndRef.current = manualEnd;

  // Load the player's current rating once we know who they are (rated bot games).
  useEffect(() => {
    if (!userId || !rated || mode !== 'bot') {
      setUserRating(null);
      return;
    }
    let active = true;
    getUserRating(userId, adapter.gameType).then((r) => {
      if (active) setUserRating(r);
    });
    return () => {
      active = false;
    };
  }, [userId, rated, mode, adapter]);

  // Append a new state to the timeline, following the live head if we're on it
  // (so bot/pass moves scroll into view but don't yank a user reviewing history).
  const appendState = useCallback((next: S) => {
    const wasAtLive = viewIndexRef.current === timelineRef.current.length - 1;
    const newIndex = timelineRef.current.length;
    setTimeline((prev) => [...prev, next]);
    if (wasAtLive) setViewIndex(newIndex);
  }, []);

  // ── Bot reply ─────────────────────────────────────────────────────────────────
  const makeBotMove = useCallback(async () => {
    const current = timelineRef.current[timelineRef.current.length - 1];
    const elo = targetEloRef.current;

    setIsThinking(true);
    try {
      // Compute off the current tick (so "thinking" paints) and honor a minimum
      // think time, exactly like web.
      const [move] = await Promise.all([
        new Promise<{ from: string; to: string; promotion?: string }>((resolve) =>
          setTimeout(() => resolve(adapter.getBotMove(current, elo)), 0),
        ),
        new Promise((resolve) => setTimeout(resolve, adapter.thinkTimeForElo(elo))),
      ]);

      // Dropped if the player resigned / agreed a draw while the bot thought.
      if (manualEndRef.current) return;

      const result = adapter.validateMove(current, move.from, move.to, move.promotion);
      if (result.valid && result.resultingState) appendState(result.resultingState);
    } catch (err) {
      console.error('Bot error:', err);
    } finally {
      setIsThinking(false);
    }
  }, [adapter, appendState]);

  // Turn effect — bot replies, plus reversi auto-pass (either side) when the
  // player to move has no legal move. Checkers/chess never pass (mustPass unset).
  // The pass branch runs in BOTH modes (pass-and-play still needs auto-pass); the
  // human delay (1400ms) leaves time to read the "passing…" banner.
  useEffect(() => {
    if (!started) return;
    if (adapter.isGameOver(liveState) || manualEnd || isThinking) return;
    const isBotTurn = mode === 'bot' && adapter.currentTurn(liveState) !== playerColor;

    if (adapter.mustPass?.(liveState) && adapter.executePass) {
      const delay = isBotTurn ? 800 : 1400;
      const t = setTimeout(() => {
        if (manualEndRef.current) return;
        const live = timelineRef.current[timelineRef.current.length - 1];
        appendState(adapter.executePass!(live));
      }, delay);
      return () => clearTimeout(t);
    }

    if (isBotTurn && botReady) makeBotMove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, started, isThinking, manualEnd, mode, botReady]);

  // ── Save + rating on end ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || gameSaved) return;
    if (!adapter.isGameOver(liveState) && !manualEnd) return;
    setGameSaved(true);

    // Pass-and-play is never persisted: it's a casual game between two humans on
    // one device (the db writers record `opponent: 'bot'`, so a row would show up
    // in history as a bot game), and it must work fully offline.
    if (mode !== 'bot') return;

    const pc = playerColorRef.current;
    const other: Color = pc === 'white' ? 'black' : 'white';
    const winner = adapter.winner(liveState);
    const result: Color | 'draw' =
      manualEnd === 'draw' ? 'draw'
      : manualEnd === 'resign' ? other
      : winner === null ? 'draw'
      : winner === pc ? pc
      : other;

    const outcome: GameOutcome = result === 'draw' ? 'draw' : result === pc ? 'win' : 'loss';
    const difficulty = `elo-${targetEloRef.current}`;
    const current = userRatingRef.current;

    // Signed-out guests are never persisted: the `games` RLS policy rejects
    // rows they don't own, and such a row would be invisible to every client
    // anyway (see `isSignedIn` in packages/db). The setup screen already tells
    // guests to sign in for rated play, and Profile for saved games.
    if (!userId) return;

    // Casual: an unrated bot game, or one whose rating row hasn't loaded — save
    // without Elo. Best-effort; a casual game must never surface a save error
    // (it's the offline path).
    if (!rated || !current) {
      adapter
        .save({ state: liveState, playerColor: pc, result, difficulty, userId })
        .catch((err) => console.error('Failed to save casual game:', err));
      return;
    }

    const newRating = calculateNewRating(current.rating, targetEloRef.current, outcome, current.games_played);
    const delta = newRating - current.rating;

    const attempt = () => {
      setSaveError(false);
      Promise.all([
        upsertUserRating(userId, newRating, outcome, adapter.gameType),
        adapter.save({
          state: liveState,
          playerColor: pc,
          result,
          difficulty,
          userId,
          options: { mode: 'rated', rating_before: current.rating, rating_after: newRating },
        }),
      ])
        .then(([updated]) => {
          saveAttemptRef.current = null;
          setUserRating(updated);
          setRatingResult({ before: current.rating, after: newRating, delta });
        })
        .catch((err) => {
          console.error('Failed to save game / rating:', err);
          setSaveError(true);
        });
    };
    saveAttemptRef.current = attempt;
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, manualEnd, started]);

  // ── Player actions ─────────────────────────────────────────────────────────────
  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const live = timelineRef.current[timelineRef.current.length - 1];
      if (viewIndexRef.current !== timelineRef.current.length - 1) return;
      if (adapter.isGameOver(live) || manualEndRef.current) return;
      // In pass-and-play both colors are the human; in bot mode only the player's.
      if (mode === 'bot' && adapter.currentTurn(live) !== playerColorRef.current) return;

      const result = adapter.validateMove(live, from, to, promotion);
      if (result.valid && result.resultingState) appendState(result.resultingState);
    },
    [adapter, mode, appendState],
  );

  const endManually = useCallback(
    (kind: 'resign' | 'draw') => {
      const live = timelineRef.current[timelineRef.current.length - 1];
      if (manualEndRef.current || adapter.isGameOver(live)) return;
      setManualEnd(kind);
      setIsThinking(false);
    },
    [adapter],
  );

  const newGame = useCallback(() => {
    setTimeline([adapter.newGame()]);
    setViewIndex(0);
    setIsThinking(false);
    setManualEnd(null);
    setRatingResult(null);
    setGameSaved(false);
    setSaveError(false);
    saveAttemptRef.current = null;
  }, [adapter]);

  return {
    timeline,
    viewIndex,
    setViewIndex,
    liveState,
    displayState,
    isAtLive,
    isThinking,
    manualEnd,
    ratingResult,
    saveError,
    retrySave: () => saveAttemptRef.current?.(),
    handleMove,
    resign: () => endManually('resign'),
    agreeDraw: () => endManually('draw'),
    newGame,
    canGoBack: viewIndex > 0,
    canGoForward: viewIndex < timeline.length - 1,
  };
}
