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

/**
 * Board surfaces, read from the `--c-liquidate-*` variables globals.css declares
 * per theme (Arcade's blue-slate board, Cozy's wooden one), with the shared token
 * as the fallback. Mobile reads LIQUIDATE_BOARD_COLORS directly — it has no themes.
 */
const BOARD = {
  tile:       `var(--c-liquidate-tile, ${LIQUIDATE_BOARD_COLORS.tile})`,
  corner:     `var(--c-liquidate-corner, ${LIQUIDATE_BOARD_COLORS.corner})`,
  border:     `var(--c-liquidate-border, ${LIQUIDATE_BOARD_COLORS.border})`,
  activeRing: `var(--c-liquidate-active-ring, ${LIQUIDATE_BOARD_COLORS.activeRing})`,
  mortgaged:  `var(--c-liquidate-mortgaged, ${LIQUIDATE_BOARD_COLORS.mortgaged})`,
};

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
  bottom: 'top-0 left-0 right-0 h-[20%]',
  top: 'bottom-0 left-0 right-0 h-[20%]',
  left: 'top-0 bottom-0 right-0 w-[20%]',
  right: 'top-0 bottom-0 left-0 w-[20%]',
};

/** Padding that keeps the label clear of the inward-facing colour band. */
const LABEL_INSET: Record<BoardEdge, string> = {
  bottom: 'pt-[20%]',
  top: 'pb-[20%]',
  left: 'pr-[20%]',
  right: 'pl-[20%]',
};

export interface LiquidateTileProps {
  tile: Tile;
  owned: TileOwnership;
  /** Tiles per side, for corner/edge detection. */
  n: number;
  /** Measured edge length of this cell in px — drives every type size below. */
  cellPx: number;
  /** Seat indices of players standing here. */
  occupants: number[];
  /** Highlight because it is the acting player's current square. */
  active?: boolean;
  /** Seat index of the player this device is following, when standing here. */
  youSeat?: number;
  onSelect?: (tileId: number) => void;
}

/**
 * One tile on the ring. Cells are uniform squares (a deliberate departure from
 * the tall-thin proportions of the classic board), so the colour band plus a
 * two-line label has to carry identification.
 *
 * Type is sized from the **measured** cell rather than from viewport units. The
 * viewport-unit version collapsed to its 6px floor on a 68px cell, which is the
 * main reason the board could not be read at all.
 */
export const LiquidateTileCell = React.memo(function LiquidateTileCell({
  tile,
  owned,
  n,
  cellPx,
  occupants,
  active,
  youSeat,
  onSelect,
}: LiquidateTileProps) {
  const corner = isCornerIndex(tile.id, n);
  const edge = edgeOf(tile.id, n);
  const systemColor = tile.kind === 'planet' ? LIQUIDATE_SYSTEM_COLORS[tile.system] : null;
  const deck =
    tile.kind === 'anomaly' || tile.kind === 'federation' ? LIQUIDATE_DECK_STYLE[tile.kind] : null;
  const price = 'price' in tile ? tile.price : null;
  const ownerSeat = owned.ownerId ? Number(owned.ownerId.replace(/\D/g, '')) - 1 : -1;
  const ownerColor =
    ownerSeat >= 0
      ? (LIQUIDATE_SEAT_COLORS[ownerSeat % LIQUIDATE_SEAT_COLORS.length] ?? '#ffffff')
      : null;

  const glyph = deck?.glyph ?? CORNER_GLYPH[tile.kind] ?? null;
  const youHere = youSeat !== undefined;

  // A single scale factor keeps the whole tile in proportion at any board size.
  const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));
  const nameSize = clamp(8, cellPx * 0.15, 14);
  const priceSize = clamp(7, cellPx * 0.13, 12);
  const glyphSize = clamp(10, cellPx * 0.26, 22);
  const shipSize = clamp(9, cellPx * (occupants.length > 2 ? 0.22 : 0.32), 22);

  // Below roughly a phone-sized cell there is only room for one line, and the
  // name is what identifies the square — the price is in the deed card either
  // way, so it is the first thing to go.
  const showPrice = price !== null && cellPx >= 46;
  const showGlyph = Boolean(glyph) && cellPx >= 34;

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(tile.id) : undefined}
      title={`${tile.name}${price !== null ? ` — ₡${price}` : ''}`}
      aria-label={`${tile.name}${price !== null ? `, price ${price} credits` : ''}${
        owned.ownerId ? ', owned' : ''
      }${youHere ? ', your ship is here' : ''}`}
      aria-current={youHere ? 'location' : undefined}
      className={cn(
        'relative flex h-full w-full flex-col items-center justify-center overflow-hidden',
        'rounded-[3px] border text-center transition-[filter,box-shadow] duration-200',
        onSelect ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
      )}
      style={{
        background: corner ? BOARD.corner : BOARD.tile,
        borderColor: active ? BOARD.activeRing : BOARD.border,
        boxShadow: active
          ? `inset 0 0 0 2px ${BOARD.activeRing}, 0 0 12px -2px ${BOARD.activeRing}`
          : undefined,
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

      {/* Owner wash + stripe, in the owner's seat colour — who holds what has to
          be readable from the board, not only from the roster. */}
      {ownerColor && (
        <>
          <span
            className="absolute inset-0"
            style={{ background: ownerColor, opacity: 0.16 }}
            aria-hidden="true"
          />
          <span
            className="absolute inset-x-0 bottom-0"
            style={{ height: Math.max(3, cellPx * 0.07), background: ownerColor }}
            aria-hidden="true"
          />
        </>
      )}

      {/* Mortgaged wash. */}
      {owned.mortgaged && (
        <span
          className="absolute inset-0"
          style={{ background: BOARD.mortgaged }}
          aria-hidden="true"
        />
      )}

      <span
        className={cn(
          'relative z-10 flex w-full flex-col items-center gap-[2px] px-[3px] leading-tight',
          LABEL_INSET[edge],
        )}
      >
        {showGlyph && (
          <span
            style={{
              fontSize: glyphSize,
              // Fall back to the board's own muted tone, not the page's — this
              // glyph sits on a tile, which stays dark in every theme.
              color: deck?.base ?? 'var(--c-liquidate-tile-fg-muted, var(--c-fg-muted))',
              lineHeight: 1,
            }}
            aria-hidden="true"
          >
            {glyph}
          </span>
        )}
        <span
          className="line-clamp-2 w-full break-words font-semibold text-[var(--c-liquidate-tile-fg,var(--c-fg))]"
          style={{ fontSize: nameSize }}
        >
          {tile.name}
        </span>
        {showPrice && (
          <span className="tabular-nums text-[var(--c-liquidate-tile-fg-muted,var(--c-fg-muted))]" style={{ fontSize: priceSize }}>
            ₡{price}
          </span>
        )}
        {/* Colony pips; a filled star marks the megastructure. */}
        {owned.level > 0 && (
          <span className="flex items-center gap-[1px]" aria-hidden="true">
            {owned.level === MAX_COLONY_LEVEL ? (
              <span style={{ fontSize: priceSize, color: 'var(--c-accent)', lineHeight: 1 }}>★</span>
            ) : (
              Array.from({ length: owned.level }, (_, i) => (
                <span
                  key={i}
                  className="inline-block rounded-full"
                  style={{
                    width: Math.max(3, cellPx * 0.06),
                    height: Math.max(3, cellPx * 0.06),
                    background: 'var(--c-accent)',
                  }}
                />
              ))
            )}
          </span>
        )}
      </span>

      {/* Ships, laid side by side so several on one tile stay countable. */}
      {occupants.length > 0 && (
        <span className="absolute inset-x-0 bottom-[9%] z-20 flex flex-wrap justify-center gap-[1px]">
          {occupants.map((s) => (
            <ShipToken key={s} seat={s} size={shipSize} active={active} you={s === youSeat} />
          ))}
        </span>
      )}

      {/* "You are here" — a hard, animated ring that reads at a glance, kept
          distinct from the gold acting-player ring so following a bot's turn
          never loses track of your own ship. */}
      {youHere && (
        <span
          className="pointer-events-none absolute inset-0 rounded-[3px] motion-safe:animate-pulse"
          style={{
            boxShadow: `inset 0 0 0 2px ${
              LIQUIDATE_SEAT_COLORS[youSeat % LIQUIDATE_SEAT_COLORS.length]
            }`,
          }}
          aria-hidden="true"
        />
      )}
    </button>
  );
});
