'use client';

import React from 'react';
import { LIQUIDATE_DECK_STYLE } from '@finesse/ui';
import {
  MAX_COLONY_LEVEL,
  hasColorBar,
  isCornerIndex,
  tileMetrics,
  type LiquidateTile as Tile,
  type TileOwnership,
} from '@finesse/shared';
import { cn } from '@/lib/utils';
import { LQ, seatColor, tileAccent } from './theme';

/** Glyphs for the non-property tiles. Original marks, not any existing game's. */
const CORNER_GLYPH: Record<string, string> = {
  'home-station': '⌂',
  impound: '⊗',
  drift: '≈',
  'contraband-scan': '◎',
  tariff: '⇲',
  'warp-gate': '◇',
  utility: '⚡',
};

/** The one-line note a non-property tile carries in place of a price. */
function subLabel(tile: Tile, stipend: number): string {
  switch (tile.kind) {
    case 'home-station':
      return `Stipend ₡${stipend}`;
    case 'impound':
      return 'Passing through';
    case 'contraband-scan':
      return 'Cargo check';
    case 'drift':
      return 'Free relay';
    case 'tariff':
      return `Pay ₡${tile.amount}`;
    default:
      return '';
  }
}

export interface LiquidateTileProps {
  tile: Tile;
  owned: TileOwnership;
  /** Tiles per side, for corner detection and density. */
  n: number;
  /** Measured edge length of this cell in px — drives every metric below. */
  cellPx: number;
  /** Highlight because it is the acting player's current square. */
  active?: boolean;
  /** Seat index of the player this device is following, when standing here. */
  youSeat?: number;
  /** Currently open in the inspector. */
  selected?: boolean;
  /** Stipend for the Home Station note. */
  stipend: number;
  onSelect?: (tileId: number) => void;
}

/**
 * One tile on the ring.
 *
 * The layout is a stack, top to bottom: system colour bar → glyph → name →
 * price (or note) pushed to the base → owner swatch and colony pips → owner
 * stripe. That order is what lets a player read the loop at a glance: colour
 * answers "which system", the base stripe answers "whose", and the pips answer
 * "how developed" — none of which requires opening the tile.
 *
 * Every size comes from the MEASURED cell rather than viewport units, and the
 * lowest-value rows drop out first as cells get small (see `tileMetrics`), so
 * the name survives all the way down to a 12-per-side board on a phone.
 */
export const LiquidateTileCell = React.memo(function LiquidateTileCell({
  tile,
  owned,
  n,
  cellPx,
  active,
  youSeat,
  selected,
  stipend,
  onSelect,
}: LiquidateTileProps) {
  // A colony going up is the one board change with no other cue — no dice, no
  // token moving — so the tile announces it: the new pip pops in and the tile
  // flashes once. Level is compared against the previous RENDER, so a resumed
  // save (which arrives with colonies already built) never animates.
  const [built, setBuilt] = React.useState(false);
  const prevLevel = React.useRef(owned.level);
  React.useEffect(() => {
    const grew = owned.level > prevLevel.current;
    prevLevel.current = owned.level;
    if (!grew) return;
    setBuilt(true);
    const timer = window.setTimeout(() => setBuilt(false), 900);
    return () => window.clearTimeout(timer);
  }, [owned.level]);

  const corner = isCornerIndex(tile.id, n);
  const accent = tileAccent(tile);
  const bar = hasColorBar(tile);
  const deck =
    tile.kind === 'anomaly' || tile.kind === 'federation' ? LIQUIDATE_DECK_STYLE[tile.kind] : null;
  const price = 'price' in tile ? tile.price : null;
  const sub = subLabel(tile, stipend);
  const glyph = deck?.glyph ?? CORNER_GLYPH[tile.kind] ?? null;

  const ownerSeat = owned.ownerId ? Number(owned.ownerId.replace(/\D/g, '')) - 1 : -1;
  const ownerColor = ownerSeat >= 0 ? seatColor(ownerSeat) : null;
  const youHere = youSeat !== undefined;

  const m = tileMetrics(cellPx, n);

  return (
    <button
      type="button"
      onClick={onSelect ? () => onSelect(tile.id) : undefined}
      title={`${tile.name}${price !== null ? ` — ₡${price}` : ''}`}
      aria-label={`${tile.name}${price !== null ? `, price ${price} credits` : ''}${
        owned.ownerId ? ', owned' : ''
      }${youHere ? ', your token is here' : ''}`}
      aria-current={youHere ? 'location' : undefined}
      aria-pressed={selected}
      className={cn(
        'relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border text-left',
        'transition-[filter,box-shadow] duration-200',
        onSelect ? 'cursor-pointer hover:brightness-110' : 'cursor-default',
        built && 'lq-build-flash',
      )}
      style={
        {
          background: corner ? LQ.corner : LQ.tile,
          borderColor: selected ? LQ.accent : LQ.tileLine,
          boxShadow: selected ? `0 0 0 1px ${LQ.accent}` : undefined,
          '--lq-flash': ownerColor ?? LQ.accent,
        } as React.CSSProperties
      }
    >
      {/* System colour bar across the head of every ownable tile. */}
      {bar && (
        <span
          style={{ height: m.barH, background: accent, borderBottom: '1px solid rgba(0,0,0,.18)' }}
          aria-hidden="true"
        />
      )}

      {/* Mortgaged wash, over the face but under the labels. */}
      {owned.mortgaged && (
        <span className="absolute inset-0" style={{ background: LQ.mortgaged }} aria-hidden="true" />
      )}

      <span
        className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col"
        // Tighter left/right than top/bottom: the widest single word on the
        // board ("Contraband") only just fits a tile, and the few pixels the
        // symmetric padding was taking were enough to break it mid-word.
        style={{ padding: `${m.pad}px ${Math.max(2, m.pad * 0.6)}px`, gap: 2 }}
      >
        {m.showGlyph && glyph && (
          <span
            className="shrink-0"
            style={{ fontSize: m.glyphF, lineHeight: 1, color: accent }}
            aria-hidden="true"
          >
            {glyph}
          </span>
        )}

        <span
          className={cn(
            'min-h-0 break-words font-bold',
            m.nameLines === 2 ? 'line-clamp-2' : 'line-clamp-1',
          )}
          style={{ fontSize: m.nameF, lineHeight: 1.1, color: LQ.ink, letterSpacing: '-0.01em' }}
        >
          {tile.name}
        </span>

        {m.showPrice && price !== null && (
          <span
            className="mt-auto shrink-0 font-semibold tabular-nums"
            style={{ fontSize: m.priceF, color: LQ.dim }}
          >
            ₡{price}
          </span>
        )}
        {m.showSub && price === null && sub && (
          <span
            className="mt-auto shrink-0 truncate font-semibold uppercase"
            style={{ fontSize: m.priceF, color: LQ.soft, letterSpacing: '0.03em' }}
          >
            {sub}
          </span>
        )}

        {/* Owner swatch + one pip per colony; a star marks the megastructure. */}
        {m.showOwnerRow && ownerColor && (
          <span className="flex items-center" style={{ gap: 4, marginTop: 3 }} aria-hidden="true">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 3,
                background: ownerColor,
                boxShadow: '0 0 0 1px rgba(0,0,0,.25)',
              }}
            />
            <span className="flex" style={{ gap: 2 }}>
              {owned.level === MAX_COLONY_LEVEL ? (
                <span
                  className={built ? 'lq-pip-pop' : undefined}
                  style={{ fontSize: 9, lineHeight: 1, color: ownerColor }}
                >
                  ★
                </span>
              ) : (
                Array.from({ length: owned.level }, (_, i) => (
                  <span
                    // Only the pip that just appeared pops; the ones already
                    // standing would otherwise re-animate on every build.
                    key={i}
                    className={built && i === owned.level - 1 ? 'lq-pip-pop' : undefined}
                    style={{ width: 4, height: 7, borderRadius: 1.5, background: ownerColor, opacity: 0.9 }}
                  />
                ))
              )}
            </span>
          </span>
        )}
      </span>

      {/* Owner stripe along the base — the one ownership cue that survives at
          every board size, since the swatch row is the first thing to drop. */}
      {ownerColor && (
        <span
          className="relative z-10"
          style={{ height: Math.max(3, cellPx * 0.06), background: ownerColor }}
          aria-hidden="true"
        />
      )}

      {/* The acting player's square — a gold hairline, quieter than the
          you-are-here ring so the two never compete. */}
      {active && !youHere && (
        <span
          className="pointer-events-none absolute inset-0 rounded-lg"
          style={{ boxShadow: `inset 0 0 0 2px ${LQ.activeRing}` }}
          aria-hidden="true"
        />
      )}

      {/* "You are here" — a pulsing ring in the followed seat's colour. The
          badge only appears where there is room to read it. */}
      {youHere && (
        <>
          <span
            className="lq-you-ring pointer-events-none absolute inset-0 rounded-lg"
            style={
              {
                '--lq-ring': seatColor(youSeat),
                '--lq-ring-soft': `color-mix(in srgb, ${seatColor(youSeat)} 35%, transparent)`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
          {/* The badge sits over the middle of the tile, so it only earns its
              place where it is not covering the name it is pointing at. Below
              that the pulsing ring and the haloed token carry the marker. */}
          {cellPx >= 76 && (
            <span
              className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-bold uppercase"
              style={{
                fontSize: 7,
                letterSpacing: '0.05em',
                color: LQ.accentInk,
                background: LQ.accent,
                padding: '2px 4px',
                borderRadius: 4,
              }}
              aria-hidden="true"
            >
              You are here
            </span>
          )}
        </>
      )}
    </button>
  );
});
