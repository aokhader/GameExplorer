'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS, LIQUIDATE_SYSTEM_COLORS } from '@gameexplorer/ui';
import {
  LiquidateEngine,
  MAX_COLONY_LEVEL,
  formatCredits,
  isOwnable,
  type LiquidateGameState,
  type LiquidatePlayer,
} from '@gameexplorer/shared';
import { Dice } from './Dice';

export interface BoardWellProps {
  state: LiquidateGameState;
  actingPlayer: LiquidatePlayer | null;
  /** Seat this device is following — whose location the plate reports. */
  youId: string | null;
  humanTurn: boolean;
  /** Opens the deed card for the tile shown. */
  onViewDeed: (tileId: number) => void;
}

/** Plain-language description of what a tile is, for the location plate. */
function describe(state: LiquidateGameState, tileId: number): string {
  const tile = LiquidateEngine.board(state)[tileId];
  const owned = state.tiles[tileId];

  if (isOwnable(tile)) {
    const owner = state.players.find((p) => p.id === owned.ownerId);
    const level =
      owned.level === MAX_COLONY_LEVEL
        ? 'megastructure'
        : owned.level > 0
          ? `${owned.level} colon${owned.level === 1 ? 'y' : 'ies'}`
          : null;
    if (!owner) return `Unclaimed · ${formatCredits(tile.price)}`;
    const suffix = owned.mortgaged ? 'mortgaged' : level;
    return `Held by ${owner.name}${suffix ? ` · ${suffix}` : ''}`;
  }

  switch (tile.kind) {
    case 'home-station':
      return `Stipend ${formatCredits(state.config.stipend)} on passing`;
    case 'impound':
      return 'Held ships wait here';
    case 'contraband-scan':
      return 'Landing here sends you to Impound';
    case 'drift':
      return 'Open space — nothing happens here';
    case 'tariff':
      return `Docking charge ${formatCredits(tile.amount)}`;
    case 'anomaly':
    case 'federation':
      return `Draw from the ${tile.name} deck`;
    default:
      return '';
  }
}

/**
 * The middle of the ring.
 *
 * Holds the dice and a **current-location plate** — the board's answer to "where
 * am I and what is this square called". The running action log used to live here
 * and is now in the sidebar: a scrolling wall of text in the middle of the board
 * buried exactly the information a player looks to the centre for.
 */
export function BoardWell({
  state,
  actingPlayer,
  youId,
  humanTurn,
  onViewDeed,
}: BoardWellProps) {
  const you = state.players.find((p) => p.id === youId) ?? null;
  const seat = you ? state.players.indexOf(you) : -1;
  const tileId = you?.tile ?? null;
  const tile = tileId !== null ? LiquidateEngine.board(state)[tileId] : null;
  const systemColor = tile?.kind === 'planet' ? LIQUIDATE_SYSTEM_COLORS[tile.system] : null;

  return (
    <div className="flex w-full max-w-[min(100%,320px)] flex-col items-center gap-3 overflow-hidden">
      <Dice dice={state.dice} rolling={!humanTurn && state.phase === 'awaiting-roll'} />

      {tile && you && (
        <button
          type="button"
          onClick={() => onViewDeed(tile.id)}
          className="w-full rounded-lg border border-border bg-surface-alt/70 px-3 py-2 text-left transition-colors hover:border-accent/60"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="text-[10px] uppercase tracking-wide text-[var(--c-liquidate-tile-fg-muted,var(--c-fg-muted))]">
              {you.name} is at
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {systemColor && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: systemColor }}
                aria-hidden="true"
              />
            )}
            <span className="truncate text-sm font-semibold text-[var(--c-liquidate-tile-fg,var(--c-fg))]">{tile.name}</span>
          </div>
          <div className="truncate text-[11px] text-[var(--c-liquidate-tile-fg-muted,var(--c-fg-muted))]">{describe(state, tile.id)}</div>
        </button>
      )}

      {actingPlayer && actingPlayer.id !== youId && (
        <p className="text-center text-[11px] text-[var(--c-liquidate-tile-fg-muted,var(--c-fg-muted))]">
          <span className="font-medium text-[var(--c-liquidate-tile-fg,var(--c-fg))]">{actingPlayer.name}</span> to move ·{' '}
          {formatCredits(actingPlayer.credits)}
        </p>
      )}
    </div>
  );
}
