'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS, LIQUIDATE_SYSTEM_COLORS } from '@finesse/ui';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
  type OwnableTile,
  type TradeOffer,
} from '@finesse/shared';
import { Button, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { AmountInput } from './AmountInput';

export interface TradeModalProps {
  open: boolean;
  onClose: () => void;
  state: LiquidateGameState;
  /** The seat building the offer — the acting player. */
  fromId: string;
  dispatch: (action: LiquidateAction) => void;
}

/** Tiles a player can put on the table: owned, and cleared of colonies. */
function tradableFor(state: LiquidateGameState, playerId: string): OwnableTile[] {
  return LiquidateEngine.board(state).filter(
    (t): t is OwnableTile =>
      isOwnable(t) && state.tiles[t.id].ownerId === playerId && state.tiles[t.id].level === 0,
  );
}

function TileToggle({
  tile,
  selected,
  onToggle,
}: {
  tile: OwnableTile;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition-colors',
        selected
          ? 'border-accent bg-accent-muted text-fg'
          : 'border-border bg-surface-alt/60 text-fg-muted hover:border-accent/50',
      )}
    >
      {tile.kind === 'planet' && (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-sm"
          style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{tile.name}</span>
      <span className="ml-auto shrink-0 tabular-nums">{formatCredits(tile.price)}</span>
    </button>
  );
}

/**
 * Build a two-sided offer: any mix of tiles and Credits each way.
 *
 * Validation stays with the engine — this only keeps the form from proposing
 * something obviously impossible (spending Credits you do not have), and surfaces
 * the engine's own rejection reason if anything else is wrong. Developed planets
 * are filtered out here because the engine refuses to trade them until the
 * colonies are sold, and showing an option that always fails is worse than
 * hiding it.
 */
export function TradeModal({ open, onClose, state, fromId, dispatch }: TradeModalProps) {
  const partners = state.players.filter((p) => p.id !== fromId && !p.bankrupt);
  const [toId, setToId] = React.useState(partners[0]?.id ?? '');
  const [offerTiles, setOfferTiles] = React.useState<number[]>([]);
  const [requestTiles, setRequestTiles] = React.useState<number[]>([]);
  const [offerCredits, setOfferCredits] = React.useState(0);
  const [requestCredits, setRequestCredits] = React.useState(0);

  // Reset the form whenever it opens or the partner changes.
  React.useEffect(() => {
    setOfferTiles([]);
    setRequestTiles([]);
    setOfferCredits(0);
    setRequestCredits(0);
  }, [toId, open]);

  React.useEffect(() => {
    if (!partners.some((p) => p.id === toId) && partners[0]) setToId(partners[0].id);
  }, [partners, toId]);

  if (!open) return null;
  const me = state.players.find((p) => p.id === fromId);
  const them = state.players.find((p) => p.id === toId);
  if (!me || !them) return null;

  const mine = tradableFor(state, fromId);
  const theirs = tradableFor(state, toId);

  const toggle = (list: number[], set: (v: number[]) => void, id: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const offer: TradeOffer = { toId, offerTiles, requestTiles, offerCredits, requestCredits };
  const empty =
    offerTiles.length === 0 &&
    requestTiles.length === 0 &&
    offerCredits === 0 &&
    requestCredits === 0;
  // Ask the engine whether this would be accepted, without applying it.
  const check = empty
    ? { valid: false, reason: 'Add something to the offer' }
    : LiquidateEngine.applyAction(state, { type: 'propose-trade', trade: offer });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Propose a trade"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!check.valid}
            onClick={() => {
              dispatch({ type: 'propose-trade', trade: offer });
              onClose();
            }}
          >
            Send offer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-muted">Trade with</span>
          {partners.map((p) => {
            const seat = state.players.indexOf(p);
            return (
              <Button
                key={p.id}
                size="sm"
                variant={p.id === toId ? 'primary' : 'secondary'}
                onClick={() => setToId(p.id)}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length] }}
                  aria-hidden="true"
                />
                {p.name}
              </Button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* You give */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              You give
            </div>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {mine.length === 0 && (
                <p className="text-xs text-fg-muted">Nothing tradable — colonies must be sold first.</p>
              )}
              {mine.map((t) => (
                <TileToggle
                  key={t.id}
                  tile={t}
                  selected={offerTiles.includes(t.id)}
                  onToggle={() => toggle(offerTiles, setOfferTiles, t.id)}
                />
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">
                Credits (you hold {formatCredits(me.credits)})
              </span>
              <AmountInput
                value={offerCredits}
                onChange={setOfferCredits}
                min={0}
                max={Math.max(0, me.credits)}
                aria-label="Credits you give"
                className="py-1.5"
              />
            </label>
          </div>

          {/* You get */}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              You get
            </div>
            <div className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
              {theirs.length === 0 && (
                <p className="text-xs text-fg-muted">{them.name} has nothing tradable.</p>
              )}
              {theirs.map((t) => (
                <TileToggle
                  key={t.id}
                  tile={t}
                  selected={requestTiles.includes(t.id)}
                  onToggle={() => toggle(requestTiles, setRequestTiles, t.id)}
                />
              ))}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-fg-muted">
                Credits ({them.name} holds {formatCredits(them.credits)})
              </span>
              <AmountInput
                value={requestCredits}
                onChange={setRequestCredits}
                min={0}
                max={Math.max(0, them.credits)}
                aria-label={`Credits ${them.name} gives`}
                className="py-1.5"
              />
            </label>
          </div>
        </div>

        {!check.valid && check.reason && (
          <p className="text-xs text-danger">{check.reason}</p>
        )}
        <p className="text-xs text-fg-muted">
          {them.name} decides whether to accept. Planets with colonies cannot be traded until the
          colonies are sold.
        </p>
      </div>
    </Modal>
  );
}
