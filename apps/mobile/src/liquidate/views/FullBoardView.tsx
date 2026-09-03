import { useMemo, useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  LiquidateEngine,
  STAR_SYSTEM_ORDER,
  systemMembers,
  type LiquidateAction,
  type LiquidateGameState,
} from '@finesse/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@finesse/ui';
import { FONTS } from '@/theme/typography';
import { LiquidateBoard, BoardWellCaption } from '../LiquidateBoard';
import { seatColor, systemColor } from '../lqTheme';
import type { PlacedToken } from '@finesse/client/liquidate/useLiquidateWalk';
import { ViewHeader, ViewSection } from './ViewChrome';

const MAX_ZOOM = 2.5;

export interface FullBoardViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
  placed: Record<string, PlacedToken>;
  youSeat: number | null;
  activeTile: number | null;
  roundLabel: string;
}

/**
 * The whole ring, big, plus who controls what.
 *
 * Pinch-to-zoom is not a flourish here: a 44-tile board on a 390pt phone gives
 * each tile about 23pt, under the 44pt touch minimum. `hitSlop` would not fix
 * that — overlapping slop on adjacent 23pt cells makes taps ambiguous — so the
 * board zooms instead, which is what the board screen's "tap to zoom" promises.
 */
export function FullBoardView({
  state,
  placed,
  youSeat,
  activeTile,
  roundLabel,
  onBack,
}: FullBoardViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { width } = useWindowDimensions();
  const P = LIQUIDATE_PANEL_COLORS;

  const [selected, setSelected] = useState<number | null>(null);
  const size = Math.min(width - 36, 336);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  // Built once; every value it touches is a shared value, so it never needs to
  // be rebuilt when props change.
  const gesture = useMemo(() => {
    const clamp = (v: number, lo: number, hi: number) => {
      'worklet';
      return Math.max(lo, Math.min(hi, v));
    };

    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        'worklet';
        scale.value = clamp(savedScale.value * e.scale, 1, MAX_ZOOM);
      })
      .onEnd(() => {
        'worklet';
        savedScale.value = scale.value;
        if (scale.value <= 1.01) {
          scale.value = withTiming(1);
          tx.value = withTiming(0);
          ty.value = withTiming(0);
          savedScale.value = 1;
          savedX.value = 0;
          savedY.value = 0;
        }
      });

    const pan = Gesture.Pan()
      .onUpdate((e) => {
        'worklet';
        // Only pannable once zoomed, and never past the scaled bounds.
        const limit = (size * (scale.value - 1)) / 2;
        tx.value = clamp(savedX.value + e.translationX, -limit, limit);
        ty.value = clamp(savedY.value + e.translationY, -limit, limit);
      })
      .onEnd(() => {
        'worklet';
        savedX.value = tx.value;
        savedY.value = ty.value;
      })
      // Keeps the view scrollable and the tiles tappable in Jest.
      .runOnJS(true);

    return Gesture.Simultaneous(pinch, pan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const board = LiquidateEngine.board(state);
  const total = board.length;
  const systems = STAR_SYSTEM_ORDER.filter(
    (s) => systemMembers(state.config.mode, s).length > 0,
  );

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader
        title="Full board"
        sub={`${state.config.mode === 'quick' ? 'Quick' : 'Full'} match · ${total} tiles`}
        onBack={onBack}
      />

      <View style={{ alignItems: 'center', paddingBottom: 14 }}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={zoomStyle}>
            <LiquidateBoard
              state={state}
              placed={placed}
              size={size}
              youSeat={youSeat}
              activeTile={activeTile}
              variant="detail"
              onSelectTile={setSelected}
            >
              <BoardWellCaption
                title={selected !== null ? board[selected]!.name : 'Full board'}
                sub={`${state.players.filter((p) => !p.bankrupt).length} players · ${roundLabel}`}
              />
            </LiquidateBoard>
          </Animated.View>
        </GestureDetector>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }}>
        <ViewSection>System control</ViewSection>
        <View style={{ gap: 9 }}>
          {systems.map((system) => {
            const members = systemMembers(state.config.mode, system);
            const owners = members.map((id) => state.tiles[id]!.ownerId);
            const holder = owners.every((o) => o !== null && o === owners[0])
              ? state.players.find((p) => p.id === owners[0])
              : undefined;
            const claimed = owners.filter((o) => o !== null).length;
            // Only a complete set is "control". Anything short of it shows the
            // count instead of a name: one player holding one of three tiles is
            // not the holder, and calling it "split" overstates it the other way.
            const partial = claimed > 0 && !holder;

            return (
              <View key={system} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 3,
                    backgroundColor: systemColor(system),
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{ width: 62, fontFamily: FONTS.bodyBold, fontSize: 12, color: P.ink }}
                >
                  {system[0]!.toUpperCase() + system.slice(1)}
                </Text>
                <View
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    overflow: 'hidden',
                    backgroundColor: P.track,
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round((claimed / members.length) * 100)}%`,
                      height: '100%',
                      borderRadius: 4,
                      backgroundColor: systemColor(system),
                    }}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    minWidth: 46,
                    textAlign: 'right',
                    fontFamily: FONTS.bodyBold,
                    fontSize: 11,
                    color: holder
                      ? seatColor(state.players.findIndex((p) => p.id === holder.id))
                      : partial
                        ? P.dim
                        : P.soft,
                  }}
                >
                  {holder ? holder.name : partial ? `${claimed}/${members.length}` : '—'}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
