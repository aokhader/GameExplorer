import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LiquidateEngine, type LiquidateGameState } from '@gameexplorer/shared';
import { LIQUIDATE_BOARD_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { LiquidateTileCell } from './LiquidateTile';
import { BoardOverlay } from './BoardOverlay';
import { TokenLayer } from './TokenLayer';
import { ringGeometry } from './boardGeom';
import type { PlacedToken } from '@gameexplorer/client/liquidate/useLiquidateWalk';

export interface LiquidateBoardProps {
  state: LiquidateGameState;
  placed: Record<string, PlacedToken>;
  /** Board edge in px — the caller measures the region and decides. */
  size: number;
  /** Seat this device follows. */
  youSeat: number | null;
  /** Tile the pulse marks. */
  activeTile: number | null;
  /** Rendered in the open middle of the loop. */
  children?: React.ReactNode;
  /**
   * `overview` makes the whole ring one button — the home screen's small board,
   * where 28 nested pressables inside a pressable resolve unpredictably on
   * Android and there is nothing to tap individually anyway. `detail` gives each
   * tile its own button, which is what a 44-tile ring needs for VoiceOver.
   */
  variant: 'overview' | 'detail';
  onPressBoard?: () => void;
  onSelectTile?: (tileId: number) => void;
  accessibilityLabel?: string;
}

/**
 * The perimeter ring.
 *
 * Absolutely positioned rather than a flex grid: RN has no CSS grid, and every
 * other board in this app already pushes absolute cells. All three layers take
 * their numbers from `ringGeometry` so they cannot disagree by a pixel.
 */
function LiquidateBoardInner({
  state,
  placed,
  size,
  youSeat,
  activeTile,
  children,
  variant,
  onPressBoard,
  onSelectTile,
  accessibilityLabel,
}: LiquidateBoardProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const board = LiquidateEngine.board(state);
  const gap = variant === 'overview' ? 4 : 5;
  const geom = ringGeometry(size, board.length, gap);

  const cells = board.map((tile, index) => {
    const owned = state.tiles[index]!;
    const ownerSeat =
      owned.ownerId === null ? null : state.players.findIndex((p) => p.id === owned.ownerId);
    const { x, y } = geom.tileXY(index);
    const corner =
      index === 0 || index === geom.n - 1 || index === 2 * geom.n - 2 || index === 3 * geom.n - 3;

    const cell = (
      <LiquidateTileCell
        tile={tile}
        owned={owned}
        ownerSeat={ownerSeat === -1 ? null : ownerSeat}
        size={geom.cellPx}
        corner={corner}
      />
    );

    const box = {
      position: 'absolute' as const,
      left: x,
      top: y,
      width: geom.cellPx,
      height: geom.cellPx,
    };

    if (variant === 'overview') {
      return (
        <View key={index} pointerEvents="none" style={box}>
          {cell}
        </View>
      );
    }

    const ownerName = owned.ownerId
      ? (state.players.find((p) => p.id === owned.ownerId)?.name ?? 'someone')
      : null;
    const colonies = tile.kind === 'planet' && owned.level > 0 ? `, ${owned.level} colonies` : '';

    return (
      <Pressable
        key={index}
        onPress={() => onSelectTile?.(index)}
        accessibilityRole="button"
        accessibilityLabel={
          ownerName
            ? `${tile.name}, held by ${ownerName}${colonies}${owned.mortgaged ? ', mortgaged' : ''}`
            : `${tile.name}, unclaimed`
        }
        style={box}
      >
        {cell}
      </Pressable>
    );
  });

  const ring = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: LIQUIDATE_BOARD_COLORS.frame,
      }}
    >
      {cells}

      {/* The open middle. Sits above the cells so its content is never clipped
          by a neighbouring tile's rounded corner. */}
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: geom.well.x,
          top: geom.well.y,
          width: geom.well.size,
          height: geom.well.size,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
        }}
      >
        {children}
      </View>

      <BoardOverlay geom={geom} tile={activeTile} />
      <TokenLayer players={state.players} placed={placed} geom={geom} youSeat={youSeat} />
    </View>
  );

  if (variant === 'detail') return ring;

  return (
    <Pressable
      onPress={onPressBoard}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Open the full board'}
    >
      {ring}
    </Pressable>
  );
}

export const LiquidateBoard = React.memo(LiquidateBoardInner);

/** The ring's centre caption — the design's "LIQUIDATE / {title} / {sub}" stack. */
export function BoardWellCaption({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <View style={{ alignItems: 'center', gap: 5 }}>
      <Text
        style={{
          fontFamily: FONTS.bodyBold,
          fontSize: 9,
          letterSpacing: 1.3,
          color: LIQUIDATE_BOARD_COLORS.tileFgMuted,
        }}
      >
        LIQUIDATE
      </Text>
      <Text
        numberOfLines={2}
        style={{
          fontFamily: FONTS.display,
          fontSize: 20,
          textAlign: 'center',
          color: LIQUIDATE_BOARD_COLORS.tileFg,
        }}
      >
        {title}
      </Text>
      {sub && (
        <Text
          style={{
            fontFamily: FONTS.bodySemi,
            fontSize: 10,
            color: LIQUIDATE_BOARD_COLORS.tileFgMuted,
          }}
        >
          {sub}
        </Text>
      )}
      {children}
    </View>
  );
}
