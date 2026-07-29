'use client';

import React from 'react';
import {
  LiquidateEngine,
  formatCredits,
  type LiquidateGameState,
  type LiquidatePlayer,
} from '@gameexplorer/shared';
import { Dice } from './Dice';
import { TileInspector } from './TileInspector';
import { buildInspector } from './inspector';
import { LQ, seatColor, tileAccent } from './theme';

export interface BoardWellProps {
  state: LiquidateGameState;
  actingPlayer: LiquidatePlayer | null;
  /** Seat this device is following — whose location the inspector defaults to. */
  youId: string | null;
  humanTurn: boolean;
  /** A tile the player clicked, which takes precedence over their own square. */
  selectedTile: number | null;
  /** Clear the selection and fall back to the followed seat's square. */
  onClearSelection: () => void;
  /** Enough room for the full rent ladder — false on a small board. */
  roomy: boolean;
}

/**
 * The middle of the ring: the dice and the tile inspector.
 *
 * The inspector follows the player rather than needing to be opened — it shows
 * whatever square the followed seat is standing on, and switches to any tile
 * clicked on the loop. That is what lets the board answer "what is this tile?"
 * without a dialog covering it, which is the whole point of putting it here.
 */
export function BoardWell({
  state,
  actingPlayer,
  youId,
  humanTurn,
  selectedTile,
  onClearSelection,
  roomy,
}: BoardWellProps) {
  const you = state.players.find((p) => p.id === youId) ?? null;
  const browsing = selectedTile !== null && selectedTile !== you?.tile;
  const focusTile = selectedTile ?? you?.tile ?? null;

  if (focusTile === null) return null;

  const tile = LiquidateEngine.board(state)[focusTile];
  const kicker = browsing
    ? 'Inspecting'
    : state.phase === 'buy-decision'
      ? 'You landed on'
      : you
        ? `${you.name} is at`
        : 'On the loop';

  const data = buildInspector(state, focusTile, youId, kicker);

  return (
    <div className="flex h-full w-full min-h-0 flex-col items-center justify-center gap-3">
      <div className="flex shrink-0 items-center gap-3">
        <Dice dice={state.dice} rolling={!humanTurn && state.phase === 'awaiting-roll'} />
        {actingPlayer && actingPlayer.id !== youId && (
          <div className="min-w-0 font-semibold" style={{ fontSize: 11, color: LQ.dim }}>
            <span
              className="mr-1 inline-block align-middle"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: seatColor(state.players.indexOf(actingPlayer)),
              }}
              aria-hidden="true"
            />
            <span style={{ color: LQ.ink }}>{actingPlayer.name}</span> to move ·{' '}
            {formatCredits(actingPlayer.credits)}
          </div>
        )}
      </div>

      <TileInspector
        data={data}
        accent={tileAccent(tile)}
        compact={!roomy}
        className="min-h-0 w-full max-w-[560px]"
      />

      {browsing && (
        <button
          type="button"
          onClick={onClearSelection}
          className="shrink-0 font-semibold hover:underline"
          style={{ fontSize: 11, color: LQ.dim }}
        >
          ← Back to your square
        </button>
      )}
    </div>
  );
}
