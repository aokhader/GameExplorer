import React from 'react';
import { Text, View } from 'react-native';
import { LIQUIDATE_BOARD_COLORS, useThemeName } from '@finesse/ui';
import {
  MAX_COLONY_LEVEL,
  type LiquidateTile as Tile,
  type TileOwnership,
} from '@finesse/shared';
import { seatColor, tileAccent, tileGlyph } from './lqTheme';

export interface LiquidateTileCellProps {
  tile: Tile;
  owned: TileOwnership;
  /** Seat index of the owner, or `null` when unclaimed. */
  ownerSeat: number | null;
  /** Cell edge in px. */
  size: number;
  /** Corner tiles take the raised surface, setting them apart from the edges. */
  corner: boolean;
}

/**
 * One cell of the ring.
 *
 * Pure and animation-free on purpose. Forty-four of these re-render on every
 * engine state change, so `React.memo` has to be able to bail out — giving each
 * one its own shared values would mean ~90 UI-thread animations restarting each
 * time. The active-tile pulse and the "you" dot are singletons drawn over the
 * whole ring by `BoardOverlay` instead.
 *
 * Carries no text, matching the design: a property is its colour bar and
 * everything else is its glyph. Names, prices and rent ladders live in the sheet
 * and the standings list, which have room to render them properly — at twelve
 * tiles a side a name is ~23pt wide and would clip mid-word.
 */
function LiquidateTileCellInner({
  tile,
  owned,
  ownerSeat,
  size,
  corner,
}: LiquidateTileCellProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const accent = tileAccent(tile);
  const glyph = tileGlyph(tile);
  const hasBar = tile.kind === 'planet' || tile.kind === 'warp-gate' || tile.kind === 'utility';

  // Proportional to the cell so the 44-tile ring stays legible without a second
  // set of hand-tuned numbers: the design's 6px bar on a 25px mini cell and 8px
  // on a 36px quick cell are both ~0.23 of the edge.
  const barH = Math.max(3, Math.round(size * 0.2));
  const dot = Math.max(5, Math.round(size * 0.2));
  const glyphF = Math.max(8, Math.round(size * 0.42));

  return (
    <View
      style={{
        flex: 1,
        overflow: 'hidden',
        borderRadius: Math.max(4, Math.round(size * 0.14)),
        borderWidth: 1,
        borderColor: LIQUIDATE_BOARD_COLORS.border,
        backgroundColor: corner ? LIQUIDATE_BOARD_COLORS.corner : LIQUIDATE_BOARD_COLORS.tile,
      }}
    >
      {hasBar && <View style={{ height: barH, backgroundColor: accent }} />}

      {glyph !== '' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: glyphF, lineHeight: glyphF * 1.15, color: accent }}>{glyph}</Text>
        </View>
      )}

      {/* Colonies. The design leaves these off, but they are the whole point of
          holding a full system — without them a developed board looks identical
          to an undeveloped one. Kept to pips under the bar so no text creeps in. */}
      {tile.kind === 'planet' && owned.level > 0 && size >= 20 && (
        <View
          style={{
            position: 'absolute',
            top: barH + 2,
            left: 2,
            right: 2,
            flexDirection: 'row',
            gap: 1,
          }}
        >
          {Array.from({ length: owned.level }, (_, i) => (
            <View
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: 1.5,
                backgroundColor:
                  owned.level === MAX_COLONY_LEVEL
                    ? LIQUIDATE_BOARD_COLORS.activeRing
                    : LIQUIDATE_BOARD_COLORS.tileFg,
              }}
            />
          ))}
        </View>
      )}

      {ownerSeat !== null && (
        <View
          style={{
            position: 'absolute',
            right: 2,
            bottom: 2,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: seatColor(ownerSeat),
            borderWidth: 1,
            borderColor: LIQUIDATE_BOARD_COLORS.tile,
          }}
        />
      )}

      {owned.mortgaged && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: LIQUIDATE_BOARD_COLORS.mortgaged,
          }}
        />
      )}
    </View>
  );
}

export const LiquidateTileCell = React.memo(LiquidateTileCellInner);
