import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useGameSession } from '@gameexplorer/client';
import { ReversiEngine, formatClockShort } from '@gameexplorer/shared';
import type { ReversiGameState, TimeControl } from '@gameexplorer/shared';
import { COLORS, REVERSI_DISC_COLORS, useThemeName } from '@gameexplorer/ui';
import { ReversiBoard } from '@/board/ReversiBoard';
import { FONTS } from '@/theme/typography';
import { OnlineGameLayout } from './OnlineGameLayout';
import { useInviteAccept } from './useInviteAccept';
import type { TimeControlOption } from './MatchmakingPanel';

const TIME_CONTROLS: TimeControlOption[] = [
  { id: 'movetime', label: 'Normal', desc: '30s per move' },
  { id: 'blitz', label: 'Fast', desc: '15s per move' },
];

const DEFAULT_TIME_CONTROL: TimeControl = 'movetime';

/**
 * Online reversi. Two things are missing on purpose, matching web and matching
 * single-player mobile: there is no board flip, because `playerColor` is also
 * the board's tap gate, and there are no draw offers, because a reversi game
 * always ends on a disc count.
 */
export function ReversiOnline({
  inviteId,
  onExit,
}: {
  inviteId: string | null;
  onExit: () => void;
}) {
  const s = useGameSession('reversi', DEFAULT_TIME_CONTROL);
  useInviteAccept(s, inviteId);

  const { sendMove } = s;

  // Stable identity so the memoized board skips the 100ms clock re-renders.
  const handleMove = useCallback(
    (position: string) => sendMove({ type: 'reversi', position }),
    [sendMove],
  );

  const state = s.gameState as ReversiGameState | null;
  const lastPos =
    state && state.moveHistory.length > 0
      ? state.moveHistory[state.moveHistory.length - 1].position
      : null;

  return (
    <OnlineGameLayout
      session={s}
      accent="reversi"
      title="Online Reversi"
      backHref="/"
      timeControls={TIME_CONTROLS}
      clockFormat={formatClockShort}
      showDraw={false}
      onExit={onExit}
      topExtras={state && <DiscCountBar state={state} />}
      board={
        state && (
          <ReversiBoard
            gameState={state}
            onMove={handleMove}
            playerColor={s.myColor ?? 'black'}
            interactive={s.status === 'active'}
            highlightPos={lastPos}
          />
        )
      }
      moveList={state && <ReversiMoveList state={state} />}
    />
  );
}

/** Live disc count — reversi's score, and the only way to read who is ahead. */
function DiscCountBar({ state }: { state: ReversiGameState }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const counts = ReversiEngine.getDiscCounts(state);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        paddingVertical: 10,
      }}
    >
      <Disc
        color={REVERSI_DISC_COLORS.black.fill}
        border={REVERSI_DISC_COLORS.black.stroke}
        count={counts.black}
        label="Black"
      />
      <Text style={{ color: COLORS.fgMuted, fontSize: 12 }}>vs</Text>
      <Disc
        color={REVERSI_DISC_COLORS.white.fill}
        border={REVERSI_DISC_COLORS.white.stroke}
        count={counts.white}
        label="White"
      />
    </View>
  );
}

function Disc({
  color,
  border,
  count,
  label,
}: {
  color: string;
  border: string;
  count: number;
  label: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View
      accessibilityLabel={`${label}: ${count} discs`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: 7,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: border,
        }}
      />
      <Text style={{ color: COLORS.fg, fontSize: 13, fontFamily: FONTS.bodyBold }}>{count}</Text>
    </View>
  );
}

function ReversiMoveList({ state }: { state: ReversiGameState }) {
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
          {i + 1}. {m.color[0].toUpperCase()} {m.position ?? '(pass)'}
          {m.flipped.length > 0 ? ` +${m.flipped.length}` : ''}
        </Text>
      ))}
    </View>
  );
}
