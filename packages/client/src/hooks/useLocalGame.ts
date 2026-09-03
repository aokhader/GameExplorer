import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateNewRating,
  type EngineMove,
  type GameOutcome,
} from '@finesse/shared';
import {
  getUserRating,
  upsertUserRating,
  type GameType,
  type SaveGameOptions,
  type UserRating,
} from '@finesse/db';
import { HINT_PENALTY, HINT_VISIBLE_MS } from './trainingRules';

export type LocalGameMode = 'bot' | 'pass-and-play' | 'training';
export type Color = 'white' | 'black';

/**
 * A move as the loop passes it around. Reversi collapses `from === to`.
 * Defined in shared as `EngineMove` so the play loop and the analysis layer
 * describe a move exactly once; aliased here to keep the loop's own vocabulary.
 */
export type LocalMove = EngineMove;

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
  getBotMove(state: S, elo: number): LocalMove | Promise<LocalMove>;
  /**
   * Training only — the strongest move this game can find, for the hint. Kept
   * separate from `getBotMove`, which is deliberately weakened at low ratings
   * (chess substitutes random moves below Arasan's floor): a hint that blunders
   * is worse than no hint, and the player paid rating for it.
   */
  getHintMove?(state: S, elo: number): LocalMove | Promise<LocalMove>;
  /**
   * Strength to ask a hint at, given the bot's rating. Chess asks a little above
   * the player (good moves, not perfect); the other two just ask for the best.
   */
  hintElo?(botElo: number): number;
  /** Padding delay (ms) so a bot reply doesn't feel instant. */
  thinkTimeForElo(elo: number): number;
  /**
   * Reversi and Go — the current player has no legal move and must pass. When
   * both are provided the loop auto-passes (append `executePass(state)`) after a
   * short delay instead of expecting a move. Undefined for chess/checkers
   * (never pass).
   */
  mustPass?(state: S): boolean;
  executePass?(state: S): S;
  /**
   * Go only — passing is a *move*, not just what happens when you are stuck.
   *
   * Reversi's pass is forced and automatic: `mustPass` is the whole story, and a
   * player is never offered the choice. In Go a player may pass at any time, and
   * two passes are how every game ends, so the screen needs a Pass button and
   * the loop needs an action behind it. Set alongside `executePass`, which does
   * the work for both cases.
   */
  allowsVoluntaryPass?: boolean;
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
  /**
   * Bot strength. Ignored in pass-and-play (no bot, no save) and in training,
   * where the bot is matched to the player's own rating (see `botElo`).
   */
  targetElo: number;
  /** Apply an Elo change on end (bot mode + signed in + online). */
  rated: boolean;
  userId: string | null;
  /**
   * Training only — clamps the rating-matched bot to the range this game's
   * engine is actually calibrated for, so a 2600 player doesn't get a bot the
   * engine can't produce (and a 150 one doesn't get a bot below its floor).
   */
  eloBounds?: { min: number; max: number };
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
  /** Hints taken this game — the delta already has their penalty subtracted. */
  hintsUsed: number;
}

/**
 * The local game loop — the native port of web's `bot/page.tsx` timeline model,
 * generalized behind a `LocalGameAdapter`. It owns the move `timeline`, the
 * history scrubber (`viewIndex`), the bot reply effect, manual end (resign /
 * agree-draw), and the save + rating write on game end. Boards call `handleMove`;
 * everything else is derived here.
 *
 * Three modes share the loop. `bot` and `training` both play a bot and both
 * save; training differs in that the bot's strength comes from the player's own
 * rating instead of a picked tier, and hints are available at a rating cost.
 * `pass-and-play` skips the bot reply and the save entirely.
 */
export function useLocalGame<S>({
  adapter,
  mode,
  playerColor,
  targetElo,
  rated,
  userId,
  eloBounds,
  started,
  botReady = true,
}: UseLocalGameOptions<S>) {
  const isTraining = mode === 'training';
  // Training plays a bot too — everything but the strength source is shared.
  const vsBot = mode !== 'pass-and-play';

  const [timeline, setTimeline] = useState<S[]>(() => [adapter.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [isThinking, setIsThinking] = useState(false);
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  // Seeded from the same predicate the fetch effect uses, so training's Start
  // button is disabled on the very first frame too — a tap in the gap before the
  // effect ran would otherwise start a game against the default 1200 bot.
  const [ratingLoading, setRatingLoading] = useState(() => !!userId && rated && vsBot);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // Rated save/rating write failed (e.g. connectivity dropped mid-game). Per the
  // offline semantics: play on, save at the end, surface an error + retry.
  const [saveError, setSaveError] = useState(false);
  const saveAttemptRef = useRef<(() => void) | null>(null);

  // ── Training hints ────────────────────────────────────────────────────────────
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintMove, setHintMove] = useState<LocalMove | null>(null);
  const [isHinting, setIsHinting] = useState(false);

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;

  /**
   * Bot strength. Training matches the player's own rating (that's the whole
   * point of the mode); everything else uses the tier the setup screen picked.
   */
  const botElo = isTraining
    ? Math.min(
        eloBounds?.max ?? Number.MAX_SAFE_INTEGER,
        Math.max(eloBounds?.min ?? 0, userRating?.rating ?? 1200),
      )
    : targetElo;

  // Refs so the async bot task / save effect read fresh values without re-firing.
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const botEloRef = useRef(botElo);
  botEloRef.current = botElo;
  const hintsUsedRef = useRef(hintsUsed);
  hintsUsedRef.current = hintsUsed;
  const playerColorRef = useRef(playerColor);
  playerColorRef.current = playerColor;
  const userRatingRef = useRef(userRating);
  userRatingRef.current = userRating;
  const manualEndRef = useRef(manualEnd);
  manualEndRef.current = manualEnd;
  // Id of the bot search that currently owns the turn, or null when idle.
  // Mirrors `isThinking` but is readable synchronously — see makeBotMove.
  const botRunRef = useRef<number | null>(null);
  const nextBotRunId = useRef(0);

  // Load the player's current rating once we know who they are (rated bot games).
  // Training also reads it before the game starts — the setup screen shows it,
  // and it's what the bot's strength is matched to.
  useEffect(() => {
    if (!userId || !rated || !vsBot) {
      setUserRating(null);
      setRatingLoading(false);
      return;
    }
    let active = true;
    setRatingLoading(true);
    getUserRating(userId, adapter.gameType)
      .then((r) => {
        if (!active) return;
        setUserRating(r);
        setRatingLoading(false);
      })
      // A rejected read must not leave the setup screen spinning forever — the
      // game falls back to an unrated save, exactly as it does when the row is
      // missing. (Same class of hang as the auth bootstrap without a .catch.)
      .catch((err) => {
        console.error('Failed to load rating:', err);
        if (active) setRatingLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, rated, vsBot, adapter]);

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
    // Synchronous re-entry guard. The turn effect's `isThinking` check reads
    // STATE, which React hasn't committed yet at the moment this is called — so
    // any dep landing in the same batch re-runs the effect and starts a second
    // search. On a single-channel UCI engine that aborts the first one ("bot
    // error: superseded by a newer search"); on the fallback engine it can
    // append two bot moves for one turn. Same reasoning as GameActions'
    // confirmingRef.
    //
    // The guard is an id rather than a boolean because an aborted run finishes
    // AFTER the run that replaced it started: comparing ids on the way out means
    // a stale run can never release a live one's claim.
    if (botRunRef.current !== null) return;
    const runId = ++nextBotRunId.current;
    botRunRef.current = runId;

    const current = timelineRef.current[timelineRef.current.length - 1];
    const elo = botEloRef.current;

    setIsThinking(true);
    try {
      // Compute off the current tick (so "thinking" paints) and honor a minimum
      // think time, exactly like web.
      const [move] = await Promise.all([
        new Promise<LocalMove>((resolve) =>
          setTimeout(() => resolve(adapter.getBotMove(current, elo)), 0),
        ),
        new Promise((resolve) => setTimeout(resolve, adapter.thinkTimeForElo(elo))),
      ]);

      // Dropped if the player resigned / agreed a draw while the bot thought.
      if (manualEndRef.current) return;

      const result = adapter.validateMove(current, move.from, move.to, move.promotion);
      if (result.valid && result.resultingState) appendState(result.resultingState);
    } catch (err) {
      // An aborted search is routine — the game moved on (new game, or a
      // superseded request) and nobody is waiting for this answer any more.
      if ((err as Error)?.name !== 'AbortError') console.error('Bot error:', err);
    } finally {
      // Only the run still holding the claim may release it (and stop the
      // "thinking…" indicator) — a superseded one must leave both alone.
      if (botRunRef.current === runId) {
        botRunRef.current = null;
        setIsThinking(false);
      }
    }
  }, [adapter, appendState]);

  // Turn effect — bot replies, plus reversi auto-pass (either side) when the
  // player to move has no legal move. Checkers/chess never pass (mustPass unset).
  // The pass branch runs in BOTH modes (pass-and-play still needs auto-pass); the
  // human delay (1400ms) leaves time to read the "passing…" banner.
  useEffect(() => {
    if (!started) return;
    if (adapter.isGameOver(liveState) || manualEnd || isThinking) return;
    const isBotTurn = vsBot && adapter.currentTurn(liveState) !== playerColor;

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
  }, [liveState, playerColor, started, isThinking, manualEnd, vsBot, botReady]);

  // ── Save + rating on end ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || gameSaved) return;
    if (!adapter.isGameOver(liveState) && !manualEnd) return;
    setGameSaved(true);

    // Pass-and-play is never persisted: it's a casual game between two humans on
    // one device (the db writers record `opponent: 'bot'`, so a row would show up
    // in history as a bot game), and it must work fully offline.
    if (!vsBot) return;

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
    const difficulty = `elo-${botEloRef.current}`;
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

    // Hints are only ever taken in training, and each one costs the player two
    // rating points off whatever the game was worth — same price as web's
    // training pages. The floor keeps a hint-heavy loss from digging below 100.
    const earned = calculateNewRating(current.rating, botEloRef.current, outcome, current.games_played);
    const hintsTaken = hintsUsedRef.current;
    const newRating = Math.max(100, earned - hintsTaken * HINT_PENALTY);
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
          setRatingResult({ before: current.rating, after: newRating, delta, hintsUsed: hintsTaken });
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

  // ── Training hint ──────────────────────────────────────────────────────────────

  // Read synchronously — two quick taps both close over `isHinting === false`
  // and would each bill the player a hint (same reasoning as the bot-run claim).
  const hintingRef = useRef(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHint = useCallback(() => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = null;
    setHintMove(null);
  }, []);

  useEffect(() => () => clearHint(), [clearHint]);

  /**
   * Reveal the best move for a few seconds, at a cost of `HINT_PENALTY` rating
   * points applied when the game is scored. Only the player's own live turn can
   * be hinted — never the bot's, and never while reviewing history.
   */
  const requestHint = useCallback(async () => {
    const getHint = adapter.getHintMove;
    if (!isTraining || !getHint || hintingRef.current) return;
    const live = timelineRef.current[timelineRef.current.length - 1];
    if (viewIndexRef.current !== timelineRef.current.length - 1) return;
    if (adapter.isGameOver(live) || manualEndRef.current) return;
    if (adapter.currentTurn(live) !== playerColorRef.current) return;
    // Reversi can hand the player a turn with no legal move; the loop is about
    // to auto-pass it, and there's nothing to advise on (nor to charge for).
    if (adapter.mustPass?.(live)) return;

    hintingRef.current = true;
    setIsHinting(true);
    try {
      const move = await getHint(live, adapter.hintElo?.(botEloRef.current) ?? botEloRef.current);
      // The position moved on while the search ran (resigned, new game, or the
      // player moved anyway) — the answer is stale, so it isn't billed either.
      if (timelineRef.current[timelineRef.current.length - 1] !== live) return;
      if (manualEndRef.current) return;

      setHintsUsed((n) => n + 1);
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
      setHintMove(move);
      hintTimerRef.current = setTimeout(() => setHintMove(null), HINT_VISIBLE_MS);
    } catch (err) {
      // An aborted search is routine — the game moved on and nobody is waiting.
      if ((err as Error)?.name !== 'AbortError') console.error('Hint error:', err);
    } finally {
      hintingRef.current = false;
      setIsHinting(false);
    }
  }, [adapter, isTraining]);

  // ── Player actions ─────────────────────────────────────────────────────────────
  const handleMove = useCallback(
    (from: string, to: string, promotion?: string) => {
      const live = timelineRef.current[timelineRef.current.length - 1];
      if (viewIndexRef.current !== timelineRef.current.length - 1) return;
      if (adapter.isGameOver(live) || manualEndRef.current) return;
      // In pass-and-play both colors are the human; against a bot only the player's.
      if (vsBot && adapter.currentTurn(live) !== playerColorRef.current) return;

      const result = adapter.validateMove(live, from, to, promotion);
      if (result.valid && result.resultingState) {
        clearHint(); // a hint belongs to the position it was asked about
        appendState(result.resultingState);
      }
    },
    [adapter, vsBot, appendState, clearHint],
  );

  /**
   * Pass the turn deliberately (Go). Same guards as `handleMove`, because a
   * pass IS a move: it consumes the turn, ends the game if it is the second in
   * a row, and must not be playable from a reviewed position or on the bot's
   * turn. No-op for a game whose adapter does not offer it.
   */
  const pass = useCallback(() => {
    if (!adapter.allowsVoluntaryPass || !adapter.executePass) return;
    const live = timelineRef.current[timelineRef.current.length - 1];
    if (viewIndexRef.current !== timelineRef.current.length - 1) return;
    if (adapter.isGameOver(live) || manualEndRef.current) return;
    if (vsBot && adapter.currentTurn(live) !== playerColorRef.current) return;

    clearHint();
    appendState(adapter.executePass(live));
  }, [adapter, vsBot, appendState, clearHint]);

  const endManually = useCallback(
    (kind: 'resign' | 'draw') => {
      const live = timelineRef.current[timelineRef.current.length - 1];
      if (manualEndRef.current || adapter.isGameOver(live)) return;
      setManualEnd(kind);
      setIsThinking(false);
      clearHint();
    },
    [adapter, clearHint],
  );

  const newGame = useCallback(() => {
    // adapter.newGame() aborts any in-flight search, so drop the claim with it —
    // otherwise the next game's first bot turn would be locked out. The aborted
    // run won't touch it on the way out: its id no longer matches.
    botRunRef.current = null;
    setTimeline([adapter.newGame()]);
    setViewIndex(0);
    setIsThinking(false);
    setManualEnd(null);
    setRatingResult(null);
    setGameSaved(false);
    setSaveError(false);
    saveAttemptRef.current = null;
    setHintsUsed(0);
    clearHint();
  }, [adapter, clearHint]);

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
    /** Go only — a no-op unless the adapter sets `allowsVoluntaryPass`. */
    pass,
    canPass: !!adapter.allowsVoluntaryPass,
    resign: () => endManually('resign'),
    agreeDraw: () => endManually('draw'),
    newGame,
    canGoBack: viewIndex > 0,
    canGoForward: viewIndex < timeline.length - 1,
    /** Strength the bot is actually playing at (rating-matched in training). */
    botElo,
    /** The player's rating row — the training setup screen renders it. */
    userRating,
    ratingLoading,
    // Training hints. `hintMove` is null outside the few seconds after a reveal.
    hintsUsed,
    hintMove,
    isHinting,
    requestHint,
  };
}
