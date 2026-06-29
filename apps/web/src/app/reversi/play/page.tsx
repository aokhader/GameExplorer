'use client';

import { useEffect } from 'react';
import { redirect }  from 'next/navigation';
import { ReversiBoard }   from '@/components/reversi/ReversiBoard';
import { useGameSession } from '@gameexplorer/client';
import { GameLayout }     from '@/components/game/GameLayout';
import { formatClockShort } from '@gameexplorer/shared';
import type { ReversiGameState, TimeControl } from '@gameexplorer/shared';

const TIME_CONTROLS: { id: TimeControl; label: string; desc: string }[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz',    label: 'Fast',   desc: '15s per move' },
];

export default function ReversiPlayPage() {
  const s = useGameSession('reversi', 'movetime');

  useEffect(() => {
    if (!s.loading && !s.user) redirect('/auth/signin?next=/reversi/play');
  }, [s.user, s.loading]);

  useEffect(() => {
    if (!s.connected) return;
    const inviteId = new URLSearchParams(window.location.search).get('invite');
    if (inviteId) s.acceptInvite(inviteId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.connected]);

  if (s.loading || !s.user) return null;

  const reversiState = s.gameState as ReversiGameState | null;
  const discCounts   = reversiState
    ? {
        black: reversiState.board.flat().filter(c => c?.color === 'black').length,
        white: reversiState.board.flat().filter(c => c?.color === 'white').length,
      }
    : { black: 2, white: 2 };
  const lastPos = reversiState && reversiState.moveHistory.length > 0
    ? reversiState.moveHistory[reversiState.moveHistory.length - 1].position ?? undefined
    : undefined;

  return (
    <GameLayout
      session={s}
      title="Online Reversi"
      backHref="/reversi"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockShort}
      showDraw={false}
      topExtras={
        <div className="flex items-center gap-3 bg-surface-alt border border-border rounded-lg px-4 py-2">
          <span className="text-sm">⚫ {discCounts.black}</span>
          <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all"
              style={{ width: `${(discCounts.white / (discCounts.white + discCounts.black)) * 100}%` }}
            />
          </div>
          <span className="text-sm">⚪ {discCounts.white}</span>
        </div>
      }
      board={
        reversiState && (
          <ReversiBoard
            gameState={reversiState}
            onMove={(position) => s.sendMove({ type: 'reversi', position })}
            playerColor={s.myColor ?? 'black'}
            highlightPos={lastPos}
          />
        )
      }
      moveList={reversiState?.moveHistory.map((m, i) => (
        <div key={i} className="text-fg-muted">
          {i + 1}. {m.color[0].toUpperCase()} {m.position ?? '(pass)'} {m.flipped.length > 0 ? `+${m.flipped.length}` : ''}
        </div>
      ))}
    />
  );
}
