import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LIQUIDATE_BOARD_COLORS, useThemeName } from '@gameexplorer/ui';
import { useSettings } from '@/providers/SettingsProvider';
import type { RingGeometry } from './boardGeom';

/** One pulse leg; the design's ring breathes on a 1.8s round trip. */
const PULSE_MS = 900;

export interface BoardOverlayProps {
  geom: RingGeometry;
  /** Tile the followed seat is standing on, or `null` to draw nothing. */
  tile: number | null;
}

/**
 * The ring's animated singletons, drawn over the tiles.
 *
 * These are here rather than on `LiquidateTileCell` for two reasons. Only one
 * tile is ever active, so forty-four tiles carrying their own shared values
 * would be ~90 UI-thread animations restarting on every state change. And the
 * design's pulse animates a box-shadow *spread*, which is not an animatable
 * value on native at all — a scaling, fading border reproduces the same read.
 */
export function BoardOverlay({ geom, tile }: BoardOverlayProps) {
  // `useSettings` re-renders on theme change too, so no `useThemeName` needed —
  // but the tokens below are still live views and must be read during render.
  useThemeName();
  const { reducedMotion } = useSettings();

  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion || tile === null) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reducedMotion, tile, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 1 - pulse.value * 0.65,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  if (tile === null) return null;

  const { x, y } = geom.tileXY(tile);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', inset: 0 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - 2,
            top: y - 2,
            width: geom.cellPx + 4,
            height: geom.cellPx + 4,
            borderRadius: Math.max(5, Math.round(geom.cellPx * 0.14)) + 2,
            borderWidth: 2,
            borderColor: LIQUIDATE_BOARD_COLORS.activeRing,
          },
          ringStyle,
        ]}
      />
    </View>
  );
}

/*
 * The design pairs this ring with a pulsing dot in the centre of the tile, and
 * that dot is deliberately NOT reproduced.
 *
 * In a static mock the dot IS the player marker — there are no pieces. Here the
 * token layer draws every ship, with a halo on the followed seat, so a second
 * marker on the same square is not extra information: at 30% of a 25pt cell it
 * rendered as an opaque blob sitting on top of the ship it was duplicating.
 * The ring marks the tile; the tokens mark the players.
 */
