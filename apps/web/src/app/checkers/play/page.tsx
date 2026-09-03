'use client';

import { useCallback, useEffect } from 'react';
import { redirect }  from 'next/navigation';
import { CheckersBoard }  from '@/components/checkers/CheckersBoard';
import { useGameSession } from '@finesse/client';
import { GameLayout }     from '@/components/game/GameLayout';
import { formatClockShort } from '@finesse/shared';
import type { CheckersGameState, TimeControl } from '@finesse/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz',    label: 'Fast',   desc: '15s per move' },
];

export default function CheckersPlayPage() {
  const s = useGameSession('checkers', 'movetime');
  const { sendMove } = s;

  // Stable identity so the memoized board skips the 100 ms clock re-renders.
  const handleMove = useCallback(
    (from: string, to: string) => sendMove({ type: 'checkers', from, to }),
    [sendMove],
  );

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
            onMove={handleMove}
            playerColor={s.myColor ?? 'white'}
            // Queue a move while the opponent thinks. Only in a live game:
            // with no active game there is no turn to premove against.
            allowPremoves={s.status === 'active'}
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
