'use client';

import React from 'react';
import {
  LiquidateEngine,
  buildInspector,
  formatCredits,
  type LiquidateGameState,
  type LiquidatePlayer,
} from '@gameexplorer/shared';
import { Dice } from './Dice';
import { TileInspector } from './TileInspector';
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
  /** A piece is still walking, so the tile it is heading for is not news yet. */
  moving: boolean;
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
  moving,
}: BoardWellProps) {
  const you = state.players.find((p) => p.id === youId) ?? null;

  /**
   * The inspector narrates the CURRENT turn, not just your own square.
   *
   * Pinned to the followed seat it showed your tile all through a bot's turn, so
   * a bot could land on a property, pause on it, and buy it while the centre of
   * the board still described where *you* were standing — the pause had nothing
   * to look at. Following the actor means "their card" is a real thing the
   * player sees. Falls back to your square between turns.
   */
  const focusPlayer = actingPlayer ?? you;
  const browsing = selectedTile !== null && selectedTile !== focusPlayer?.tile;
  const focusTile = selectedTile ?? focusPlayer?.tile ?? null;

  // While a piece is in transit the card for its destination has not been
  // "landed on" yet, so showing it spoils the move. A tile the player opened
  // themselves is exempt — that is their request, not the game's news.
  const hideCard = moving && !browsing;

  if (focusTile === null) return null;

  const tile = LiquidateEngine.board(state)[focusTile];
  const theirs = focusPlayer !== null && focusPlayer.id !== youId;
  const kicker = browsing
    ? 'Inspecting'
    : state.phase === 'buy-decision'
      ? theirs
        ? `${focusPlayer.name} landed on`
        : 'You landed on'
      : focusPlayer
        ? `${focusPlayer.name} is at`
        : 'On the loop';

  // Rent ladders and set progress are read from the FOLLOWED seat's point of
  // view even while watching someone else — "you hold 2 of 3" is the useful
  // line, not a restatement of what the bot already knows.

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

      {hideCard ? (
        <p
          className="shrink-0 font-semibold uppercase"
          style={{ fontSize: 11, letterSpacing: '0.08em', color: LQ.soft }}
          aria-live="polite"
        >
          {actingPlayer ? `${actingPlayer.name} is moving…` : 'Moving…'}
        </p>
      ) : (
        <TileInspector
          data={data}
          accent={tileAccent(tile)}
          compact={!roomy}
          className="min-h-0 w-full max-w-[560px]"
        />
      )}

      {browsing && !hideCard && (
        <button
          type="button"
          onClick={onClearSelection}
          className="shrink-0 font-semibold hover:underline"
          style={{ fontSize: 11, color: LQ.dim }}
        >
          ← Back to the board
        </button>
      )}
    </div>
  );
}
