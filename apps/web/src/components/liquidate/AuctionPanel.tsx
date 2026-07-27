'use client';

import React from 'react';
import { LIQUIDATE_SEAT_COLORS, LIQUIDATE_SYSTEM_COLORS } from '@gameexplorer/ui';
import {
  LiquidateEngine,
  formatCredits,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
} from '@gameexplorer/shared';
import { Button } from '@/components/ui';
import { AmountInput } from './AmountInput';

export interface AuctionPanelProps {
  state: LiquidateGameState;
  /** True when the player who must bid is a human at this device. */
  humanTurn: boolean;
  dispatch: (action: LiquidateAction) => void;
  /** Opens the deed card for the lot being sold. */
  onViewDeed?: (tileId: number) => void;
}

/** Raises offered as one-tap chips, so most bids need no typing at all. */
const QUICK_STEPS = [10, 25, 50, 100] as const;

/**
 * Live auction for a declined tile.
 *
 * Sits in the sidebar rail rather than in a modal: the engine parks the game in
 * the `auction` phase until bidding resolves, and a centred dialog spent that
 * whole time covering the board the player is trying to value the lot against.
 */
export function AuctionPanel({ state, humanTurn, dispatch, onViewDeed }: AuctionPanelProps) {
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
  const listPrice = isOwnable(tile) ? tile.price : 0;
  const seat = state.players.indexOf(bidder);
  const canBid = amount >= minBid && amount <= maxBid;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {tile.kind === 'planet' && (
          <span
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ background: LIQUIDATE_SYSTEM_COLORS[tile.system] }}
            aria-hidden="true"
          />
        )}
        <span className="text-sm font-semibold text-fg">Auction · {tile.name}</span>
        {onViewDeed && (
          <button
            type="button"
            onClick={() => onViewDeed(auction.tileId)}
            className="ml-auto shrink-0 text-xs text-info hover:underline"
          >
            View deed
          </button>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-sm">
        <div className="min-w-0">
          <div className="text-xs text-fg-muted">Standing bid</div>
          <div className="truncate text-xs text-fg-muted">
            {leader ? `Leading: ${leader.name}` : `List ${formatCredits(listPrice)} · no bids yet`}
          </div>
        </div>
        <span className="shrink-0 tabular-nums text-lg font-semibold text-fg">
          {auction.highestBid > 0 ? formatCredits(auction.highestBid) : '—'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ background: LIQUIDATE_SEAT_COLORS[seat % LIQUIDATE_SEAT_COLORS.length] }}
          aria-hidden="true"
        />
        <span className="truncate text-fg">
          <strong>{bidder.name}</strong> to bid
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-fg-muted">
          has {formatCredits(bidder.credits)}
        </span>
      </div>

      {humanTurn ? (
        <>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-fg-muted">
              Your bid — min {formatCredits(minBid)}, max {formatCredits(maxBid)}
            </span>
            <AmountInput
              value={amount}
              onChange={setAmount}
              min={minBid}
              max={maxBid}
              aria-label="Bid amount"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {QUICK_STEPS.map((step) => (
              <Button
                key={step}
                size="sm"
                variant="ghost"
                disabled={minBid + step > maxBid}
                onClick={() => setAmount(Math.min(maxBid, minBid + step))}
                className="border border-border"
              >
                +{step}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={maxBid < minBid}
              onClick={() => setAmount(maxBid)}
              className="border border-border"
            >
              All in
            </Button>
          </div>

          {!canBid && (
            <p className="text-xs text-fg-muted">
              {amount > maxBid
                ? `${formatCredits(amount)} is more than you hold.`
                : `Bid at least ${formatCredits(minBid)}, or pass.`}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              fullWidth
              disabled={!canBid}
              onClick={() => dispatch({ type: 'bid', amount })}
            >
              Bid {formatCredits(amount)}
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: 'pass-bid' })}>
              Pass
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-fg-muted" aria-live="polite">
          {bidder.name} is deciding…
        </p>
      )}

      <p className="text-xs text-fg-muted">{auction.bidders.length} still in the running.</p>
    </div>
  );
}
