import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useGameSession } from '@gameexplorer/client';
import { formatClockLong, replayChessMoves, timelineToSan } from '@gameexplorer/shared';
import type { ChessGameState, PieceType, TimeControl } from '@gameexplorer/shared';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { ChessBoard } from '@/board/ChessBoard';
import { FONTS } from '@/theme/typography';
import { OnlineGameLayout } from './OnlineGameLayout';
import { useInviteAccept } from './useInviteAccept';
import type { TimeControlOption } from './MatchmakingPanel';

/** The same four rungs web's `/chess/play` offers. */
const TIME_CONTROLS: TimeControlOption[] = [
  { id: 'bullet', label: 'Bullet', desc: '1 min' },
  { id: 'blitz', label: 'Blitz', desc: '3 min +2s' },
  { id: 'rapid', label: 'Rapid', desc: '10 min' },
  { id: 'classical', label: 'Classical', desc: '30 min' },
];

const DEFAULT_TIME_CONTROL: TimeControl = 'blitz';

/**
 * Online chess. The screen owns only what the platform owns — board
 * orientation, the move payload's shape, and how a chess clock is formatted;
 * everything else comes from `useGameSession`.
 *
 * Chess uses a longer low-time threshold (30s) than the per-move games, because
 * its clocks run for the whole game rather than resetting each move.
 */
export function ChessOnline({ inviteId, onExit }: { inviteId: string | null; onExit: () => void }) {
  const s = useGameSession('chess', DEFAULT_TIME_CONTROL);
  useInviteAccept(s, inviteId);

  const [flipped, setFlipped] = useState(false);
  const { sendMove } = s;

  // Stable identity so the memoized board skips the 100ms clock re-renders.
  const handleMove = useCallback(
    (from: string, to: string, promotion?: PieceType) =>
      sendMove({ type: 'chess', from, to, promotion }),
    [sendMove],
  );

  const state = s.gameState as ChessGameState | null;
  const myColor = s.myColor ?? 'white';
  const boardColor: 'white' | 'black' = flipped
    ? myColor === 'white'
      ? 'black'
      : 'white'
    : myColor;

  return (
    <OnlineGameLayout
      session={s}
      accent="chess"
      title="Online Chess"
      backHref="/"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockLong}
      lowClockMs={30_000}
      onFlipBoard={() => setFlipped((f) => !f)}
      onExit={onExit}
      board={
        state && (
          <ChessBoard
            gameState={state}
            onMove={handleMove}
            playerColor={boardColor}
            interactive={s.status === 'active'}
            // Line up a reply while the opponent thinks — worth most here,
            // where their clock is what's running.
            premoveColor={s.status === 'active' ? myColor : undefined}
          />
        )
      }
      moveList={state && <ChessMoveList state={state} />}
    />
  );
}

/**
 * Moves in SAN — the notation a chess player actually reads.
 *
 * Web's play page prints bare destination squares because the server sends only
 * the current state. Mobile can do better for free: `replayChessMoves` (written
 * for review in Phase 2) rebuilds the positions the game passed through, which
 * is exactly what `timelineToSan` needs for disambiguation, check marks and
 * castling. Memoized on the history, so it costs one replay per move rather
 * than one per clock tick.
 */
function ChessMoveList({ state }: { state: ChessGameState }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const san = useMemo(
    () => timelineToSan(replayChessMoves(state.moveHistory)),
    [state.moveHistory],
  );

  if (san.length === 0) {
    return (
      <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: 13 }}>
        No moves yet.
      </Text>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {san.map((move, i) => (
        <Text
          key={i}
          style={{
            color: i % 2 === 0 ? COLORS.fg : COLORS.fgMuted,
            fontFamily: FONTS.body,
            fontSize: 13,
            marginRight: 8,
          }}
        >
          {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}
          {move}
        </Text>
      ))}
    </View>
  );
}
