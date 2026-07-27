'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS } from '@gameexplorer/ui';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { Button, Modal } from '@/components/ui';

export interface AuctionModalProps {
  state: LiquidateGameState;
  /** True when the player who must bid is a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
}

/**
 * Live auction for a declined tile.
 *
 * Blocking and non-dismissable: the engine parks the game in the `auction` phase
 * until the bidding resolves, so letting the dialog close would strand the board
 * with no visible way to continue.
 */
export function AuctionModal({ state, humanTurn, dispatch }: AuctionModalProps) {
  const auction = state.pendingAuction;
  const bidderId = auction ? auction.bidders[auction.turnIndex] : null;
  const bidder = state.players.find((p) => p.id === bidderId) ?? null;
  const [amount, setAmount] = React.useState(0);

  const minBid = (auction?.highestBid ?? 0) + 1;

  // Re-arm the input whenever the standing bid or the bidder changes.
  React.useEffect(() => {
    setAmount(minBid);
  }, [minBid, bidderId]);

  if (!auction || !bidder) return null;
  const tile = LiquidateEngine.board(state)[auction.tileId];
  const leader = state.players.find((p) => p.id === auction.highestBidderId) ?? null;
  const maxBid = bidder.credits;

  return (
    <Modal
      open
      onClose={() => undefined}
      dismissable={false}
      size="sm"
      title={`Auction — ${tile.name}`}
      footer={
        humanTurn ? (
          <>
            <Button variant="secondary" onClick={() => dispatch({ type: 'pass-bid' })}>
              Pass
            </Button>
            <Button
              disabled={amount < minBid || amount > maxBid}
              onClick={() => dispatch({ type: 'bid', amount })}
            >
              Bid {formatCredits(amount)}
            </Button>
          </>
        ) : (
          <span className="text-xs text-fg-muted">{bidder.name} is deciding…</span>
        )
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-fg-muted">
          List price {formatCredits(isOwnable(tile) ? tile.price : 0)}. Nobody bought it, so it
          goes to the highest bidder.
        </p>

        <div className="rounded-lg border border-border bg-surface-muted/40 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-fg-muted">Standing bid</span>
            <span className="tabular-nums font-medium text-fg">
              {auction.highestBid > 0 ? formatCredits(auction.highestBid) : '—'}
            </span>
          </div>
          {leader && (
            <div className="mt-0.5 text-xs text-fg-muted">Leading: {leader.name}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background:
                LIQUIDATE_SEAT_COLORS[
                  state.players.indexOf(bidder) % LIQUIDATE_SEAT_COLORS.length
                ],
            }}
            aria-hidden="true"
          />
          <span className="text-fg">
            <strong>{bidder.name}</strong> to bid
          </span>
          <span className="ml-auto text-xs text-fg-muted tabular-nums">
            has {formatCredits(bidder.credits)}
          </span>
        </div>

        {humanTurn && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">
              Your bid (min {formatCredits(minBid)}, max {formatCredits(maxBid)})
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={minBid}
              max={maxBid}
              value={amount}
              onChange={(e) => setAmount(Math.floor(Number(e.target.value) || 0))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-fg outline-none focus:border-accent"
            />
          </label>
        )}

        <p className="text-xs text-fg-muted">
          {auction.bidders.length} still in the running.
        </p>
      </div>
    </Modal>
  );
}
