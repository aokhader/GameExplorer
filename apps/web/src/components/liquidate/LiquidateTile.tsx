'use client';

import React from 'react';
import {
  LIQUIDATE_BOARD_COLORS,
  LIQUIDATE_DECK_STYLE,
  LIQUIDATE_SEAT_COLORS,
  LIQUIDATE_SYSTEM_COLORS,
} from '@gameexplorer/ui';
import { MAX_COLONY_LEVEL, type LiquidateTile as Tile, type TileOwnership } from '@gameexplorer/shared';
import { cn } from '@/lib/utils';
import { edgeOf, isCornerIndex, type BoardEdge } from './geometry';
import { ShipToken } from './ShipToken';

/** Glyphs for the non-property tiles. Original marks, not any existing game's. */
const CORNER_GLYPH: Record<string, string> = {
  'home-station': '⌂',
  impound: '⛒',
  drift: '≈',
  'contraband-scan': '◎',
  tariff: '⌁',
  'warp-gate': '◇',
  utility: '⚡',
};

/** Which side of the tile the system colour band hugs, so bands face inward. */
const BAND_SIDE: Record<BoardEdge, string> = {
  bottom: 'top-0 left-0 right-0 h-[18%]',
  top: 'bottom-0 left-0 right-0 h-[18%]',
  left: 'top-0 bottom-0 right-0 w-[18%]',
  right: 'top-0 bottom-0 left-0 w-[18%]',
};

export interface LiquidateTileProps {
  tile: Tile;
  owned: TileOwnership;
  /** Tiles per side, for corner/edge detection. */
  n: number;
  /** Seat indices of players standing here. */
  occupants: number[];
  /** Highlight because it is the acting player's current square. */
  active?: boolean;
  onSelect?: (tileId: number) => void;
}

/**
 * One tile on the ring. Cells are uniform squares (a deliberate departure from
 * the tall-thin proportions of the classic board), so the colour band plus a
 * two-line label has to carry identification at ~50px.
 */
export const LiquidateTileCell = React.memo(function LiquidateTileCell({
  tile,
  owned,
  n,
  occupants,
  active,
  onSelect,
}: LiquidateTileProps) {
  const corner = isCornerIndex(tile.id, n);
  const edge = edgeOf(tile.id, n);
  const systemColor = tile.kind === 'planet' ? LIQUIDATE_SYSTEM_COLORS[tile.system] : null;
  const deck =
    tile.kind === 'anomaly' || tile.kind === 'federation' ? LIQUIDATE_DECK_STYLE[tile.kind] : null;
  const price = 'price' in tile ? tile.price : null;
  const ownerSeat = owned.ownerId ? Number(owned.ownerId.replace(/\D/g, '')) - 1 : -1;

  const glyph = deck?.glyph ?? CORNER_GLYPH[tile.kind] ?? null;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(tile.id) : undefined}
      title={`${tile.name}${price !== null ? ` — ₡${price}` : ''}`}
      aria-label={`${tile.name}${price !== null ? `, price ${price} credits` : ''}${
        owned.ownerId ? ', owned' : ''
      }`}
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden',
        'border text-center transition-colors',
        onSelect ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
      )}
      style={{
        background: corner ? LIQUIDATE_BOARD_COLORS.corner : LIQUIDATE_BOARD_COLORS.tile,
        borderColor: active ? LIQUIDATE_BOARD_COLORS.activeRing : LIQUIDATE_BOARD_COLORS.border,
        boxShadow: active ? `inset 0 0 0 2px ${LIQUIDATE_BOARD_COLORS.activeRing}` : undefined,
      }}
    >
      {/* System colour band, rotated to face the middle of the board. */}
      {systemColor && (
        <span
          className={cn('absolute', BAND_SIDE[edge])}
          style={{ background: systemColor }}
          aria-hidden="true"
        />
      )}

      {/* Owner stripe — a thin bar in the owner's seat colour. */}
      {ownerSeat >= 0 && (
        <span
          className="absolute inset-x-0 bottom-0 h-[7%]"
          style={{
            background:
              LIQUIDATE_SEAT_COLORS[ownerSeat % LIQUIDATE_SEAT_COLORS.length] ?? '#ffffff',
          }}
          aria-hidden="true"
        />
      )}

      {/* Mortgaged wash. */}
      {owned.mortgaged && (
        <span
          className="absolute inset-0"
          style={{ background: LIQUIDATE_BOARD_COLORS.mortgaged }}
          aria-hidden="true"
        />
      )}

      <span className="relative z-10 flex flex-col items-center gap-[1px] px-[2px] leading-none">
        {glyph && (
          <span
            className="text-[max(9px,0.7vw)]"
            style={{ color: deck?.base ?? '#9aa6bd' }}
            aria-hidden="true"
          >
            {glyph}
          </span>
        )}
        <span className="text-[max(6px,0.46vw)] font-medium text-fg/90 line-clamp-2 break-words">
          {tile.name}
        </span>
        {price !== null && (
          <span className="text-[max(6px,0.42vw)] text-fg-muted tabular-nums">₡{price}</span>
        )}
        {/* Colony pips; a filled ring marks the megastructure. */}
        {owned.level > 0 && (
          <span className="flex items-center gap-[1px]" aria-hidden="true">
            {owned.level === MAX_COLONY_LEVEL ? (
              <span className="text-[max(7px,0.5vw)] text-accent">★</span>
            ) : (
              Array.from({ length: owned.level }, (_, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full"
                  style={{ width: 3, height: 3, background: '#cda43f' }}
                />
              ))
            )}
          </span>
        )}
      </span>

      {/* Ships, laid side by side so several on one tile stay countable. */}
      {occupants.length > 0 && (
        <span className="absolute bottom-[8%] left-0 right-0 z-20 flex flex-wrap justify-center gap-[1px]">
          {occupants.map((seat) => (
            <ShipToken
              key={seat}
              seat={seat}
              size={occupants.length > 3 ? 9 : 13}
              active={active}
            />
          ))}
        </span>
      )}
    </button>
  );
});
