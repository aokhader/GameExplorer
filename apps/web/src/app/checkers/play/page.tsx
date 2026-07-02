'use client';

import { useEffect } from 'react';
import { redirect }  from 'next/navigation';
import { CheckersBoard }  from '@/components/checkers/CheckersBoard';
import { useGameSession } from '@gameexplorer/client';
import { GameLayout }     from '@/components/game/GameLayout';
import { formatClockShort } from '@gameexplorer/shared';
import type { CheckersGameState, TimeControl } from '@gameexplorer/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz',    label: 'Fast',   desc: '15s per move' },
];

export default function CheckersPlayPage() {
  const s = useGameSession('checkers', 'movetime');

  useEffect(() => {
    if (!s.loading && !s.user) redirect('/auth/signin?next=/checkers/play');
  }, [s.user, s.loading]);

  useEffect(() => {
    if (!s.connected) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId) s.acceptInvite(inviteId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.connected]);

  if (s.loading || !s.user) return null;

  const checkersState = s.gameState as CheckersGameState | null;

  return (
    <GameLayout
      session={s}
      accent="checkers"
      title="Online Checkers"
      backHref="/checkers"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockShort}
      board={
        checkersState && (
          <CheckersBoard
            gameState={checkersState}
            onMove={(from, to) => s.sendMove({ type: 'checkers', from, to })}
            playerColor={s.myColor ?? 'white'}
          />
        )
      }
      moveList={checkersState?.moveHistory.map((m, i) => (
        <div key={i} className="text-fg-muted">
          {i + 1}. {m.from}→{m.to}{m.captures.length > 0 ? ` ×${m.captures.length}` : ''}
        </div>
      ))}
    />
  );
}
