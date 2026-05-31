'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChessEngine, ChessGameState, Position, PieceType } from '@gameexplorer/shared';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useStockfish, thinkTimeForElo } from '@/hooks/useStockfish';
import { useChessAudio } from '@/hooks/useChessAudio';
import { useAuth } from '@/hooks/useAuth';
import { saveGame } from '@gameexplorer/db';

// ── ELO helpers ────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChessBotPage() {
  const [timeline, setTimeline] = useState<ChessGameState[]>(() => [ChessEngine.newGame()]);
  const [viewIndex, setViewIndex] = useState(0);
  const [targetElo, setTargetElo] = useState(1200);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');
  const [isThinking, setIsThinking] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const stockfish = useStockfish();
  const { playCheck, playCheckmate } = useChessAudio();
  const { user } = useAuth();

  // Refs so async callbacks always see fresh values without stale closures
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const viewIndexRef = useRef(viewIndex);
  viewIndexRef.current = viewIndex;
  const targetEloRef = useRef(targetElo);
  targetEloRef.current = targetElo;

  const liveState = timeline[timeline.length - 1];
  const displayState = timeline[viewIndex];
  const isAtLive = viewIndex === timeline.length - 1;

  useEffect(() => {
    setUserId(user?.id ?? null);
  }, [user]);

  // Trigger bot move when it's the bot's turn
  useEffect(() => {
    if (!gameStarted) return;
    if (liveState.isCheckmate || liveState.isStalemate || liveState.isDraw) return;
    const isBotTurn = liveState.currentTurn !== playerColor;
    if (isBotTurn && !isThinking && stockfish.isReady) {
      makeBotMove();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState, playerColor, gameStarted, isThinking, stockfish.isReady]);

  // Save game when it ends
  useEffect(() => {
    if (!gameStarted) return;
    let result: 'white' | 'black' | 'draw' | null = null;
    if (liveState.isCheckmate) {
      result = liveState.currentTurn === 'white' ? 'black' : 'white';
    } else if (liveState.isStalemate || liveState.isDraw) {
      result = 'draw';
    }
    if (result) {
      saveGame(liveState, playerColor, result, `elo-${targetEloRef.current}`, userId ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveState.isCheckmate, liveState.isStalemate, liveState.isDraw]);

  const makeBotMove = async () => {
    const currentTimeline = timelineRef.current;
    const wasAtLive = viewIndexRef.current === currentTimeline.length - 1;
    const currentLiveState = currentTimeline[currentTimeline.length - 1];
    const elo = targetEloRef.current;

    setIsThinking(true);

    try {
      const [move] = await Promise.all([
        stockfish.getBestMove(currentLiveState, elo),
        new Promise(resolve => setTimeout(resolve, thinkTimeForElo(elo))),
      ]);

      if (move) {
        const result = ChessEngine.validateMove(
          currentLiveState,
          move.from,
          move.to,
          false,
          move.promotion as PieceType | undefined,
        );

        if (result.valid && result.resultingState) {
          const next = result.resultingState;
          const newLength = currentTimeline.length + 1;
          setTimeline(prev => [...prev, next]);
          if (wasAtLive) setViewIndex(newLength - 1);

          if (next.isCheckmate) playCheckmate();
          else if (next.isCheck) playCheck();
        }
      }
    } catch (error) {
      console.error('Bot error:', error);
    } finally {
      setIsThinking(false);
    }
  };

  const handleMove = (from: Position, to: Position, promotionPiece?: PieceType) => {
    if (!isAtLive || isThinking) return;
    if (liveState.currentTurn !== playerColor) return;

    const result = ChessEngine.validateMove(liveState, from, to, false, promotionPiece);
    if (result.valid && result.resultingState) {
      const next = result.resultingState;
      const newIdx = timeline.length;
      setTimeline(prev => [...prev, next]);
      setViewIndex(newIdx);

      if (next.isCheckmate) playCheckmate();
      else if (next.isCheck) playCheck();
    }
  };

  const handleNewGame = () => {
    setTimeline([ChessEngine.newGame()]);
    setViewIndex(0);
    setGameStarted(false);
    setIsThinking(false);
  };

  const handleStartGame = () => {
    setGameStarted(true);
    // The useEffect watching liveState/gameStarted/stockfish.isReady handles
    // triggering the first bot move when the player picks black — no setTimeout needed.
  };

  const movePairs = buildMovePairs(timeline);
  const canGoBack = viewIndex > 0;
  const canGoForward = viewIndex < timeline.length - 1;

  // ── Setup screen ──────────────────────────────────────────────────────────────

  if (!gameStarted) {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 pt-16">
        <div className="container mx-auto px-4 pt-8">
          <Link
            href="/chess"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        <div className="container mx-auto px-4 py-10 max-w-2xl">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-slate-100 mb-8 text-center">
            Play vs Bot
          </h1>

          {/* ELO selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">
              Bot Strength
            </h2>

            {/* ELO display */}
            <div className="text-center mb-6">
              <div className="text-6xl font-bold tabular-nums text-slate-800 dark:text-slate-100 leading-none mb-1">
                {targetElo}
              </div>
              <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                {eloLabel(targetElo)}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
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
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600 bg-slate-200 dark:bg-slate-600"
              />
              <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-1.5 px-0.5">
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
                      ? 'bg-blue-600 text-white font-semibold shadow-md scale-105'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }`}
                >
                  <div className="font-bold">{elo}</div>
                  <div className="text-xs opacity-75 leading-tight">{label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Color selector */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-6">
              Choose Your Color
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setPlayerColor('white')}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'white'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <div className="text-4xl mb-2">♔</div>
                <div className="font-semibold">White</div>
                <div className={`text-sm ${playerColor === 'white' ? 'text-blue-100' : 'text-slate-600 dark:text-slate-400'}`}>
                  You move first
                </div>
              </button>
              <button
                onClick={() => setPlayerColor('black')}
                className={`p-6 rounded-lg transition-all ${
                  playerColor === 'black'
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                <div className="text-4xl mb-2">♚</div>
                <div className="font-semibold">Black</div>
                <div className={`text-sm ${playerColor === 'black' ? 'text-blue-100' : 'text-slate-600 dark:text-slate-400'}`}>
                  Bot moves first
                </div>
              </button>
            </div>
          </div>

          <button
            onClick={handleStartGame}
            className="w-full px-8 py-4 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-lg shadow-lg transition-colors"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // ── Game screen ───────────────────────────────────────────────────────────────

  const gameOverMsg = liveState.isCheckmate
    ? `Checkmate — ${liveState.currentTurn === 'white' ? 'Black' : 'White'} wins`
    : liveState.isStalemate ? 'Stalemate — Draw'
    : liveState.isDraw ? 'Draw'
    : null;

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 overflow-hidden pt-16">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto flex items-center justify-between">
          <Link
            href="/chess"
            className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
          <div className="flex items-center gap-3">
            {isThinking && (
              <span className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">
                Bot thinking…
              </span>
            )}
            {!isAtLive && (
              <button
                onClick={() => setViewIndex(timeline.length - 1)}
                className="text-xs px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
              >
                Live ⇥
              </button>
            )}
            <button
              onClick={handleNewGame}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              New Game
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="container mx-auto h-full px-4 py-4">
          <div className="grid grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[1fr_380px] lg:grid-rows-1 gap-4 h-full max-h-full">

            {/* Board */}
            <div className="flex items-center justify-center min-h-0">
              <div className="w-full max-w-150">
                <ChessBoard
                  gameState={displayState}
                  onMove={handleMove}
                  playerColor={playerColor}
                  showCoordinates={true}
                />
              </div>
            </div>

            {/* Sidebar */}
            <div className="flex flex-col gap-3 min-h-0">
              {/* Info card */}
              <div className="shrink-0 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">ELO:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">
                      {targetElo}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">
                        ({eloLabel(targetElo)})
                      </span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Playing:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{playerColor}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Turn:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{liveState.currentTurn}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Move:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{liveState.fullMoveNumber}</span>
                  </div>
                </div>
                {gameOverMsg && (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 text-sm font-semibold text-center text-amber-700 dark:text-amber-300">
                    {gameOverMsg}
                  </div>
                )}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
