'use client';

import { useRef, useEffect } from 'react';
import type { ChessGameState } from '@gameexplorer/shared';

export function getMoveText(stateBefore: ChessGameState, stateAfter: ChessGameState): string {
  const history = stateAfter.moveHistory;
  if (history.length === 0) return '';
  const move = history[history.length - 1];

  if (move.isCastling) return move.castlingSide === 'kingside' ? 'O-O' : 'O-O-O';

  const piece = stateBefore.board[parseInt(move.from[1]) - 1][move.from.charCodeAt(0) - 97];
  if (!piece) return `${move.from}–${move.to}`;

  const LETTERS: Record<string, string> = { king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '' };
  const letter = LETTERS[piece.type] ?? '';
  const isCapture = !!(move.capturedPiece || move.isEnPassant);
  const pawnFile = piece.type === 'pawn' && isCapture ? move.from[0] : '';
  const promo = move.promotion ? `=${move.promotion[0].toUpperCase()}` : '';
  const check = stateAfter.isCheckmate ? '#' : stateAfter.isCheck ? '+' : '';

  return `${letter}${pawnFile}${isCapture ? 'x' : ''}${move.to}${promo}${check}`;
}

export interface MovePair {
  num: number;
  white?: { text: string; idx: number };
  black?: { text: string; idx: number };
}

export function buildMovePairs(timeline: ChessGameState[]): MovePair[] {
  const pairs: MovePair[] = [];
  for (let i = 1; i < timeline.length; i++) {
    const text = getMoveText(timeline[i - 1], timeline[i]);
    const moveNum = Math.ceil(i / 2);
    if (i % 2 === 1) {
      pairs.push({ num: moveNum, white: { text, idx: i } });
    } else {
      const last = pairs[pairs.length - 1];
      if (last) last.black = { text, idx: i };
    }
  }
  return pairs;
}

export interface ChessMoveListProps {
  movePairs: MovePair[];
  currentIndex: number;
  onJump?: (idx: number) => void;
  onFirst?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onLast?: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  emptyMessage?: string;
  /** Tailwind class controlling the scroll area height. Defaults to 'flex-1 min-h-0' (fills flex parent). Pass e.g. 'max-h-48' for a capped sidebar. */
  scrollHeight?: string;
  className?: string;
}

export function ChessMoveList({
  movePairs,
  currentIndex,
  onJump,
  onFirst,
  onPrev,
  onNext,
  onLast,
  canGoBack,
  canGoForward,
  emptyMessage = 'No moves yet',
  scrollHeight = 'flex-1 min-h-0',
  className = '',
}: ChessMoveListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const active = container.querySelector('[data-active="true"]') as HTMLElement | null;
    if (!active) return;
    // Scroll only within the list container — never the page.
    const top = active.offsetTop - container.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < container.scrollTop) {
      container.scrollTop = top;
    } else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight;
    }
  }, [currentIndex]);

  const navBtn = (disabled: boolean) =>
    `flex-1 py-2.5 text-fg-muted hover:bg-white/5 hover:text-fg transition-colors text-lg font-bold border-r border-white/10 last:border-r-0${disabled ? ' opacity-30 cursor-not-allowed' : ''}`;

  // Current move gets the design's gold pill; past moves stay quiet.
  const moveBtn = (active: boolean, isWhiteMove: boolean) =>
    `flex-1 text-left px-2 py-0.5 rounded transition-colors ${
      active
        ? 'bg-[color-mix(in_srgb,var(--c-accent)_18%,transparent)] text-[var(--c-accent-text)] font-semibold'
        : isWhiteMove
          ? 'text-fg font-medium hover:bg-white/5'
          : 'text-fg-muted hover:bg-white/5'
    }`;

  return (
    <div className={`bg-white/[0.04] rounded-xl border border-white/10 overflow-hidden flex flex-col ${className}`}>
      <div className="shrink-0 flex items-center border-b border-white/10">
        <button onClick={onFirst} disabled={!canGoBack} className={navBtn(!canGoBack)} title="First move">⇤</button>
        <button onClick={onPrev}  disabled={!canGoBack} className={navBtn(!canGoBack)} title="Previous move">←</button>
        <button onClick={onNext}  disabled={!canGoForward} className={navBtn(!canGoForward)} title="Next move">→</button>
        <button onClick={onLast}  disabled={!canGoForward} className={navBtn(!canGoForward)} title="Last move">⇥</button>
      </div>

      <div ref={scrollRef} className={`overflow-y-auto p-2 ${scrollHeight}`}>
        {movePairs.length === 0 ? (
          <p className="text-xs text-fg-subtle text-center py-2">{emptyMessage}</p>
        ) : (
          <div className="space-y-px">
            {movePairs.map(({ num, white, black }) => (
              <div key={num} className="flex items-center gap-1 text-sm font-mono rounded">
                <span className="text-fg-subtle w-6 text-right shrink-0 text-xs">{num}.</span>
                {white && (
                  <button
                    onClick={() => onJump?.(white.idx)}
                    data-active={currentIndex === white.idx}
                    className={moveBtn(currentIndex === white.idx, true)}
                  >
                    {white.text}
                  </button>
                )}
                {black ? (
                  <button
                    onClick={() => onJump?.(black.idx)}
                    data-active={currentIndex === black.idx}
                    className={moveBtn(currentIndex === black.idx, false)}
                  >
                    {black.text}
                  </button>
                ) : (
                  <span className="flex-1" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
