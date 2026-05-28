'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChessEngine, ChessGameState, Position, PieceType,
  stateToFen, fenToState,
} from '@gameexplorer/shared';
import type { Piece, Color } from '@gameexplorer/shared';
import { ChessPiece } from '@gameexplorer/ui';
import { ChessBoard } from '@/components/chess/ChessBoard';
import type { BoardArrow } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { ChessMoveList, buildMovePairs } from '@/components/chess/ChessMoveList';
import { useStockfishAnalysis } from '@/hooks/useStockfishAnalysis';

type Mode = 'edit' | 'analyze';

const PIECE_TYPES: PieceType[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const EMPTY_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

// ── Eval bar ──────────────────────────────────────────────────────────────────

function EvalBar({ cp, mate, turn }: { cp: number | null; mate: number | null; turn: 'white' | 'black' }) {
  const sign = turn === 'white' ? 1 : -1;
  let blackPct = 50;
  if (mate !== null) {
    blackPct = (mate * sign) > 0 ? 5 : 95;
  } else if (cp !== null) {
    blackPct = 50 - Math.max(-45, Math.min(45, (cp * sign) / 22.2));
  }
  return (
    <div className="w-5 self-stretch rounded overflow-hidden shadow-inner border border-slate-400 dark:border-slate-600 relative bg-white">
      <div
        className="absolute top-0 left-0 right-0 bg-slate-900 dark:bg-slate-950"
        style={{ height: `${blackPct}%`, transition: 'height 0.45s ease-out' }}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const [mode, setMode] = useState<Mode>('edit');

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const [editState, setEditState] = useState<ChessGameState>(() => ChessEngine.newGame());
  /** null = browse/show-moves mode, otherwise the palette piece to place */
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [eraserMode, setEraserMode] = useState(false);
  const [fenInput, setFenInput] = useState(() => stateToFen(ChessEngine.newGame()));
  const [fenError, setFenError] = useState<string | null>(null);

  // ── Analyze mode ───────────────────────────────────────────────────────────
  // timeline[0] = starting position, timeline[n] = state after n moves
  const [timeline, setTimeline] = useState<ChessGameState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);

  // ── Shared ─────────────────────────────────────────────────────────────────
  const [flipBoard, setFlipBoard] = useState(false);
  const [copied, setCopied] = useState(false);

  const stockfish = useStockfishAnalysis();

  // Sync FEN input with editState in edit mode
  useEffect(() => {
    if (mode === 'edit') setFenInput(stateToFen(editState));
  }, [editState, mode]);

  // Trigger Stockfish when position changes in analyze mode
  const currentAnalyzeState = timeline[currentIndex] ?? null;
  useEffect(() => {
    if (mode !== 'analyze' || !currentAnalyzeState || !stockfish.isReady) {
      if (mode === 'edit') stockfish.stop();
      return;
    }
    if (analysisEnabled) {
      stockfish.analyze(stateToFen(currentAnalyzeState));
    } else {
      stockfish.stop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAnalyzeState, mode, stockfish.isReady, analysisEnabled]);

  // ── Mode switching ──────────────────────────────────────────────────────────

  const handleEnterAnalyze = () => {
    setTimeline([editState]);
    setCurrentIndex(0);
    setMode('analyze');
  };

  const handleEnterEdit = () => {
    stockfish.stop();
    setTimeline([]);
    setCurrentIndex(0);
    setMode('edit');
  };

  // ── Edit mode handlers ──────────────────────────────────────────────────────

  const handleEditSquareClick = useCallback((pos: Position) => {
    const col = pos.charCodeAt(0) - 97;
    const row = parseInt(pos[1]) - 1;

    setEditState(prev => {
      const newBoard = prev.board.map(r => [...r]);
      const existing = newBoard[row][col];

      if (eraserMode) {
        newBoard[row][col] = null;
      } else if (selectedPiece) {
        // Toggle off if clicking the exact same piece type+color; otherwise place
        if (existing?.type === selectedPiece.type && existing?.color === selectedPiece.color) {
          newBoard[row][col] = null;
        } else {
          newBoard[row][col] = { ...selectedPiece };
        }
      }
      // If neither eraserMode nor selectedPiece, do nothing — browse mode handled by ChessBoard
      return { ...prev, board: newBoard };
    });
  }, [selectedPiece, eraserMode]);

  const handleFenInput = (raw: string) => {
    setFenInput(raw);
    try {
      setEditState(fenToState(raw));
      setFenError(null);
    } catch {
      setFenError('Invalid FEN');
    }
  };

  const handleResetToStart = () => {
    const s = ChessEngine.newGame();
    setEditState(s);
    setFenInput(stateToFen(s));
    setFenError(null);
    setSelectedPiece(null);
    setEraserMode(false);
  };

  const handleClearBoard = () => {
    try {
      const s = fenToState(EMPTY_FEN);
      setEditState(s);
      setFenInput(EMPTY_FEN);
      setFenError(null);
    } catch { /* hard-coded FEN, can't fail */ }
  };

  // ── Analyze mode handlers ───────────────────────────────────────────────────

  const handleAnalyzeMove = (from: Position, to: Position, promotion?: PieceType) => {
    const state = timeline[currentIndex];
    if (!state) return;
    const r = ChessEngine.validateMove(state, from, to, false, promotion);
    if (r.valid && r.resultingState) {
      const newTimeline = [...timeline.slice(0, currentIndex + 1), r.resultingState];
      setTimeline(newTimeline);
      setCurrentIndex(newTimeline.length - 1);
    }
  };

  const handlePrev = () => setCurrentIndex(i => Math.max(0, i - 1));
  const handleNext = () => setCurrentIndex(i => Math.min(timeline.length - 1, i + 1));
  const handleJump = (index: number) => setCurrentIndex(index);

  const handleCopyFen = () => {
    const fen = mode === 'analyze' && currentAnalyzeState
      ? stateToFen(currentAnalyzeState)
      : stateToFen(editState);
    navigator.clipboard.writeText(fen).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const activeState = mode === 'analyze'
    ? (currentAnalyzeState ?? ChessEngine.newGame())
    : editState;

  const { cp, mate, bestMove, pv, depth } = stockfish.result;
  const sign = activeState.currentTurn === 'white' ? 1 : -1;

  // Gate all display values on the toggle so disabling instantly clears the UI
  const activeCp = analysisEnabled ? cp : null;
  const activeMate = analysisEnabled ? mate : null;
  const activeBestMove = analysisEnabled ? bestMove : null;
  const activePv = analysisEnabled ? pv : [];

  let evalText = '—';
  if (mode === 'analyze' && stockfish.isReady && analysisEnabled) {
    if (activeMate !== null) {
      const wm = activeMate * sign;
      evalText = wm > 0 ? `Mate in ${Math.abs(wm)}` : `Mated in ${Math.abs(wm)}`;
    } else if (activeCp !== null) {
      const wCp = activeCp * sign;
      evalText = wCp > 0 ? `+${(wCp / 100).toFixed(2)}` : wCp < 0 ? `${(wCp / 100).toFixed(2)}` : '0.00';
    } else {
      evalText = stockfish.isAnalyzing ? 'Analyzing…' : '—';
    }
  }

  const arrows: BoardArrow[] = activeBestMove && mode === 'analyze'
    ? [{ from: activeBestMove.from, to: activeBestMove.to }]
    : [];

  const movePairs = buildMovePairs(timeline);

  const isInPlacementMode = !!(selectedPiece || eraserMode);

  const statusMsg = activeState.isCheckmate
    ? `Checkmate — ${activeState.currentTurn === 'white' ? 'Black' : 'White'} wins`
    : activeState.isStalemate ? 'Stalemate — Draw'
    : (!activeState.isCheckmate && !activeState.isStalemate && activeState.isDraw) ? 'Draw'
    : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 overflow-hidden">

      {/* Header */}
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <Link
            href="/chess"
            className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Analysis Board</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              mode === 'edit'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
            }`}>
              {mode === 'edit' ? 'Edit Position' : 'Stockfish Analysis'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFlipBoard(f => !f)}
              className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Flip board"
            >
              ⇅
            </button>
            {mode === 'edit' ? (
              <button
                onClick={handleEnterAnalyze}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                Analyze
              </button>
            ) : (
              <button
                onClick={handleEnterEdit}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                Edit Position
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="container mx-auto px-3 py-3 h-full">
          <div className="grid grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[1fr_380px] lg:grid-rows-1 gap-3 h-full">

            {/* Board column */}
            <div className="flex items-center justify-center min-h-0">
              <div className="flex items-stretch gap-2 justify-center">
                {mode === 'analyze' && (
                  <EvalBar cp={activeCp} mate={activeMate} turn={activeState.currentTurn} />
                )}
                <div>
                  <ChessBoard
                    gameState={activeState}
                    onMove={mode === 'analyze' ? handleAnalyzeMove : () => {}}
                    playerColor={flipBoard ? 'black' : 'white'}
                    showCoordinates
                    // Placement/erase mode: clicks route through onSquareClick
                    editMode={mode === 'edit' && isInPlacementMode}
                    onSquareClick={handleEditSquareClick}
                    // Browse mode (nothing selected): show moves for any piece, no execution
                    allowSelectAnyColor={mode === 'edit' && !isInPlacementMode}
                    arrows={arrows}
                  />
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pb-2">

              {mode === 'edit' ? (
                <>
                  {/* ── Piece palette ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                      {isInPlacementMode
                        ? (eraserMode ? 'Eraser active — click a square to remove' : `Placing: ${selectedPiece?.color} ${selectedPiece?.type}`)
                        : 'Click a piece to place it, or click on the board to preview moves'}
                    </p>

                    {/* White pieces row */}
                    <div className="flex gap-2 mb-2">
                      {PIECE_TYPES.map(type => {
                        const active = !eraserMode && selectedPiece?.type === type && selectedPiece?.color === 'white';
                        return (
                          <button
                            key={`white-${type}`}
                            onClick={() => {
                              setSelectedPiece(active ? null : { type, color: 'white' });
                              setEraserMode(false);
                            }}
                            className={`flex-1 aspect-square flex items-center justify-center rounded-lg transition-all border-2 min-w-[44px] min-h-[44px] ${
                              active
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 scale-110 shadow-md'
                                : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                            title={`white ${type}`}
                          >
                            <ChessPiece type={type} color="white" size="85%" />
                          </button>
                        );
                      })}
                    </div>

                    {/* Black pieces row */}
                    <div className="flex gap-2 mb-3">
                      {PIECE_TYPES.map(type => {
                        const active = !eraserMode && selectedPiece?.type === type && selectedPiece?.color === 'black';
                        return (
                          <button
                            key={`black-${type}`}
                            onClick={() => {
                              setSelectedPiece(active ? null : { type, color: 'black' });
                              setEraserMode(false);
                            }}
                            className={`flex-1 aspect-square flex items-center justify-center rounded-lg transition-all border-2 min-w-[44px] min-h-[44px] ${
                              active
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/40 scale-110 shadow-md'
                                : 'border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                            title={`black ${type}`}
                          >
                            <ChessPiece type={type} color="black" size="85%" />
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => { setEraserMode(e => !e); setSelectedPiece(null); }}
                      className={`w-full py-2 rounded-lg text-sm font-medium transition-all border-2 ${
                        eraserMode
                          ? 'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                          : 'border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-red-300 hover:text-red-500'
                      }`}
                    >
                      {eraserMode ? '✕ Cancel Eraser' : '⌫ Eraser'}
                    </button>
                  </div>

                  {/* ── Position settings ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Position Settings</p>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Side to move</p>
                    <div className="flex gap-2 mb-3">
                      {(['white', 'black'] as Color[]).map(c => (
                        <button
                          key={c}
                          onClick={() => setEditState(p => ({ ...p, currentTurn: c }))}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all border-2 ${
                            editState.currentTurn === c
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                              : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                          }`}
                        >
                          {c === 'white' ? '⬜ White' : '⬛ Black'}
                        </button>
                      ))}
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">Castling rights</p>
                    <div className="grid grid-cols-2 gap-1">
                      {([
                        ['whiteKingSide', 'White O-O'],
                        ['whiteQueenSide', 'White O-O-O'],
                        ['blackKingSide', 'Black O-O'],
                        ['blackQueenSide', 'Black O-O-O'],
                      ] as [keyof ChessGameState['castlingRights'], string][]).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none py-0.5">
                          <input
                            type="checkbox"
                            checked={editState.castlingRights[key]}
                            onChange={e => setEditState(p => ({ ...p, castlingRights: { ...p.castlingRights, [key]: e.target.checked } }))}
                            className="rounded accent-blue-500"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* ── FEN ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">FEN String</p>
                    <textarea
                      value={fenInput}
                      onChange={e => handleFenInput(e.target.value)}
                      className={`w-full text-xs font-mono rounded-lg px-2.5 py-2 border resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 ${
                        fenError ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-slate-600'
                      }`}
                      rows={3}
                      spellCheck={false}
                    />
                    {fenError && <p className="text-xs text-red-500 mt-1">{fenError}</p>}
                  </div>

                  {/* ── Actions ── */}
                  <div className="flex gap-2">
                    <button onClick={handleResetToStart} className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      Reset to Start
                    </button>
                    <button onClick={handleClearBoard} className="flex-1 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                      Clear Board
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* ── Stockfish eval ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Stockfish</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium tabular-nums ${
                          !stockfish.isReady
                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            : !analysisEnabled
                              ? 'bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500'
                              : stockfish.isAnalyzing
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                                : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400'
                        }`}>
                          {!stockfish.isReady ? 'loading' : !analysisEnabled ? 'off' : stockfish.isAnalyzing ? `depth ${depth}` : `d${depth} ✓`}
                        </span>
                        {/* Toggle switch */}
                        <button
                          role="switch"
                          aria-checked={analysisEnabled}
                          aria-label="Toggle Stockfish analysis"
                          onClick={() => setAnalysisEnabled(v => !v)}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
                            analysisEnabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                            analysisEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    </div>
                    <div className="text-3xl font-bold tabular-nums text-slate-800 dark:text-slate-100 mb-1">{evalText}</div>
                    {/* Always rendered so height stays stable during analysis */}
                    <div className={`text-sm text-slate-600 dark:text-slate-400 ${activeBestMove ? '' : 'invisible'}`}>
                      Best:{' '}
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">
                        {activeBestMove
                          ? `${activeBestMove.from}–${activeBestMove.to}${activeBestMove.promotion ? `=${activeBestMove.promotion[0].toUpperCase()}` : ''}`
                          : '—'}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-xs font-mono truncate ${activePv.length > 1 ? 'text-slate-400 dark:text-slate-500' : 'invisible'}`}>
                      {activePv.length > 1 ? activePv.slice(1, 7).join(' ') : '—'}
                    </p>
                  </div>

                  {/* ── Navigation + move list ── */}
                  <ChessMoveList
                    movePairs={movePairs}
                    currentIndex={currentIndex}
                    onJump={handleJump}
                    onFirst={() => handleJump(0)}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    onLast={() => handleJump(timeline.length - 1)}
                    canGoBack={currentIndex > 0}
                    canGoForward={currentIndex < timeline.length - 1}
                    scrollHeight="max-h-48"
                    emptyMessage="No moves yet — play on the board"
                  />

                  {/* ── FEN ── */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">FEN</p>
                      <button
                        onClick={handleCopyFen}
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      >
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all select-all leading-relaxed">
                      {stateToFen(activeState)}
                    </p>
                  </div>

                  {/* ── Game status ── */}
                  {statusMsg && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-sm font-semibold text-amber-700 dark:text-amber-300 text-center">
                      {statusMsg}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
