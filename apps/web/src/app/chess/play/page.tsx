'use client';

import { useCallback, useEffect } from 'react';
import { redirect }  from 'next/navigation';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { useGameSession } from '@finesse/client';
import { GameLayout } from '@/components/game/GameLayout';
import { GameSkeleton } from '@/components/game/GameSkeleton';
import { formatClockLong } from '@finesse/shared';
import type { ChessGameState, TimeControl, Position, PieceType } from '@finesse/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'bullet',    label: 'Bullet',    desc: '1 min'      },
  { id: 'blitz',     label: 'Blitz',     desc: '3 min +2s'  },
  { id: 'rapid',     label: 'Rapid',     desc: '10 min'     },
  { id: 'classical', label: 'Classical', desc: '30 min'     },
];

export default function ChessPlayPage() {
  const s = useGameSession('chess', 'blitz');
  const { sendMove } = s;

  // Stable identity so the memoized board skips the 100 ms clock re-renders.
  const handleMove = useCallback(
    (from: Position, to: Position, promotion?: PieceType) =>
      sendMove({ type: 'chess', from, to, promotion }),
    [sendMove],
  );

  // Auth guard (web routing).
  useEffect(() => {
    if (!s.loading && !s.user) redirect('/auth/signin?next=/chess/play');
  }, [s.user, s.loading]);

  // Accept an invite link (?invite=<id>) once connected — web reads it off the URL.
  useEffect(() => {
    if (!s.connected) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId) s.acceptInvite(inviteId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.connected]);

  // Match the route's loading.tsx shape while the session resolves, rather than
  // collapsing to a blank frame (skeleton → blank → matchmaking = two shifts).
  if (s.loading || !s.user) return <GameSkeleton />;

  const chessState = s.gameState as ChessGameState | null;

  return (
    <GameLayout
      session={s}
      accent="chess"
      title="Online Chess"
      backHref="/chess"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockLong}
      lowClockMs={30_000}
      board={
        chessState && (
          <ChessBoard
            gameState={chessState}
            onMove={handleMove}
            playerColor={s.myColor ?? 'white'}
            // Queue a move while the opponent thinks — worth most here, where
            // the clock is running. Only in a live game: with no active game
            // there is no turn to premove against.
            allowPremoves={s.status === 'active'}
          />
        )
      }
      moveList={
        <div className="space-y-0.5">
          {chessState?.moveHistory.map((m, i) => (
            <span key={i} className={`inline-block px-1 rounded ${i % 2 === 0 ? 'text-fg' : 'text-fg-muted'}`}>
              {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{m.to}
            </span>
          ))}
        </div>
      }
    />
  );
}
