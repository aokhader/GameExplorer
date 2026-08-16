import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LIQUIDATE_BOARD_COLORS, PlayerToken, useThemeName } from '@gameexplorer/ui';
import { LIQUIDATE_TIMING, type LiquidatePlayer } from '@gameexplorer/shared';
import { useSettings } from '@/providers/SettingsProvider';
import { seatColor } from './lqTheme';
import type { RingGeometry } from './boardGeom';
import type { PlacedToken } from '@gameexplorer/client/liquidate/useLiquidateWalk';

export interface TokenLayerProps {
  players: LiquidatePlayer[];
  /** Where each piece is shown, from `useLiquidateWalk`. */
  placed: Record<string, PlacedToken>;
  geom: RingGeometry;
  /** Seat this device follows — gets the halo. */
  youSeat: number | null;
}

/**
 * Every ship on the board, absolutely positioned over the ring.
 *
 * Positions are driven by `useLiquidateWalk`, which is the single source of
 * truth for where a piece *is* as opposed to where the engine has already put
 * it. This component only tweens between those.
 */
export function TokenLayer({ players, placed, geom, youSeat }: TokenLayerProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const active = players.filter((p) => !p.bankrupt);
  const tokenW = Math.max(7, Math.round(geom.cellPx * 0.34));

  // Pieces sharing a tile fan out instead of stacking — on a 44-tile board with
  // six seats, several ships share a square constantly and a plain stack looks
  // like one player.
  const perTile = new Map<number, string[]>();
  for (const p of active) {
    const tile = placed[p.id]?.tile ?? p.tile;
    const list = perTile.get(tile) ?? [];
    list.push(p.id);
    perTile.set(tile, list);
  }

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      {active.map((p) => {
        const spot = placed[p.id] ?? { tile: p.tile, jumped: false };
        const seat = players.findIndex((q) => q.id === p.id);
        const sharing = perTile.get(spot.tile) ?? [p.id];
        const slot = sharing.indexOf(p.id);

        return (
          <Ship
            key={p.id}
            geom={geom}
            spot={spot}
            slot={slot}
            sharing={sharing.length}
            tokenW={tokenW}
            color={seatColor(seat)}
            you={seat === youSeat}
            name={p.name}
          />
        );
      })}
    </View>
  );
}

function Ship({
  geom,
  spot,
  slot,
  sharing,
  tokenW,
  color,
  you,
  name,
}: {
  geom: RingGeometry;
  spot: PlacedToken;
  slot: number;
  sharing: number;
  tokenW: number;
  color: string;
  you: boolean;
  name: string;
}) {
  const { reducedMotion } = useSettings();

  const { x, y } = geom.tileXY(spot.tile);
  // Fan across the cell's width, centred on however many are sharing it.
  const spread = Math.min(tokenW * 0.7, geom.cellPx / Math.max(sharing, 1));
  const targetX = x + geom.cellPx / 2 - tokenW / 2 + (slot - (sharing - 1) / 2) * spread;
  const targetY = y + geom.cellPx / 2 - tokenW * 0.62;

  // Left/top stay at zero and the transform carries everything — animating
  // layout props would run on the JS thread and drop frames mid-walk.
  const tx = useSharedValue(targetX);
  const ty = useSharedValue(targetY);
  const hop = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) {
      tx.value = targetX;
      ty.value = targetY;
      return;
    }
    const duration = spot.jumped ? LIQUIDATE_TIMING.jumpMs : LIQUIDATE_TIMING.stepMs;
    const easing = spot.jumped ? Easing.bezier(0.4, 0, 0.2, 1) : Easing.linear;
    tx.value = withTiming(targetX, { duration, easing });
    ty.value = withTiming(targetY, { duration, easing });
  }, [targetX, targetY, spot.jumped, reducedMotion, tx, ty]);

  // A small lift on each walked step, so a multi-tile move reads as a series of
  // hops rather than one slide. Teleports do not hop — they glide.
  useEffect(() => {
    if (reducedMotion || spot.jumped) {
      cancelAnimation(hop);
      hop.value = 0;
      return;
    }
    const half = LIQUIDATE_TIMING.stepMs / 2;
    hop.value = withSequence(
      withTiming(-tokenW * 0.22, { duration: half, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: half, easing: Easing.in(Easing.quad) }),
    );
    return () => cancelAnimation(hop);
  }, [targetX, targetY, spot.jumped, reducedMotion, tokenW, hop]);

  useEffect(
    () => () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(hop);
    },
    [tx, ty, hop],
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { translateY: hop.value },
    ],
  }));

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]}>
      <PlayerToken
        color={color}
        outline={LIQUIDATE_BOARD_COLORS.tile}
        width={tokenW}
        you={you}
        title={name}
      />
    </Animated.View>
  );
}
