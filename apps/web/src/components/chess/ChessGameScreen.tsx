'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { ChessGameState, Position, PieceType, calculateNewRating, GameOutcome, summarizeMaterial, timelineToSan, illegalMoveReason, ILLEGAL_MOVE_COPY, MODE_COPY, botStrengthLabel, BOT_TIERS, ABORT_MOVE_LIMIT } from '@gameexplorer/shared';
import { useGameAnalysis } from '@gameexplorer/client/hooks/useGameAnalysis';
import { useChessReviewAdapter } from '@/hooks/useChessReviewAdapter';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { ChessPiece } from '@gameexplorer/ui';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useChessEngine } from '@/hooks/useChessEngine';
import { useStockfish, thinkTimeForElo } from '@/hooks/useStockfish';
import { useAuth } from '@/hooks/useAuth';
import { saveGame, getPracticeRating, recordPracticeResult } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GAME_SIDEBAR_ID, GameScreenLayout } from '@/components/game/GameScreenLayout';
import { MoveStrip, numberedStripItems } from '@/components/game/MoveStrip';
import { PlayerCard } from '@/components/game/PlayerCard';
import { CapturedTray } from '@/components/game/CapturedTray';
import { GameActions } from '@/components/game/GameActions';
import { RatedToggle } from '@/components/game/RatedToggle';
import { useCasualLink } from '@/hooks/useCasualLink';
import { ResultActions } from '@/components/game/ResultActions';
import { SetupStartBar } from '@/components/game/SetupStartBar';
import { useSettings } from '@/components/providers/SettingsProvider';
import { ShellNav } from '@/components/game/ShellNav';
import { ContinueCard, GuardedStartButton } from '@/components/game/ContinueCard';
import { useRouter } from 'next/navigation';
import { useRememberedSetup } from '@gameexplorer/client/hooks/useRememberedSetup';
import { useUnfinishedGameWriter } from '@gameexplorer/client/hooks/useUnfinishedGameWriter';
import { CHESS_RULES, actionsFromHistory } from '@gameexplorer/client/game/localRules';
import { replayActions, type UnfinishedGame } from '@gameexplorer/client/game/unfinishedGame';
import { webLocalStore } from '@/lib/localStore';
import { resumeHref, useUnfinishedGame, wantsResume } from '@/hooks/useUnfinishedGame';
import { useMarkPlayed } from '@/hooks/useMarkPlayed';
import { useStartLink } from '@/hooks/useStartLink';
import { useOnceTip } from '@/hooks/useOnceTip';
import { BoardTip } from '@/components/game/BoardTip';

// GameResultScreen pulls in canvas-confetti + a framer-motion tree but only
// renders at game end — load it lazily so it stays out of the initial route
// chunk (smaller first-load JS / faster first navigation to this page).
const GameResultScreen = dynamic(
  () => import('@/components/game/GameResultScreen').then(m => m.GameResultScreen),
  { ssr: false },
);

// Review is opened by hand after a game ends, so its markup has no business in
// the initial route chunk either.
const ReviewPanel = dynamic(
  () => import('@/components/game/ReviewPanel').then(m => m.ReviewPanel),
  { ssr: false },
);

// ── ELO helpers ────────────────────────────────────────────────────────────────

const STOCKFISH_MIN_ELO = 1400;

/**
 * The six tiles, from the catalog's ladder. Only the tile's label is local,
 * because a 3-across grid on a phone cannot hold "Intermediate" — an
 * abbreviation is allowed where a rename is not (see `botTiers.ts`).
 */
const TILE_ABBREVIATION: Record<string, string> = { Intermediate: 'Inter.' };

const ELO_PRESETS = BOT_TIERS.chess.map(({ elo, label }) => ({
  elo,
  label: TILE_ABBREVIATION[label] ?? label,
}));

/** A bot's name, shared with the setup screen so a preset keeps its tier. */
const eloLabel = (elo: number): string => botStrengthLabel('chess', elo);

function eloDescription(elo: number): string {
  if (elo < 600)  return 'Hangs pieces frequently, random-looking play';
  if (elo < 800)  return 'Misses basic tactics, occasional blunders';
  if (elo < 1000) return 'Spots one-move threats, misses combinations';
  if (elo < 1200) return 'Consistent but beatable with simple tactics';
  if (elo < 1400) return 'Solid basic play, catches most hanging pieces';
  if (elo < 1600) return 'Strong tactically, handles most positions well';
  if (elo < 1800) return 'Plays like a serious club competitor';
  if (elo < 2000) return 'Near-tournament strength, very accurate';
  if (elo < 2200) return 'Finds deep combinations reliably';
  if (elo < 2400) return 'Near-master level play';
  return 'Elite — extremely strong';
}

/** "white" → "White", for the pass-and-play player cards. */
function capitalize(color: string): string {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

// ── Component ─────────────────────────────────────────────────────────────────

interface RatingResult {
  before: number;
  after: number;
  delta: number;
}

export interface ChessGameScreenProps {
  /**
   * `bot` plays the engine; `local` is two people sharing one screen.
   * Pass-and-play is a mode of this screen rather than its own, because the only
   * things that change are who supplies the reply and whether the result counts —
   * everything else (timeline, review, board, move list) is identical.
   */
  mode: 'bot' | 'local';
}

export function ChessGameScreen({ mode }: ChessGameScreenProps) {
  const isLocal = mode === 'local';
  const { settings } = useSettings();

  // Worker owns the canonical game state; all move validation runs off main thread.
  const { gameState: liveState, legalMoves: legalMovesMap, isReady: engineReady, makeMove, getBotMove, reset, load } = useChessEngine();
  const { user } = useAuth();

  // Timeline for replay — grows as the worker confirms each move.
  const [timeline, setTimeline] = useState<ChessGameState[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  // Strength, colour and rated as chosen last time on this route, read before the
  // first paint (`ux-fix-ideas.md` §2.1).
  const { setup, update } = useRememberedSetup({
    store: webLocalStore,
    game: 'chess',
    mode: isLocal ? 'pass-and-play' : 'bot',
  });
  const { elo: targetElo, color: playerColor, rated: rememberedRated } = setup;
  // A link that promised practice cannot hand back a rated game, whatever the
  // remembered setup says (`useCasualLink`). Touching the switch takes the
  // choice back.
  const casualLink = useCasualLink();
  const rated = casualLink.casual ? false : rememberedRated;
  /**
   * The slider reaches strengths between the presets. Marking those custom is
   * what keeps a remembered 1325 from snapping back to the nearest preset — and
   * lets native, which draws presets and a custom picker separately, read it.
   */
  const setTargetElo = (elo: number) =>
    update({ elo, custom: !ELO_PRESETS.some((preset) => preset.elo === elo) });
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  useMarkPlayed('chess', isLocal ? 'pass-and-play' : 'bot', gameStarted);

  // One-time tips where the thing happens (`ux-fix-ideas.md` §4.4): what check
  // means the first time the player is in it, and why the first refused move
  // was refused. A tip is about the position it arrived in, so the next move
  // retires it — which is why that effect runs first.
  const { tip, offer: offerTip, dismiss: dismissTip } = useOnceTip();
  const moveCount = liveState.moveHistory.length;
  useEffect(() => {
    dismissTip();
  }, [moveCount, dismissTip]);
  useEffect(() => {
    if (!gameStarted || !liveState.isCheck || liveState.isCheckmate) return;
    // In pass-and-play whoever is to move is a player in check.
    if (isLocal || liveState.currentTurn === playerColor) offerTip('check');
  }, [gameStarted, liveState, isLocal, playerColor, offerTip]);
  const handleIllegalMove = (from: Position, to: Position) => {
    const reason = illegalMoveReason(liveState, from, to);
    // "Can't get there" is what the destination dots already show; the tip is
    // for the rules about the king, which nothing on the board explains.
    if (reason && reason !== 'cantReach') offerTip('illegal-move', ILLEGAL_MOVE_COPY[reason]);
  };

  const [userId, setUserId] = useState<string | null>(null);
  /**
   * Whether this game actually counts — the screen's one answer, used by the
   * switch, the board and the save alike.
   *
   * These three screens used to show `signedIn && rated` on the switch and hand
   * the raw `rated` to everything else. The two disagree while auth is still
   * resolving, and for a signed-out player with a rated setup remembered: the
   * switch reads Casual while the game is set up rated. Go already folded the
   * account in; now they all do, so the control cannot say one thing while the
   * game does another.
   */
  const ratedEffective = rated && !!userId && !isLocal;
  // Player-initiated end (design's ½ Draw / Resign pair) — the engine state
  // stays live, but the game is over from the UI's point of view.
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // View only — which colour sits at the bottom. Never changes what you own.
  const [flipped, setFlipped] = useState(false);
  // Post-game review. Gated on the game being over: mid-game it would be an
  // unlimited free hint, which is exactly what training charges rating for.
  const [reviewing, setReviewing] = useState(false);

  // Defer Stockfish (and its ~7 MB WASM download) until the game actually
  // starts — no need to load the engine while the user is still on the setup
  // screen picking ELO / colour.
  const stockfish = useStockfish({ enabled: gameStarted });

  // Review runs its own Stockfish worker, created only when review is opened —
  // the play engine keeps its search running and UCI is a single channel, so the
  // two cannot share one.
  const { adapter: reviewAdapter, ready: reviewEngineReady } = useChessReviewAdapter(reviewing);
  const analysis = useGameAnalysis({
    adapter: reviewAdapter,
    timeline,
    viewIndex,
    // The handshake has to finish before any search is sent, or every position
    // would fail with "Engine not ready".
    enabled: reviewing && reviewEngineReady,
  });

  // Tracks whether a bot MAKE_MOVE is in flight so we clear isThinking only
  // when the worker confirms, not when makeMove() posts the message.
  const botMovePendingRef = useRef(false);

  // Bumped on every reset. A rematch starts the next game in the same instant
  // the last one ended, so a bot search still running for the finished game (the
  // player resigned mid-think) must not land on the new one — or clear the
  // thinking flag of the search that now owns the turn.
  const gameGenRef = useRef(0);

  // Always-fresh refs for use inside async callbacks and effects.
  const targetEloRef    = useRef(targetElo);
  targetEloRef.current  = targetElo;
  const playerColorRef  = useRef(playerColor);
  playerColorRef.current = playerColor;
  const liveStateRef    = useRef(liveState);
  liveStateRef.current  = liveState;
  const manualEndRef    = useRef(manualEnd);
  manualEndRef.current  = manualEnd;
  const userRatingRef   = useRef(userRating);
  userRatingRef.current = userRating;
  const ratedRef        = useRef(ratedEffective);
  ratedRef.current      = ratedEffective;

  // A link's strength (?elo=1200, from the tour or the first-run picker) wins
  // over the remembered one and is then remembered itself. Its `start=1` is
  // `useStartLink`'s, below. A layout effect, so the form never paints the old
  // strength first.
  useIsomorphicLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const elo = Number(params.get('elo'));
    if (Number.isFinite(elo) && elo > 0) {
      setTargetElo(Math.min(3000, Math.max(400, Math.round(elo / 25) * 25)));
    }
  }, []);

  // ── Sync confirmed worker state → timeline ──────────────────────────────────
  useEffect(() => {
    if (!engineReady) return;
    setTimeline(prev => {
      if (prev.length === 0) {
        // First STATE_UPDATE after mount or after reset.
        return [liveState];
      }
      const last = prev[prev.length - 1];
      if (liveState.moveHistory.length > last.moveHistory.length) {
        // New confirmed move — append and advance viewIndex if user was at live.
        const newLen = prev.length + 1;
        setViewIndex(vi => (vi === prev.length - 1 ? newLen - 1 : vi));

        // Clear thinking flag once the bot move is confirmed by the worker.
        if (botMovePendingRef.current && liveState.currentTurn === playerColorRef.current) {
          botMovePendingRef.current = false;
          setIsThinking(false);
        }

        // Per-move sound is handled by the board; the terminal win/loss chime
        // is owned by the result celebration screen.

        return [...prev, liveState];
      }
      if (liveState.moveHistory.length === 0 && last.moveHistory.length > 0) {
        // Reset — replace timeline with fresh initial state.
        setViewIndex(0);
        return [liveState];
      }
      return prev;
    });
  }, [engineReady, liveState]);

  const isAtLive    = viewIndex === timeline.length - 1;
  const displayState = timeline[viewIndex] ?? liveState;

  // SAN for the review move list. Derived from the timeline rather than the move
  // history because disambiguation ("Nbd2") needs the position each move was
  // played in. Only computed once review is open — it walks the whole game.
  const sanMoves = useMemo(
    () => (reviewing ? timelineToSan(timeline) : []),
    [reviewing, timeline],
  );

  useEffect(() => { setUserId(user?.id ?? null); }, [user]);

  // Load rating when user is available
  useEffect(() => {
    if (!user) return;
    // Practice level, never the online Rating — a bot game has no witness, so
    // it may only move the number nothing else trusts (GX-04).
    getPracticeRating(user.id, 'chess')
      .then(setUserRating)
      .catch((err) => console.error('Failed to load Practice level:', err));
  }, [user]);

  // ── Unfinished game (`ux-fix-ideas.md` §2.4) ────────────────────────────────
  // Saved as it is played, so a closed tab no longer loses the game — and a rated
  // one stays open until it is finished or resigned.
  const setupMode = isLocal ? 'pass-and-play' : 'bot';
  const unfinished = useUnfinishedGame('chess');
  const router = useRouter();
  const actions = useMemo(() => actionsFromHistory('chess', liveState), [liveState]);
  const slot = useUnfinishedGameWriter({
    store: webLocalStore,
    game: 'chess',
    mode: setupMode,
    userId,
    rated: ratedEffective,
    playerColor,
    botElo: targetElo,
    setup,
    // Only once the timeline holds the worker's position: between a reset and
    // the worker's reply, `liveState` is still the game that just ended.
    started: gameStarted && timeline.length > 0,
    actions,
    over: liveState.isCheckmate || liveState.isStalemate || liveState.isDraw || !!manualEnd,
  });

  /**
   * A saved game waiting for the worker. The timeline sync below treats the
   * worker's first position after mount as a fresh board, so a game restored
   * before that would be reset by it.
   */
  const [pendingResume, setPendingResume] = useState<UnfinishedGame | null>(null);

  /** Pick a saved game up where it was left; another mode's resumes on its own route. */
  const resumeSaved = (saved: UnfinishedGame) => {
    if (saved.mode !== setupMode) {
      router.push(resumeHref(saved));
      return;
    }
    if (!engineReady) {
      setPendingResume(saved);
      return;
    }
    const replayed = replayActions(CHESS_RULES, saved.actions);
    if (!replayed) {
      void unfinished.settle({ resign: true }).catch(() => {});
      return;
    }
    gameGenRef.current += 1;
    stockfish.cancelSearch();
    botMovePendingRef.current = false;
    update({ elo: saved.botElo, color: saved.playerColor, rated: saved.rated });
    // The timeline first, then the worker: when its update arrives the timeline
    // already ends on that position, so the sync effect leaves it alone.
    setTimeline(replayed);
    setViewIndex(replayed.length - 1);
    load(replayed[replayed.length - 1]);
    setIsThinking(false);
    setManualEnd(null);
    setGameSaved(false);
    setRatingResult(null);
    setReviewing(false);
    slot.resumedFrom(saved);
    setGameStarted(true);
  };

  // `?resume=1` from a Continue card on another route: blank until it is known
  // whether there is a game to open.
  const [awaitingResume, setAwaitingResume] = useState(false);
  useIsomorphicLayoutEffect(() => {
    if (wantsResume()) setAwaitingResume(true);
  }, []);
  useEffect(() => {
    if (!awaitingResume || !unfinished.hydrated) return;
    setAwaitingResume(false);
    const saved = unfinished.saved;
    if (saved && !saved.end && saved.mode === setupMode) resumeSaved(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingResume, unfinished.hydrated]);
  useEffect(() => {
    if (!pendingResume || !engineReady) return;
    setPendingResume(null);
    resumeSaved(pendingResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingResume, engineReady]);

  // ── Trigger bot move when it's the bot's turn ───────────────────────────────
  useEffect(() => {
    // Pass-and-play has no bot to move: the second player supplies the reply.
    if (isLocal) return;
    if (!gameStarted || !engineReady) return;
    // Weak bots (< STOCKFISH_MIN_ELO) run in the chess-engine worker and don't
    // need Stockfish; only wait on it when the selected ELO actually uses it.
    if (targetElo >= STOCKFISH_MIN_ELO && !stockfish.isReady) return;
    // Between a reset and the worker's fresh position the timeline is empty and
    // `liveState` is still the finished game — never search on that.
    if (timeline.length === 0) return;
    if (liveState.isCheckmate || liveState.isStalemate || liveState.isDraw || manualEnd) return;
    if (liveState.currentTurn !== playerColor && !isThinking) {
      makeBotMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, stockfish.isReady, engineReady, targetElo, manualEnd, timeline.length]);

  // ── Save game and update rating when it ends ────────────────────────────────
  // One effect for both endings. Resign/draw used to save from its own handler,
  // which meant a resigned game could never carry a rating change — and the two
  // call sites could both fire for one game. Mirrors checkers/reversi.
  useEffect(() => {
    // Pass-and-play is casual by definition — no rating and no saved row. There
    // is no single "player" whose result could be recorded against an account.
    // With the game over nothing is owed, so its resumable slot goes.
    if (isLocal) {
      const ended = liveState.isCheckmate || liveState.isStalemate || liveState.isDraw || manualEnd;
      if (gameStarted && ended) slot.clear();
      return;
    }
    if (!gameStarted || gameSaved) return;
    const naturalEnd = liveState.isCheckmate || liveState.isStalemate || liveState.isDraw;
    if (!naturalEnd && !manualEnd) return;
    setGameSaved(true);

    const pc = playerColorRef.current;
    const result: 'white' | 'black' | 'draw' =
      manualEnd === 'draw' ? 'draw'
      : manualEnd === 'resign' ? (pc === 'white' ? 'black' : 'white')
      : liveState.isCheckmate ? (liveState.currentTurn === 'white' ? 'black' : 'white')
      : 'draw';

    const outcome: GameOutcome =
      result === 'draw' ? 'draw' : result === pc ? 'win' : 'loss';

    const current = userRatingRef.current;
    const uid = userId;

    if (current && uid && ratedRef.current) {
      const rawDelta = calculateNewRating(current.rating, targetEloRef.current, outcome, current.games_played) - current.rating;
      const newRating = Math.max(100, current.rating + rawDelta);

      // Owed until written: a failed write or a closed tab leaves the result on
      // the Continue card rather than losing it.
      slot.markEnded(manualEnd ?? 'over');
      Promise.all([
        recordPracticeResult(newRating, outcome, 'chess'),
        saveGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid, {
          mode: 'rated',
          rating_before: current.rating,
          rating_after: newRating,
        }),
      ]).then(([updatedRating]) => {
        slot.clear();
        setUserRating(updatedRating);
        setRatingResult({ before: current.rating, after: newRating, delta: rawDelta });
      }).catch((err) => console.error('Failed to save game / rating:', err));
    } else {
      slot.clear();
      saveGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isCheckmate, liveState.isStalemate, liveState.isDraw, manualEnd]);

  // ── Bot move ────────────────────────────────────────────────────────────────
  const makeBotMove = useCallback(async () => {
    const elo = targetEloRef.current;
    const gen = gameGenRef.current;
    setIsThinking(true);
    botMovePendingRef.current = true;

    try {
      let from: string, to: string, promotion: PieceType | undefined;

      if (elo < STOCKFISH_MIN_ELO) {
        // Weak engine runs inside the chess engine worker — zero main-thread cost.
        const [move] = await Promise.all([
          getBotMove(elo),
          new Promise<void>(r => setTimeout(r, thinkTimeForElo(elo))),
        ]);
        from = move.from; to = move.to; promotion = move.promotion;
      } else {
        // Stockfish runs in its own worker; we just need the current position.
        const [move] = await Promise.all([
          stockfish.getBestMove(liveStateRef.current, elo),
          new Promise<void>(r => setTimeout(r, thinkTimeForElo(elo))),
        ]);
        from = move.from; to = move.to; promotion = move.promotion;
      }

      // A newer game owns the board and the thinking flag now; leave both alone.
      if (gen !== gameGenRef.current) return;
      // The player may have resigned / agreed a draw while the bot was
      // thinking — drop the move instead of playing on a finished game.
      if (manualEndRef.current) {
        botMovePendingRef.current = false;
        setIsThinking(false);
        return;
      }

      // Post the move to the chess engine worker for validation + state update.
      // isThinking is cleared in the timeline sync effect when the worker confirms.
      makeMove(from as Position, to as Position, promotion);
    } catch (err) {
      if (gen !== gameGenRef.current) return;
      console.error('Bot error:', err);
      botMovePendingRef.current = false;
      setIsThinking(false);
    }
  }, [getBotMove, makeMove, stockfish]);

  // ── Player move ─────────────────────────────────────────────────────────────
  const handleMove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (!isAtLive || isThinking || !engineReady || manualEnd) return;
    // Pass-and-play: both colours are human, so the side to move is always the
    // one allowed to move.
    if (!isLocal && liveState.currentTurn !== playerColor) return;
    // Post to worker — returns immediately; validation runs off main thread.
    makeMove(from, to, promotionPiece);
  };

  // ── Resign / draw (vs the bot, both end the game immediately) ──────────────
  /**
   * Cancel a game nobody has really started yet, leaving nothing behind: no
   * rating, no saved row, no resumable slot. Offered instead of Resign while
   * fewer than `ABORT_MOVE_LIMIT` moves have been played, which is the rule
   * multiplayer already uses — a misconfigured game should cost nothing, and
   * resigning one would write a loss for a game that never happened.
   */
  const abortGame = () => {
    slot.clear();
    resetGame(false);
  };
  const endManually = (kind: 'resign' | 'draw') => {
    if (manualEnd || liveState.isCheckmate || liveState.isStalemate || liveState.isDraw) return;
    setManualEnd(kind);
    setIsThinking(false);
    botMovePendingRef.current = false;
    // The save/rating effect above picks this up — it watches `manualEnd`.
  };

  /** Clear the finished game. `keepSetup` starts the next one straight away. */
  const resetGame = (keepSetup: boolean) => {
    gameGenRef.current += 1;
    // The finished game's bot may still be thinking; its answer is for a board
    // that no longer exists.
    stockfish.cancelSearch();
    setTimeline([]);
    setViewIndex(0);
    if (!keepSetup) setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setGameSaved(false);
    setRatingResult(null);
    setReviewing(false);
    botMovePendingRef.current = false;
    reset(); // worker resets to newGame() and broadcasts STATE_UPDATE
  };

  /**
   * Back to the setup form (header New Game, result card Change setup). A game
   * left unfinished stays saved, and the Continue card reads it back.
   */
  const handleNewGame = () => {
    resetGame(false);
    unfinished.refresh();
  };

  /**
   * Same strength, same colour, same rated choice — no setup form. A rated
   * rematch reads the rating the last game just wrote (`userRating` is updated
   * when the save resolves).
   */
  const handleRematch = () => resetGame(true);

  const handleStartGame = () => {
    setGameStarted(true);
  };
  // `?start=1`: start once it is known no unfinished game is waiting.
  const awaitingStart = useStartLink(unfinished, handleStartGame);

  const movePairs  = buildMovePairs(timeline);
  const canGoBack  = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;

  // Capture trays follow the board the player is LOOKING at, not the live one,
  // so stepping back through the game rewinds the trays with it.
  const material = summarizeMaterial(displayState);
  const whiteLead = material.advantage;
  // Pass-and-play turns the board around between turns so whoever is thinking
  // sits at the bottom — off it goes by the player's fixed seat, as vs the bot.
  // Reads the *live* turn, not the displayed one: stepping back through the game
  // to look at a position should not spin the board under you.
  const passAndPlayOrientation = settings.flipBoardPassAndPlay
    ? liveState.currentTurn
    : 'white';
  const baseOrientation = isLocal ? passAndPlayOrientation : playerColor;
  const orientation = flipped
    ? (baseOrientation === 'white' ? 'black' : 'white')
    : baseOrientation;

  // Which colour each player card describes. Vs the bot the cards are fixed
  // (Bot above, You below) however the board is turned — you own one side all
  // game. In pass-and-play there is no "you", so the cards follow the board:
  // whoever is at the bottom of the screen gets the bottom card.
  const bottomColor = isLocal ? orientation : playerColor;
  const topColor = bottomColor === 'white' ? 'black' : 'white';

  // ── Setup screen ──────────────────────────────────────────────────────────────

  if (!gameStarted && (awaitingResume || pendingResume || awaitingStart)) {
    return <div className="min-h-svh" />;
  }

  if (!gameStarted) {
    return (
      <div className="min-h-svh">
        <div className="container mx-auto px-4 pt-4">
          <ShellNav backHref="/chess" />
        </div>

        <div className="container mx-auto px-4 pt-2 pb-10 max-w-2xl">
          <h1 className="text-2xl font-bold text-fg mb-4">
            {isLocal ? MODE_COPY.local.label : MODE_COPY.bot.label}
          </h1>

          {unfinished.saved && (
            <ContinueCard
              saved={unfinished.saved}
              onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
              onSettle={unfinished.settle}
              settling={unfinished.settling}
            />
          )}

          {/* ELO selector — no bot in pass-and-play, so nothing to calibrate. */}
          <div className={`rounded-xl border border-white/10 bg-surface-alt surface-raised p-5 mb-4 ${isLocal ? 'hidden' : ''}`}>
            <h2 className="text-lg font-semibold text-fg mb-3">
              Bot Strength
            </h2>

            {/* ELO display */}
            <div className="text-center mb-6">
              <div className="font-display text-5xl font-bold tabular-nums text-fg leading-none mb-1">
                {targetElo}
              </div>
              <div className="text-lg font-semibold text-accent">
                {eloLabel(targetElo)}
              </div>
              <div className="text-sm text-fg-muted mt-1">
                {eloDescription(targetElo)}
              </div>
            </div>

            {/* Slider */}
            <div className="mb-4">
              <input
                type="range"
                min={400}
                max={3000}
                step={25}
                value={targetElo}
                onChange={e => setTargetElo(Number(e.target.value))}
                aria-label="Bot strength"
                // A 44px band with the 8px track drawn inside it: the input's
                // own box is the target, and at h-2 a finger had 8px to find
                // (ux-fix-ideas.md §8.3). The look is unchanged.
                className={[
                  'block w-full h-11 cursor-pointer appearance-none bg-transparent',
                  '[&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-surface-muted',
                  '[&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-muted',
                  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
                  '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent',
                ].join(' ')}
              />
              <div className="flex justify-between text-xs text-fg-subtle px-0.5">
                <span>400</span>
                <span>1200</span>
                <span>2000</span>
                <span>3000</span>
              </div>
            </div>

            {/* Quick presets */}
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {ELO_PRESETS.map(({ elo, label }) => (
                <button
                  key={elo}
                  onClick={() => setTargetElo(elo)}
                  aria-pressed={targetElo === elo}
                  className={`py-2 px-1 rounded-lg text-center text-sm transition-all ${
                    targetElo === elo
                      ? 'border border-accent bg-accent-muted text-fg font-semibold'
                      : 'bg-white/5 border border-white/10 text-fg-muted hover:bg-white/10 hover:text-fg'
                  }`}
                >
                  <div className="font-bold">{elo}</div>
                  <div className="text-xs opacity-75 leading-tight">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Color selector — in pass-and-play this picks which seat is "bottom"
              when the flip-between-turns setting is off. */}
          <div className="rounded-xl border border-white/10 bg-surface-alt surface-raised p-5 mb-4">
            <h2 className="text-lg font-semibold text-fg mb-3">
              {isLocal ? 'Who Sits at the Bottom' : 'Choose Your Color'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => update({ color: 'white' })}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'white'
                    ? 'border border-accent bg-accent-muted text-fg'
                    : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                }`}
              >
                <div className="flex justify-center mb-2"><ChessPiece type="king" color="white" size={40} /></div>
                <div className="font-semibold">White</div>
                <div className={`text-sm ${playerColor === 'white' ? 'text-fg-muted' : 'text-fg-muted'}`}>
                  {isLocal ? 'Moves first' : 'You move first'}
                </div>
              </button>
              <button
                onClick={() => update({ color: 'black' })}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'black'
                    ? 'border border-accent bg-accent-muted text-fg'
                    : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                }`}
              >
                <div className="flex justify-center mb-2"><ChessPiece type="king" color="black" size={40} /></div>
                <div className="font-semibold">Black</div>
                <div className={`text-sm ${playerColor === 'black' ? 'text-fg-muted' : 'text-fg-muted'}`}>
                  {isLocal ? 'Moves second' : 'Bot moves first'}
                </div>
              </button>
            </div>
          </div>

          {/* Pass-and-play is casual by definition — nothing to rate. */}
          {!isLocal && (
            <RatedToggle
              checked={ratedEffective}
              onChange={(value) => {
                casualLink.release();
                update({ rated: value });
              }}
              gameLabel="chess"
              userId={userId}
            />
          )}

          <SetupStartBar>
            <GuardedStartButton
              onStart={handleStartGame}
              saved={unfinished.saved}
              onResume={() => unfinished.saved && resumeSaved(unfinished.saved)}
              onSettle={unfinished.settle}
              settling={unfinished.settling}
            >
              Start Game
            </GuardedStartButton>
          </SetupStartBar>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────────

  const gameOverMsg = manualEnd === 'resign'
    // In pass-and-play the side to move is the one giving up, so name them —
    // "You resigned" has no referent when two people share the screen.
    ? (isLocal ? `${capitalize(liveState.currentTurn)} resigned` : 'You resigned')
    : manualEnd === 'draw' ? 'Draw by agreement'
    : liveState.isCheckmate
    ? `Checkmate — ${liveState.currentTurn === 'white' ? 'Black' : 'White'} wins`
    : liveState.isStalemate ? 'Stalemate — Draw'
    : liveState.isDraw ? 'Draw'
    : null;

  // Player-relative result for the celebration screen. Pass-and-play has no
  // "you" to lose, so a decisive game is always somebody's win — the headline
  // names the winner in `localResultTitle` below.
  const myResult: GameResult | null = manualEnd === 'resign'
    ? (isLocal ? 'win' : 'loss')
    : manualEnd === 'draw' ? 'draw'
    : liveState.isCheckmate
    ? (isLocal
        ? 'win'
        : ((liveState.currentTurn === 'white' ? 'black' : 'white') === playerColor ? 'win' : 'loss'))
    : liveState.isStalemate || liveState.isDraw ? 'draw'
    : null;

  /**
   * Winner-named headline for pass-and-play, e.g. "Black wins".
   * Both decisive endings resolve the same way: the side to move is either the
   * one just mated or the one who resigned, so the winner is always the other.
   */
  const localResultTitle =
    !isLocal || !myResult || myResult === 'draw'
      ? undefined
      : `${capitalize(liveState.currentTurn === 'white' ? 'black' : 'white')} wins`;

  const yourTurn = isAtLive && !isThinking && !gameOverMsg && liveState.currentTurn === playerColor;

  return (
    <>
      <GameScreenLayout
        backHref="/chess"
        headerActions={
          <>
            {!isAtLive && (
              <button
                onClick={() => setViewIndex(timeline.length - 1)}
                className="touch-target motion-control motion-safe:active:scale-[0.98] text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-on-accent rounded-lg font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="touch-target motion-control motion-safe:active:scale-[0.98] px-4 py-2 border border-border-strong text-fg hover:bg-surface-muted font-semibold rounded-lg text-sm"
            >
              New Game
            </button>
          </>
        }
        topCard={
          <PlayerCard
            name={isLocal ? capitalize(topColor) : 'Bot'}
            initial={isLocal ? capitalize(topColor)[0] : 'B'}
            active={isLocal ? liveState.currentTurn === topColor && !gameOverMsg : isThinking}
            subline={
              isLocal
                ? liveState.currentTurn === topColor && !gameOverMsg
                  ? 'to move'
                  : `Playing ${topColor}`
                : isThinking
                  ? `${targetElo} · thinking…`
                  : `${targetElo} · ${eloLabel(targetElo)}`
            }
            captured={
              <CapturedTray
                pieces={material[topColor]}
                color={bottomColor}
                advantage={topColor === 'white' ? whiteLead : -whiteLead}
                ownerLabel={isLocal ? capitalize(topColor) : 'Bot'}
              />
            }
          />
        }
        board={
          <div className="relative">
            <ChessBoard
              gameState={displayState}
              onMove={handleMove}
              playerColor={playerColor}
              orientation={orientation}
              showCoordinates={true}
              legalMovesMap={isAtLive && !isThinking ? legalMovesMap : undefined}
              // Inert until the worker has sent its first position. Before that the
              // timeline is empty, so `handleMove` drops every move — but without a
              // legal-move map the board works its own out and lets a piece be
              // picked up and put down, and on a slow load a first move vanished
              // as if it had never been made.
              interactive={engineReady && timeline.length > 0}
              // Line up a reply while the bot thinks. Off while reviewing history
              // (the board isn't showing the live position) or after a manual end.
              // Nobody to pre-empt in pass-and-play: the next mover is sitting
              // right there and moves on the same board.
              allowPremoves={!isLocal && isAtLive && !manualEnd}
              onIllegalMove={isAtLive ? handleIllegalMove : undefined}
            />
            {tip && <BoardTip message={tip.message} onDismiss={dismissTip} />}
          </div>
        }
        bottomCard={
          <PlayerCard
            name={isLocal ? capitalize(bottomColor) : 'You'}
            initial={isLocal ? capitalize(bottomColor)[0] : 'Y'}
            isYou={!isLocal}
            // The rating is the tell that the game is rated; it is absent from a
            // casual one. Pass-and-play has no single player to rate.
            rating={ratedEffective ? userRating?.rating : undefined}
            active={isLocal ? liveState.currentTurn === bottomColor && !gameOverMsg : yourTurn}
            subline={
              isLocal
                ? liveState.currentTurn === bottomColor && !gameOverMsg
                  ? 'to move'
                  : `Playing ${bottomColor}`
                : `Playing ${playerColor}${yourTurn ? ' · your move' : ''}`
            }
            captured={
              <CapturedTray
                pieces={material[bottomColor]}
                color={topColor}
                advantage={bottomColor === 'white' ? whiteLead : -whiteLead}
                ownerLabel={isLocal ? capitalize(bottomColor) : 'You'}
              />
            }
          />
        }
        actions={
          <GameActions
            className="shrink-0"
            onAbort={liveState.moveHistory.length < ABORT_MOVE_LIMIT ? abortGame : undefined}
            onDraw={() => endManually('draw')}
            onResign={() => endManually('resign')}
            onFlip={() => setFlipped(f => !f)}
            disabled={!!gameOverMsg}
          />
        }
        moveStrip={
          <MoveStrip
            items={numberedStripItems(movePairs.flatMap((p) => [p.white?.text, p.black?.text].filter((t): t is string => !!t)))}
            current={viewIndex}
            onJump={setViewIndex}
            fullListId={GAME_SIDEBAR_ID}
          />
        }
        sidebar={
          <>
            {/* No status banner: the player cards flanking the board already
                carry whose turn it is (pulse + subline), and the result gets
                its own celebration screen. */}

            {/* Game facts */}
            <div className="shrink-0 bg-white/[0.04] rounded-xl border border-white/10 p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className={`flex gap-1.5 ${isLocal ? 'hidden' : ''}`}>
                  <span className="text-fg-muted">ELO:</span>
                  <span className="font-semibold text-fg">
                    {targetElo}
                    <span className="text-xs font-normal text-fg-muted ml-1">
                      ({eloLabel(targetElo)})
                    </span>
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Playing:</span>
                  <span className="font-semibold text-fg capitalize">{playerColor}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Turn:</span>
                  <span className="font-semibold text-fg capitalize">{liveState.currentTurn}</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="text-fg-muted">Move:</span>
                  <span className="font-semibold text-fg">{liveState.fullMoveNumber}</span>
                </div>
              </div>
            </div>

            {/* Move list with navigation */}
            <ChessMoveList
              className="flex-1 min-h-0"
              movePairs={movePairs}
              currentIndex={viewIndex}
              onJump={setViewIndex}
              onFirst={() => setViewIndex(0)}
              onPrev={() => setViewIndex(i => Math.max(0, i - 1))}
              onNext={() => setViewIndex(i => Math.min(timeline.length - 1, i + 1))}
              onLast={() => setViewIndex(timeline.length - 1)}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              emptyMessage="No moves yet — make your first move"
            />

          </>
        }
      />

      <GameResultScreen
        // Hidden while review is open: the result screen sits above it and its
        // backdrop would swallow every click meant for the panel.
        open={!!myResult && !reviewing}
        result={myResult ?? 'draw'}
        title={localResultTitle}
        subtitle={gameOverMsg ?? undefined}
        rating={
          ratingResult
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta, ladder: 'practice' }
            : undefined
        }
        actions={
          <ResultActions
            onRematch={handleRematch}
            onReview={() => setReviewing(true)}
            onChangeSetup={handleNewGame}
            backHref="/chess"
            backLabel="Back to Chess"
          />
        }
      />

      {reviewing && (
        <ReviewPanel
          adapter={reviewAdapter}
          moves={sanMoves}
          board={
            <ChessBoard
              gameState={displayState}
              // Required by the board's props, but `interactive={false}` means
              // no gesture can ever reach it.
              onMove={() => {}}
              playerColor={playerColor}
              orientation={orientation}
              showCoordinates={true}
              interactive={false}
            />
          }
          viewIndex={viewIndex}
          onSeek={setViewIndex}
          total={timeline.length}
          playerColor={playerColor}
          // No "you" in pass-and-play — tally both sides evenly.
          showBothSides={isLocal}
          evaluation={analysis.current}
          grades={analysis.grades}
          summary={analysis.summary}
          scanning={analysis.scanning}
          progress={analysis.progress}
          complete={analysis.complete}
          // The WASM engine has to download and hand-shake on the first review of
          // a session; showing that as "busy" is closer to the truth than an
          // empty eval.
          liveBusy={analysis.liveBusy || !reviewEngineReady}
          error={analysis.error}
          onScan={analysis.scan}
          onStopScan={analysis.stopScan}
          onExit={() => setReviewing(false)}
        />
      )}
    </>
  );
}
