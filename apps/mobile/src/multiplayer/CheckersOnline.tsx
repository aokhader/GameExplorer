import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useGameSession } from '@finesse/client';
import { formatClockShort } from '@finesse/shared';
import type { CheckersGameState, TimeControl } from '@finesse/shared';
import { COLORS, useThemeName } from '@finesse/ui';
import { CheckersBoard } from '@/board/CheckersBoard';
import { FONTS } from '@/theme/typography';
import { OnlineGameLayout } from './OnlineGameLayout';
import { useInviteAccept } from './useInviteAccept';
import type { TimeControlOption } from './MatchmakingPanel';

/** Checkers is clocked per move, matching web's `/checkers/play`. */
const TIME_CONTROLS: TimeControlOption[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz', label: 'Fast', desc: '15s per move' },
];

const DEFAULT_TIME_CONTROL: TimeControl = 'movetime';

/** Online checkers — see `ChessOnline` for the shape all three of these share. */
export function CheckersOnline({
  inviteId,
  onExit,
}: {
  inviteId: string | null;
  onExit: () => void;
}) {
  const s = useGameSession('checkers', DEFAULT_TIME_CONTROL);
  useInviteAccept(s, inviteId);

  const [flipped, setFlipped] = useState(false);
  const { sendMove } = s;

  // Stable identity so the memoized board skips the 100ms clock re-renders.
  const handleMove = useCallback(
    (from: string, to: string) => sendMove({ type: 'checkers', from, to }),
    [sendMove],
  );

  const state = s.gameState as CheckersGameState | null;
  const myColor = s.myColor ?? 'white';
  const boardColor: 'white' | 'black' = flipped
    ? myColor === 'white'
      ? 'black'
      : 'white'
    : myColor;

  return (
    <OnlineGameLayout
      session={s}
      accent="checkers"
      title="Online Checkers"
      backHref="/"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockShort}
      onFlipBoard={() => setFlipped((f) => !f)}
      onExit={onExit}
      board={
        state && (
          <CheckersBoard
            gameState={state}
            onMove={handleMove}
            playerColor={boardColor}
            interactive={s.status === 'active'}
            premoveColor={s.status === 'active' ? myColor : undefined}
          />
        )
      }
      moveList={state && <CheckersMoveList state={state} />}
    />
  );
}

function CheckersMoveList({ state }: { state: CheckersGameState }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  if (state.moveHistory.length === 0) {
    return (
      <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: 13 }}>
        No moves yet.
      </Text>
    );
  }

  return (
    <View>
      {state.moveHistory.map((m, i) => (
        <Text key={i} style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 13 }}>
          {i + 1}. {m.from}→{m.to}
          {m.captures.length > 0 ? ` ×${m.captures.length}` : ''}
        </Text>
      ))}
    </View>
  );
}
