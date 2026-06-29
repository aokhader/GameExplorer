'use client';

import { useEffect } from 'react';
import { redirect }  from 'next/navigation';
import { ChessBoard } from '@/components/chess/ChessBoard';
import '@/components/chess/ChessBoard.css';
import { useGameSession } from '@gameexplorer/client';
import { GameLayout } from '@/components/game/GameLayout';
import { formatClockLong } from '@gameexplorer/shared';
import type { ChessGameState, TimeControl } from '@gameexplorer/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'bullet',    label: 'Bullet',    desc: '1 min'      },
  { id: 'blitz',     label: 'Blitz',     desc: '3 min +2s'  },
  { id: 'rapid',     label: 'Rapid',     desc: '10 min'     },
  { id: 'classical', label: 'Classical', desc: '30 min'     },
];

export default function ChessPlayPage() {
  const s = useGameSession('chess', 'blitz');

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

  if (s.loading || !s.user) return null;

  const chessState = s.gameState as ChessGameState | null;

  return (
    <GameLayout
      session={s}
      title="Online Chess"
      backHref="/chess"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockLong}
      lowClockMs={30_000}
      board={
        chessState && (
          <ChessBoard
            gameState={chessState}
            onMove={(from, to, promotion) => s.sendMove({ type: 'chess', from, to, promotion })}
            playerColor={s.myColor ?? 'white'}
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
