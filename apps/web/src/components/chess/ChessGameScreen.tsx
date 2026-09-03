'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import Link from 'next/link';
import { ChessGameState, Position, PieceType, calculateNewRating, GameOutcome, summarizeMaterial, timelineToSan } from '@finesse/shared';
import { useGameAnalysis } from '@finesse/client/hooks/useGameAnalysis';
import { useChessReviewAdapter } from '@/hooks/useChessReviewAdapter';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { ChessPiece } from '@finesse/ui';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useChessEngine } from '@/hooks/useChessEngine';
import { useStockfish, thinkTimeForElo } from '@/hooks/useStockfish';
import { useAuth } from '@/hooks/useAuth';
import { saveGame, getUserRating, upsertUserRating } from '@/lib/db';
import type { UserRating } from '@/lib/db';
import dynamic from 'next/dynamic';
import type { GameResult } from '@/components/game/GameResultScreen';
import { GameScreenLayout } from '@/components/game/GameScreenLayout';
import { PlayerCard } from '@/components/game/PlayerCard';
import { CapturedTray } from '@/components/game/CapturedTray';
import { GameActions } from '@/components/game/GameActions';
import { RatedToggle } from '@/components/game/RatedToggle';
import { Button } from '@/components/ui';
import { useSettings } from '@/components/providers/SettingsProvider';

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

const ELO_PRESETS = [
  { elo: 600,  label: 'Beginner' },
  { elo: 900,  label: 'Novice'   },
  { elo: 1200, label: 'Club'     },
  { elo: 1500, label: 'Inter.'   },
  { elo: 2000, label: 'Advanced' },
  { elo: 2800, label: 'Master'   },
] as const;

function eloLabel(elo: number): string {
  if (elo < 600)  return 'Beginner';
  if (elo < 800)  return 'Novice';
  if (elo < 1000) return 'Casual';
  if (elo < 1200) return 'Club Player';
  if (elo < 1400) return 'Intermediate';
  if (elo < 1600) return 'Competitive';
  if (elo < 1800) return 'Advanced';
  if (elo < 2000) return 'Expert';
  if (elo < 2200) return 'Candidate Master';
  if (elo < 2400) return 'FIDE Master';
  if (elo < 2600) return 'International Master';
  return 'Grandmaster';
}

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
  const { gameState: liveState, legalMoves: legalMovesMap, isReady: engineReady, makeMove, getBotMove, reset } = useChessEngine();
  const { user } = useAuth();

  // Timeline for replay — grows as the worker confirms each move.
  const [timeline, setTimeline] = useState<ChessGameState[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [targetElo, setTargetElo] = useState(1200);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  // Player-initiated end (design's ½ Draw / Resign pair) — the engine state
  // stays live, but the game is over from the UI's point of view.
  const [manualEnd, setManualEnd] = useState<'resign' | 'draw' | null>(null);
  const [userRating, setUserRating] = useState<UserRating | null>(null);
  const [ratingResult, setRatingResult] = useState<RatingResult | null>(null);
  const [gameSaved, setGameSaved] = useState(false);
  // Rated is opt-out, and needs an account to read/write a rating.
  const [rated, setRated] = useState(true);
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
  const ratedRef        = useRef(rated);
  ratedRef.current      = rated;

  // Deep link from onboarding (?elo=1200&start=1) — preselect strength and skip
  // the setup screen. Read off the URL like /chess/play does for ?invite.
  // Layout effect (not useEffect) so the flip to the game screen commits before
  // the browser paints: on the onboarding navigation the setup screen never
  // flashes, avoiding a layout shift.
  useIsomorphicLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const elo = Number(params.get('elo'));
    if (Number.isFinite(elo) && elo > 0) {
      setTargetElo(Math.min(3000, Math.max(400, Math.round(elo / 25) * 25)));
    }
    if (params.get('start') === '1') setGameStarted(true);
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
    getUserRating(user.id, 'chess').then(setUserRating);
  }, [user]);

  // ── Trigger bot move when it's the bot's turn ───────────────────────────────
  useEffect(() => {
    // Pass-and-play has no bot to move: the second player supplies the reply.
    if (isLocal) return;
    if (!gameStarted || !engineReady) return;
    // Weak bots (< STOCKFISH_MIN_ELO) run in the chess-engine worker and don't
    // need Stockfish; only wait on it when the selected ELO actually uses it.
    if (targetElo >= STOCKFISH_MIN_ELO && !stockfish.isReady) return;
    if (liveState.isCheckmate || liveState.isStalemate || liveState.isDraw || manualEnd) return;
    if (liveState.currentTurn !== playerColor && !isThinking) {
      makeBotMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, stockfish.isReady, engineReady, targetElo, manualEnd]);

  // ── Save game and update rating when it ends ────────────────────────────────
  // One effect for both endings. Resign/draw used to save from its own handler,
  // which meant a resigned game could never carry a rating change — and the two
  // call sites could both fire for one game. Mirrors checkers/reversi.
  useEffect(() => {
    // Pass-and-play is casual by definition — no rating and no saved row. There
    // is no single "player" whose result could be recorded against an account.
    if (isLocal) return;
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

      Promise.all([
        upsertUserRating(uid, newRating, outcome, 'chess'),
        saveGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid, {
          mode: 'rated',
          rating_before: current.rating,
          rating_after: newRating,
        }),
      ]).then(([updatedRating]) => {
        setUserRating(updatedRating);
        setRatingResult({ before: current.rating, after: newRating, delta: rawDelta });
      });
    } else {
      saveGame(liveState, pc, result, `elo-${targetEloRef.current}`, uid ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isCheckmate, liveState.isStalemate, liveState.isDraw, manualEnd]);

  // ── Bot move ────────────────────────────────────────────────────────────────
  const makeBotMove = useCallback(async () => {
    const elo = targetEloRef.current;
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
  const endManually = (kind: 'resign' | 'draw') => {
    if (manualEnd || liveState.isCheckmate || liveState.isStalemate || liveState.isDraw) return;
    setManualEnd(kind);
    setIsThinking(false);
    botMovePendingRef.current = false;
    // The save/rating effect above picks this up — it watches `manualEnd`.
  };

  const handleNewGame = () => {
    setTimeline([]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
    setManualEnd(null);
    setGameSaved(false);
    setRatingResult(null);
    botMovePendingRef.current = false;
    reset(); // worker resets to newGame() and broadcasts STATE_UPDATE
  };

  const handleStartGame = () => {
    setGameStarted(true);
  };

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

  if (!gameStarted) {
    return (
      <div className="min-h-screen page-glow-chess">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/chess"
            className="inline-flex items-center text-fg-muted hover:text-fg transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-fg mb-8 text-center">
            {isLocal ? 'Pass & Play' : 'Play vs Bot'}
          </h1>

          {/* ELO selector — no bot in pass-and-play, so nothing to calibrate. */}
          <div className={`rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6 ${isLocal ? 'hidden' : ''}`}>
            <h2 className="text-2xl font-semibold text-fg mb-6">
              Bot Strength
            </h2>

            {/* ELO display */}
            <div className="text-center mb-6">
              <div className="font-display text-6xl font-bold tabular-nums text-fg leading-none mb-1">
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
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-accent bg-white/10"
              />
              <div className="flex justify-between text-xs text-fg-subtle mt-1.5 px-0.5">
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
                  className={`py-2 px-1 rounded-lg text-center text-sm transition-all ${
                    targetElo === elo
                      ? 'border border-transparent bg-accent [background-image:var(--gradient-accent)] text-on-accent font-semibold [box-shadow:var(--shadow-glow-accent)] scale-105'
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
          <div className="rounded-2xl border border-white/10 bg-surface-alt surface-raised p-8 mb-6">
            <h2 className="text-2xl font-semibold text-fg mb-6">
              {isLocal ? 'Who Sits at the Bottom' : 'Choose Your Color'}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPlayerColor('white')}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'white'
                    ? 'border border-transparent bg-accent [background-image:var(--gradient-accent)] text-on-accent [box-shadow:var(--shadow-glow-accent)] scale-105'
                    : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                }`}
              >
                <div className="flex justify-center mb-2"><ChessPiece type="king" color="white" size={40} /></div>
                <div className="font-semibold">White</div>
                <div className={`text-sm ${playerColor === 'white' ? 'text-on-accent/80' : 'text-fg-muted'}`}>
                  {isLocal ? 'Moves first' : 'You move first'}
                </div>
              </button>
              <button
                onClick={() => setPlayerColor('black')}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'black'
                    ? 'border border-transparent bg-accent [background-image:var(--gradient-accent)] text-on-accent [box-shadow:var(--shadow-glow-accent)] scale-105'
                    : 'bg-white/5 border border-white/10 text-fg hover:bg-white/10'
                }`}
              >
                <div className="flex justify-center mb-2"><ChessPiece type="king" color="black" size={40} /></div>
                <div className="font-semibold">Black</div>
                <div className={`text-sm ${playerColor === 'black' ? 'text-on-accent/80' : 'text-fg-muted'}`}>
                  {isLocal ? 'Moves second' : 'Bot moves first'}
                </div>
              </button>
            </div>
          </div>

          {/* Pass-and-play is casual by definition — nothing to rate. */}
          {!isLocal && (
            <RatedToggle checked={rated} onChange={setRated} gameLabel="chess" userId={userId} />
          )}

          <button
            onClick={handleStartGame}
            className="w-full px-8 py-4 rounded-xl bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-lg [box-shadow:var(--shadow-glow-accent)] hover:brightness-110 transition-all"
          >
            Start Game
          </button>
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
        accent="chess"
        backHref="/chess"
        headerActions={
          <>
            {!isAtLive && (
              <button
                onClick={() => setViewIndex(timeline.length - 1)}
                className="text-xs px-2.5 py-1 bg-accent hover:bg-accent-hover text-on-accent rounded-lg transition-colors font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
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
          <ChessBoard
            gameState={displayState}
            onMove={handleMove}
            playerColor={playerColor}
            orientation={orientation}
            showCoordinates={true}
            legalMovesMap={isAtLive && !isThinking ? legalMovesMap : undefined}
            // Line up a reply while the bot thinks. Off while reviewing history
            // (the board isn't showing the live position) or after a manual end.
            // Nobody to pre-empt in pass-and-play: the next mover is sitting
            // right there and moves on the same board.
            allowPremoves={!isLocal && isAtLive && !manualEnd}
          />
        }
        bottomCard={
          <PlayerCard
            name={isLocal ? capitalize(bottomColor) : 'You'}
            initial={isLocal ? capitalize(bottomColor)[0] : 'Y'}
            isYou={!isLocal}
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

            {/* ½ Draw / Resign — as in the design's in-game sidebar. */}
            <GameActions
              className="shrink-0"
              onDraw={() => endManually('draw')}
              onResign={() => endManually('resign')}
              onFlip={() => setFlipped(f => !f)}
              disabled={!!gameOverMsg}
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
            ? { before: ratingResult.before, after: ratingResult.after, delta: ratingResult.delta }
            : undefined
        }
        actions={
          <>
            <Button size="lg" fullWidth onClick={handleNewGame}>
              Play Again
            </Button>
            <Button size="lg" fullWidth variant="secondary" onClick={() => setReviewing(true)}>
              Review Game
            </Button>
            <Link
              href="/chess"
              className="inline-flex items-center justify-center h-11 px-6 rounded-lg font-semibold bg-surface-muted hover:bg-surface-hover text-fg transition-colors"
            >
              Back to Chess
            </Link>
          </>
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
